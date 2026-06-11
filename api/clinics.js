import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'
import { fetchProfessionals } from './_clinicorp.js'

// Rotas admin de gestão de clínicas. Tokens nunca saem deste handler —
// o detalhe expõe apenas hasToken e o PUT aceita token novo (write-only).
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

        const [{ data: units }, { data: professionals }] = await Promise.all([
          db.from('units')
            .select('id, name, active, position, clinicorp_user, clinicorp_subscriber_id, clinicorp_business_id, clinicorp_code_link')
            .eq('clinic_id', id)
            .order('position', { ascending: true }),
          db.from('professionals')
            .select('id, clinicorp_id, name, is_evaluator, active')
            .eq('clinic_id', id)
            .order('name', { ascending: true }),
        ])

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
          units: (units ?? []).map(u => ({
            id:            u.id,
            name:          u.name,
            active:        u.active,
            position:      u.position,
            clinicorpUser: u.clinicorp_user,
            subscriberId:  u.clinicorp_subscriber_id,
            businessId:    u.clinicorp_business_id,
            codeLink:      u.clinicorp_code_link,
          })),
          professionals: (professionals ?? []).filter(p => p.active !== false),
        })
      }

      const [{ data: clinics, error }, { data: units }] = await Promise.all([
        db.from('clinics')
          .select('id, name, slug, helena_account_id, active, created_at')
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
          unitsCount:      unitCount[c.id] ?? 0,
        })),
      })
    } catch (err) {
      console.error('[clinics] GET:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST → ações sobre uma clínica ──────────────────────────────
  if (req.method === 'POST') {
    const { id, action } = req.body ?? {}
    if (!id || action !== 'sync_professionals') {
      return res.status(400).json({ error: 'Ação inválida. Use { id, action: "sync_professionals" }.' })
    }

    try {
      const { data: unit } = await db
        .from('units')
        .select('clinicorp_user, clinicorp_token, clinicorp_subscriber_id')
        .eq('clinic_id', id).eq('active', true)
        .order('position', { ascending: true })
        .limit(1).maybeSingle()
      if (!unit) return res.status(404).json({ error: 'Clínica sem unidade ativa para sincronizar.' })

      const fetched = await fetchProfessionals(unit.clinicorp_user, unit.clinicorp_token, unit.clinicorp_subscriber_id)
      if (fetched.length === 0) return res.status(400).json({ error: 'Nenhum profissional retornado pelo Clinicorp.' })

      const { data: existing } = await db
        .from('professionals').select('id, clinicorp_id').eq('clinic_id', id)
      const known = new Set((existing ?? []).map(p => p.clinicorp_id))
      const fresh = fetched.filter(p => !known.has(p.clinicorp_id))

      if (fresh.length > 0) {
        const { error } = await db
          .from('professionals')
          .insert(fresh.map(p => ({ ...p, clinic_id: id })))
        if (error) throw new Error(error.message)
      }

      const { data: professionals } = await db
        .from('professionals')
        .select('id, clinicorp_id, name, is_evaluator, active')
        .eq('clinic_id', id)
        .order('name', { ascending: true })

      return res.status(200).json({
        success: true,
        added: fresh.length,
        professionals: (professionals ?? []).filter(p => p.active !== false),
      })
    } catch (err) {
      console.error('[clinics] POST:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── PUT → atualiza somente os campos enviados ───────────────────
  if (req.method === 'PUT') {
    const { id, name, slug, helenaToken, helenaPanels, helenaSteps, scheduledMessage, active, evaluatorIds } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Campo id obrigatório.' })

    if (scheduledMessage?.enabled && (!scheduledMessage.channelFrom || !scheduledMessage.templateId)) {
      return res.status(400).json({ error: 'Lembrete ativado exige canal e modelo de mensagem.' })
    }

    try {
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

      if (Object.keys(patch).length === 0 && !Array.isArray(evaluatorIds)) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await db.from('clinics').update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      }

      // Marca avaliadores: true para os ids enviados, false para o restante
      if (Array.isArray(evaluatorIds)) {
        const { error: offError } = await db
          .from('professionals').update({ is_evaluator: false })
          .eq('clinic_id', id)
        if (offError) throw new Error(offError.message)
        if (evaluatorIds.length > 0) {
          const { error: onError } = await db
            .from('professionals').update({ is_evaluator: true })
            .eq('clinic_id', id).in('id', evaluatorIds)
          if (onError) throw new Error(onError.message)
        }
      }

      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('[clinics] PUT:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
