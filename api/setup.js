import { getSupabase } from './_supabase.js'

const HELENA_BASE   = 'https://api.wts.chat'
const CLINICORP_BASE = 'https://api.clinicorp.com/rest/v1'

async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

// Tenta extrair o accountId (idconta) da conta Helena.
// Tenta GET /core/v1/account e fallback em GET /core/v1/agent.
async function fetchHelenaAccountId(token) {
  // Tenta endpoint de conta
  const { ok, body } = await helenaGet('/core/v1/account', token)
  if (ok && body?.id) return String(body.id)
  if (ok && body?.accountId) return String(body.accountId)

  // Fallback: lista de agentes — extrai workspaceId do primeiro agente
  const { ok: okAgent, body: agentBody } = await helenaGet('/core/v1/agent', token)
  const agents = Array.isArray(agentBody) ? agentBody : (agentBody?.items ?? [])
  if (okAgent && agents.length > 0) {
    const a = agents[0]
    const id = a.accountId ?? a.workspaceId ?? a.tenantId ?? a.organizationId ?? null
    if (id) return String(id)
  }

  return null  // não conseguiu auto-detectar
}

async function fetchHelenaConfig(token) {
  const { ok: okPanels, body: panelsBody } = await helenaGet('/crm/v1/panel', token)
  if (!okPanels) throw new Error(`Erro ao buscar painéis Helena: ${JSON.stringify(panelsBody)}`)

  const panels = Array.isArray(panelsBody) ? panelsBody : (panelsBody.items ?? [])
  if (panels.length === 0) throw new Error('Nenhum painel encontrado na conta Helena.')

  const panelId = panels[0].id

  // Busca tags do workspace
  const { body: tagsBody } = await helenaGet('/core/v1/tag/list', token)
  const tags = (Array.isArray(tagsBody) ? tagsBody : (tagsBody.items ?? [])).map(t => ({
    id:     t.id,
    label:  t.name ?? t.label ?? t.title ?? '',
    locked: false,
  }))

  return { panelId, tags }
}

async function clinicorpGet(path, auth) {
  const res = await fetch(`${CLINICORP_BASE}${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

async function fetchClinicorpConfig(user, token, subscriberId) {
  const auth = 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64')

  const { ok: okBiz, body: bizBody } = await clinicorpGet(`/business/list?subscriber_id=${subscriberId}`, auth)
  if (!okBiz) throw new Error(`Erro ao buscar unidades Clinicorp: ${JSON.stringify(bizBody)}`)

  const businesses = Array.isArray(bizBody) ? bizBody : (bizBody.Businesses ?? bizBody.businesses ?? [])
  if (businesses.length === 0) throw new Error('Nenhuma unidade encontrada no Clinicorp.')

  const biz        = businesses[0]
  const businessId = biz.BusinessId ?? biz.businessId ?? biz.id
  const codeLink   = biz.CodeLink ?? biz.codeLink ?? biz.code_link ?? 0

  const { body: profBody } = await clinicorpGet(`/professional/list_all_professionals?subscriber_id=${subscriberId}`, auth)
  const professionals = (Array.isArray(profBody) ? profBody : []).map(p => ({
    clinicorp_id: String(p.PersonId ?? p.Id ?? p.id ?? ''),
    name:         p.Name ?? p.name ?? '',
    is_evaluator: false,
  }))

  return { businessId, codeLink, professionals }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { clinicName, slug, helenaToken, agendadoStepId, clinicorpUser, clinicorpToken, helenaAccountId } = req.body ?? {}
  // subscriberId pode ser CNPJ ou o próprio usuário da API — fallback para o usuário
  const subscriberId = (req.body?.subscriberId || clinicorpUser || '').trim()

  if (!clinicName || !slug || !helenaToken || !clinicorpUser || !clinicorpToken) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' })
  }

  try {
    console.log('[setup] Iniciando para slug:', slug, '| subscriberId:', subscriberId)

    const [helenaConfig, clinicorpConfig, autoAccountId] = await Promise.all([
      fetchHelenaConfig(helenaToken).catch(e => { throw new Error(`Helena: ${e.message}`) }),
      fetchClinicorpConfig(clinicorpUser, clinicorpToken, subscriberId).catch(e => { throw new Error(`Clinicorp: ${e.message}`) }),
      fetchHelenaAccountId(helenaToken),
    ])

    console.log('[setup] Configs obtidas | panelId:', helenaConfig.panelId, '| businessId:', clinicorpConfig.businessId, '| accountId auto:', autoAccountId)

    // helenaAccountId manual tem prioridade sobre o auto-detectado
    const accountId = helenaAccountId?.trim() || autoAccountId

    const db = getSupabase()

    // Verifica duplicatas
    const { data: bySlug } = await db.from('clinics').select('id').eq('slug', slug).maybeSingle()
    if (bySlug) return res.status(409).json({ error: `Slug "${slug}" já está em uso.` })

    if (accountId) {
      const { data: byAccount } = await db.from('clinics').select('id').eq('helena_account_id', accountId).maybeSingle()
      if (byAccount) return res.status(409).json({ error: 'Esta conta Helena já está cadastrada.' })
    }

    const { data: clinic, error: clinicError } = await db
      .from('clinics')
      .insert({
        slug,
        name:                    clinicName,
        helena_token:            helenaToken,
        helena_panel_id:         helenaConfig.panelId,
        helena_agendado_step_id: agendadoStepId,
        helena_tags:             helenaConfig.tags,
        helena_account_id:       accountId ?? null,
        clinicorp_user:          clinicorpUser,
        clinicorp_token:         clinicorpToken,
        clinicorp_subscriber_id: subscriberId,
        clinicorp_business_id:   clinicorpConfig.businessId,
        clinicorp_code_link:     clinicorpConfig.codeLink,
      })
      .select('id')
      .single()

    if (clinicError) throw new Error(`Erro ao salvar: ${clinicError.message}`)

    if (clinicorpConfig.professionals.length > 0) {
      await db.from('professionals').insert(
        clinicorpConfig.professionals.map(p => ({ ...p, clinic_id: clinic.id }))
      )
    }

    return res.status(200).json({
      success:            true,
      slug,
      helenaAccountId:    accountId,
      accountAutoDetected: !!autoAccountId && !helenaAccountId?.trim(),
      professionalsCount: clinicorpConfig.professionals.length,
    })

  } catch (err) {
    console.error('[setup] Erro:', err.message)
    return res.status(400).json({ error: err.message })
  }
}
