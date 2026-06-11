import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'
import { fetchBusinessId } from './_clinicorp.js'

const HELENA_BASE = 'https://api.wts.chat'

async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

// Detecta companyId da conta Helena (usado como helena_account_id)
async function fetchHelenaAccountId(token) {
  const { ok, body } = await helenaGet('/crm/v2/panel?PageSize=1', token)
  if (ok) {
    const items = body.items ?? []
    if (items.length > 0 && items[0].companyId) return String(items[0].companyId)
  }
  const { ok: okAgent, body: agentBody } = await helenaGet('/core/v1/agent', token)
  const agents = Array.isArray(agentBody) ? agentBody : (agentBody?.items ?? [])
  if (okAgent && agents.length > 0) {
    const id = agents[0].companyId ?? agents[0].accountId ?? null
    if (id) return String(id)
  }
  return null
}

// Busca tags globais do workspace
async function fetchHelenaTags(token) {
  const { body } = await helenaGet('/core/v1/tag/list', token)
  return (Array.isArray(body) ? body : (body.items ?? [])).map(t => ({
    id: t.id, label: t.name ?? t.title ?? '', locked: false,
  }))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAdmin(req, res)) return

  const {
    clinicName,
    slug,
    helenaToken,
    helenaPanelId,          // painel principal (fallback)
    agendadoStepId,         // step do painel principal (fallback)
    helenaSteps   = [],
    helenaTags    = [],
    helenaPanels  = [],     // todos os painéis escolhidos pelo admin
    units         = [],
    helenaAccountId,
    scheduledMessage = null, // config do lembrete de agendamento (opcional)
  } = req.body ?? {}

  const reminderMsgs = scheduledMessage?.enabled
    ? (Array.isArray(scheduledMessage.messages) ? scheduledMessage.messages : [scheduledMessage])
    : []
  if (scheduledMessage?.enabled && (reminderMsgs.length === 0 || reminderMsgs.some(m => !m.channelFrom || !m.templateId))) {
    return res.status(400).json({ error: 'Lembrete ativado exige canal e modelo de mensagem.' })
  }

  if (!clinicName || !slug || !helenaToken || !helenaPanelId || !agendadoStepId) {
    return res.status(400).json({ error: 'Campos obrigatórios: clinicName, slug, helenaToken, helenaPanelId, agendadoStepId' })
  }
  if (!units || units.length === 0) {
    return res.status(400).json({ error: 'Pelo menos uma unidade Clinicorp é obrigatória.' })
  }

  try {
    console.log('[setup] Iniciando para slug:', slug, '| unidades:', units.length)

    // Busca accountId + tags em paralelo
    const [autoAccountId, fetchedTags] = await Promise.all([
      fetchHelenaAccountId(helenaToken),
      helenaTags.length === 0 ? fetchHelenaTags(helenaToken) : Promise.resolve(helenaTags),
    ])

    const accountId = helenaAccountId?.trim() || autoAccountId

    const db = getSupabase()

    // Verifica duplicatas
    const { data: bySlug } = await db.from('clinics').select('id').eq('slug', slug).maybeSingle()
    if (bySlug) return res.status(409).json({ error: `Slug "${slug}" já está em uso.` })

    if (accountId) {
      const { data: byAccount } = await db.from('clinics').select('id').eq('helena_account_id', accountId).maybeSingle()
      if (byAccount) return res.status(409).json({ error: 'Esta conta Helena já está cadastrada.' })
    }

    // Salva clínica (somente dados Helena)
    const { data: clinic, error: clinicError } = await db
      .from('clinics')
      .insert({
        slug,
        name:                    clinicName,
        helena_token:            helenaToken,
        helena_panel_id:         helenaPanelId,
        helena_agendado_step_id: agendadoStepId,
        helena_steps:            helenaSteps,
        helena_tags:             fetchedTags,
        helena_panels:           helenaPanels.length > 0 ? helenaPanels : null,
        helena_account_id:       accountId ?? null,
        // Coluna só entra no insert quando há config — tolera banco sem a coluna
        ...(scheduledMessage ? { scheduled_message: scheduledMessage } : {}),
      })
      .select('id')
      .single()

    if (clinicError) throw new Error(`Erro ao salvar clínica: ${clinicError.message}`)

    // Processa e salva cada unidade Clinicorp
    const unitResults = []
    for (let i = 0; i < units.length; i++) {
      const u = units[i]
      const subscriberId = (u.subscriberId || u.clinicorpUser || '').trim()

      // Se não tem businessId, busca automaticamente
      let businessId = u.businessId ? Number(u.businessId) : null
      let codeLink   = u.codeLink   ? String(u.codeLink).trim() : null

      if (!businessId) {
        try {
          const fetched = await fetchBusinessId(u.clinicorpUser, u.clinicorpToken, subscriberId)
          businessId = fetched.businessId
          if (!codeLink) codeLink = fetched.codeLink
        } catch (err) {
          throw new Error(`Unidade "${u.name}": ${err.message}`, { cause: err })
        }
      }

      const { data: unit, error: unitError } = await db
        .from('units')
        .insert({
          clinic_id:              clinic.id,
          name:                   u.name,
          position:               i,
          helena_panel_id:        u.helenaPanelId         || null,
          helena_agendado_step_id: u.agendadoStepId        || null,
          helena_steps:           u.helenaSteps?.length    ? u.helenaSteps : null,
          clinicorp_user:         u.clinicorpUser,
          clinicorp_token:        u.clinicorpToken,
          clinicorp_subscriber_id: subscriberId,
          clinicorp_business_id:  businessId,
          clinicorp_code_link:    codeLink,
        })
        .select('id')
        .single()

      if (unitError) throw new Error(`Erro ao salvar unidade "${u.name}": ${unitError.message}`)
      unitResults.push({ name: u.name, id: unit.id })
    }

    return res.status(200).json({
      success:            true,
      slug,
      helenaAccountId:    accountId,
      accountAutoDetected: !!autoAccountId && !helenaAccountId?.trim(),
      units:              unitResults,
    })

  } catch (err) {
    console.error('[setup] Erro:', err.message)
    return res.status(400).json({ error: err.message })
  }
}
