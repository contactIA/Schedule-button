import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'
import { crmClient, checkCrmConnection, crmClinicPatch } from './_crm.js'

const FROM_CRM = 'Este campo vem do setup do CRM e só se edita lá.'

// Rotas admin de gestão de clínicas. Tokens nunca saem deste handler —
// o detalhe expõe apenas hasToken/hasCrmKey e o PUT aceita token novo (write-only).
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return

  const db = getSupabase()

  // ── GET ?id= → detalhe | sem id → lista ─────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query

    try {
      if (id) {
        const { data, error } = await db.from('clinics').select('*').eq('id', id).limit(1)
        if (error) throw new Error(error.message)
        const clinic = data?.[0]
        if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })

        // select('*') tolera o banco sem as colunas do CRM; o token Clinicorp
        // não sai porque o map abaixo escolhe os campos
        const { data: units } = await db.from('units')
          .select('*')
          .eq('clinic_id', id)
          .order('position', { ascending: true })

        return res.status(200).json({
          id:              clinic.id,
          name:            clinic.name,
          slug:            clinic.slug,
          active:          clinic.active,
          helenaAccountId: clinic.helena_account_id,
          helenaPanelId:   clinic.helena_panel_id,
          agendadoStepId:  clinic.helena_agendado_step_id,
          helenaPanels:    clinic.helena_panels ?? [],
          scheduledMessage: clinic.scheduled_message ?? null,
          hasToken:        !!clinic.helena_token,
          crmEnabled:      clinic.crm_enabled === true,
          hasCrmKey:       !!clinic.crm_api_key,
          // Provisionada pelo setup do CRM (CRM#217): o cadastro só se lê aqui
          provisionado:    !!clinic.provisionado_em,
          provisionadoEm:  clinic.provisionado_em ?? null,
          enviaLembreteDeConsulta: clinic.provisionado_em ? clinic.envia_lembrete_de_consulta === true : null,
          units: (units ?? []).map(u => ({
            id:            u.id,
            name:          u.name,
            active:        u.active,
            position:      u.position,
            clinicorpUser: u.clinicorp_user,
            subscriberId:  u.clinicorp_subscriber_id,
            businessId:    u.clinicorp_business_id,
            codeLink:      u.clinicorp_code_link,
            crmUnitId:     u.crm_unit_id ?? null,
            provisionado:  !!u.provisionado_em,
          })),
        })
      }

      const [{ data: clinics, error }, { data: units }] = await Promise.all([
        db.from('clinics')
          // select('*') tolera o banco sem provisionado_em; os tokens não saem
          .select('*')
          .order('created_at', { ascending: false }),
        db.from('units').select('clinic_id').eq('active', true),
      ])
      if (error) throw new Error(error.message)

      const unitCount = {}
      for (const u of units ?? []) unitCount[u.clinic_id] = (unitCount[u.clinic_id] ?? 0) + 1

      return res.status(200).json({
        clinics: (clinics ?? []).map(c => ({
          id:              c.id,
          name:            c.name,
          slug:            c.slug,
          helenaAccountId: c.helena_account_id,
          active:          c.active,
          provisionado:    !!c.provisionado_em,
          unitsCount:      unitCount[c.id] ?? 0,
        })),
      })
    } catch (err) {
      console.error('[clinics] GET:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── PUT → atualiza somente os campos enviados ───────────────────
  if (req.method === 'PUT') {
    const { id, name, slug, helenaToken, helenaPanels, helenaSteps, scheduledMessage, active, crmEnabled, crmApiKey } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Campo id obrigatório.' })

    if (scheduledMessage?.enabled) {
      // Shape novo: lista em .messages; shape antigo: mensagem única solta
      const msgs = Array.isArray(scheduledMessage.messages) ? scheduledMessage.messages : [scheduledMessage]
      if (msgs.length === 0 || msgs.some(m => !m.channelFrom || !m.templateId)) {
        return res.status(400).json({ error: 'Lembrete ativado exige canal e modelo em todas as mensagens.' })
      }
    }

    try {
      // Clínica provisionada: nome, token, status e CRM vêm do setup do CRM.
      // Os painéis, as etapas, as etiquetas e o lembrete continuam aqui (#212).
      const { data: before } = await db.from('clinics').select('*').eq('id', id).maybeSingle()
      if (!before) return res.status(404).json({ error: 'Clínica não encontrada.' })
      if (before.provisionado_em && (
        helenaToken?.trim() || crmApiKey?.trim() || crmEnabled !== undefined ||
        (name?.trim() && name.trim() !== before.name) ||
        (typeof active === 'boolean' && active !== before.active)
      )) {
        return res.status(400).json({ error: FROM_CRM })
      }

      const patch = {}
      if (name?.trim()) patch.name = name.trim()

      if (slug?.trim()) {
        const { data: bySlug } = await db
          .from('clinics').select('id').eq('slug', slug.trim()).neq('id', id).maybeSingle()
        if (bySlug) return res.status(409).json({ error: `Slug "${slug}" já está em uso.` })
        patch.slug = slug.trim()
      }

      if (helenaToken?.trim()) patch.helena_token = helenaToken.trim()

      if (Array.isArray(helenaPanels) && helenaPanels.length > 0) {
        patch.helena_panels = helenaPanels
        // Mantém os campos legados (fallback) sincronizados com o primeiro painel
        patch.helena_panel_id          = helenaPanels[0].id
        patch.helena_agendado_step_id  = helenaPanels[0].agendadoStepId
      }

      if (Array.isArray(helenaSteps) && helenaSteps.length > 0) patch.helena_steps = helenaSteps

      // Presente no body (mesmo null) → atualiza; ausente → não mexe
      if ('scheduledMessage' in (req.body ?? {})) patch.scheduled_message = scheduledMessage ?? null

      if (typeof active === 'boolean') patch.active = active

      // CRM: só entra no patch o que veio no body; chave nova ou envio
      // ligado testa a conexão (GET /eu e /unidades) antes de gravar
      if (crmApiKey !== undefined || crmEnabled !== undefined) {
        const current = before
        const crm = await crmClinicPatch({ crmEnabled, crmApiKey }, current, (apiKey) =>
          checkCrmConnection(crmClient({ baseUrl: process.env.CRM_API_URL, apiKey, companyId: current.helena_account_id })))
        if (crm.error) return res.status(400).json({ error: crm.error })
        Object.assign(patch, crm.patch)
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      }

      const { error } = await db.from('clinics').update(patch).eq('id', id)
      if (error) throw new Error(error.message)

      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('[clinics] PUT:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── DELETE → exclui a clínica e tudo que depende dela ───────────
  if (req.method === 'DELETE') {
    const { id } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Campo id obrigatório.' })

    try {
      const { data: clinic } = await db.from('clinics').select('*').eq('id', id).maybeSingle()
      if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
      // O CRM a criaria de novo no próximo envio: desliga-se o botão lá
      if (clinic.provisionado_em) {
        return res.status(400).json({ error: 'Esta clínica vem do setup do CRM. Para tirá-la do botão, desligue o produto no setup do CRM.' })
      }

      // Dependências primeiro — FKs podem não ter ON DELETE CASCADE
      const { error: profError } = await db.from('professionals').delete().eq('clinic_id', id)
      if (profError) throw new Error(profError.message)
      const { error: unitError } = await db.from('units').delete().eq('clinic_id', id)
      if (unitError) throw new Error(unitError.message)
      const { error } = await db.from('clinics').delete().eq('id', id)
      if (error) throw new Error(error.message)

      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('[clinics] DELETE:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
