import { createClient } from '@supabase/supabase-js'

const HELENA_BASE = 'https://api.wts.chat'
const CLINICORP_BASE = 'https://api.clinicorp.com/rest/v1'

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// ── Helpers Helena ─────────────────────────────────────────────────
async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, body: JSON.parse(text) } }
  catch { return { ok: false, body: { error: text } } }
}

async function fetchHelenaConfig(helenaToken) {
  // Busca lista de painéis
  const { ok: okPanels, body: panelsBody } = await helenaGet('/crm/v1/panel', helenaToken)
  if (!okPanels) throw new Error(`Erro ao buscar painéis Helena: ${JSON.stringify(panelsBody)}`)

  const panels = Array.isArray(panelsBody) ? panelsBody : (panelsBody.items ?? [])
  if (panels.length === 0) throw new Error('Nenhum painel encontrado na conta Helena.')

  const panel = panels[0]
  const panelId = panel.id

  // Busca detalhes do painel (etapas)
  const { ok: okPanel, body: panelData } = await helenaGet(`/crm/v1/panel/${panelId}`, helenaToken)
  if (!okPanel) throw new Error(`Erro ao buscar etapas do painel: ${JSON.stringify(panelData)}`)

  const steps = panelData.steps ?? panelData.columns ?? panelData.stepList ?? []
  const agendadoStep = steps.find(s => (s.name ?? s.title ?? '').toLowerCase().includes('agendado'))
  if (!agendadoStep) throw new Error('Nenhuma etapa com "agendado" no nome encontrada no painel. Renomeie a etapa no Helena e tente novamente.')

  // Busca etiquetas
  const { body: tagsBody } = await helenaGet('/core/v1/tag/list', helenaToken)
  const tags = (Array.isArray(tagsBody) ? tagsBody : (tagsBody.items ?? [])).map(t => ({
    id: t.id,
    label: t.name ?? t.label ?? t.title ?? '',
    locked: false,
  }))

  return { panelId, agendadoStepId: agendadoStep.id, tags }
}

// ── Helpers Clinicorp ──────────────────────────────────────────────
async function clinicorpGet(path, auth) {
  const res = await fetch(`${CLINICORP_BASE}${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

async function fetchClinicorpConfig(clinicorpUser, clinicorpToken, subscriberId) {
  const auth = 'Basic ' + Buffer.from(`${clinicorpUser}:${clinicorpToken}`).toString('base64')

  // Busca unidades da clínica
  const { ok: okBiz, body: bizBody } = await clinicorpGet(
    `/business/list?subscriber_id=${subscriberId}`, auth
  )
  if (!okBiz) throw new Error(`Erro ao buscar unidades Clinicorp: ${JSON.stringify(bizBody)}`)

  const businesses = Array.isArray(bizBody) ? bizBody : (bizBody.Businesses ?? bizBody.businesses ?? [])
  if (businesses.length === 0) throw new Error('Nenhuma unidade encontrada no Clinicorp.')

  const business = businesses[0]
  const businessId = business.BusinessId ?? business.businessId ?? business.id
  const codeLink = business.CodeLink ?? business.codeLink ?? business.code_link ?? 0

  // Busca profissionais
  const { body: profBody } = await clinicorpGet(
    `/professional/list_all_professionals?subscriber_id=${subscriberId}`, auth
  )
  const professionals = (Array.isArray(profBody) ? profBody : []).map(p => ({
    clinicorp_id: String(p.PersonId ?? p.Id ?? p.id ?? ''),
    name: p.Name ?? p.name ?? '',
    is_evaluator: false,
  }))

  return { auth, businessId, codeLink, professionals }
}

// ── Handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { clinicName, slug, helenaToken, clinicorpUser, clinicorpToken, subscriberId } = req.body ?? {}

  if (!clinicName || !slug || !helenaToken || !clinicorpUser || !clinicorpToken || !subscriberId) {
    return res.status(400).json({ error: 'Campos obrigatórios: clinicName, slug, helenaToken, clinicorpUser, clinicorpToken, subscriberId' })
  }

  try {
    // Auto-fetch em paralelo
    const [helenaConfig, clinicorpConfig] = await Promise.all([
      fetchHelenaConfig(helenaToken),
      fetchClinicorpConfig(clinicorpUser, clinicorpToken, subscriberId),
    ])

    const db = supabase()

    // Verifica se slug já existe
    const { data: existing } = await db.from('clinics').select('id').eq('slug', slug).maybeSingle()
    if (existing) return res.status(409).json({ error: `Slug "${slug}" já está em uso. Escolha outro.` })

    // Insere clínica
    const { data: clinic, error: clinicError } = await db
      .from('clinics')
      .insert({
        slug,
        name: clinicName,
        helena_token: helenaToken,
        helena_panel_id: helenaConfig.panelId,
        helena_agendado_step_id: helenaConfig.agendadoStepId,
        helena_tags: helenaConfig.tags,
        clinicorp_user: clinicorpUser,
        clinicorp_token: clinicorpToken,
        clinicorp_subscriber_id: subscriberId,
        clinicorp_business_id: clinicorpConfig.businessId,
        clinicorp_code_link: clinicorpConfig.codeLink,
      })
      .select('id')
      .single()

    if (clinicError) throw new Error(`Erro ao salvar clínica: ${clinicError.message}`)

    // Insere profissionais (se houver)
    if (clinicorpConfig.professionals.length > 0) {
      const { error: profError } = await db.from('professionals').insert(
        clinicorpConfig.professionals.map(p => ({ ...p, clinic_id: clinic.id }))
      )
      if (profError) console.warn('[setup] Erro ao salvar profissionais:', profError.message)
    }

    return res.status(200).json({
      success: true,
      slug,
      panelId: helenaConfig.panelId,
      agendadoStepId: helenaConfig.agendadoStepId,
      businessId: clinicorpConfig.businessId,
      professionalsCount: clinicorpConfig.professionals.length,
    })

  } catch (err) {
    console.error('[setup] Erro:', err.message)
    return res.status(400).json({ error: err.message })
  }
}
