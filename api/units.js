import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'
import { fetchBusinessId, fetchProfessionals } from './_clinicorp.js'

function toClient(u) {
  return {
    id:            u.id,
    name:          u.name,
    active:        u.active,
    position:      u.position,
    clinicorpUser: u.clinicorp_user,
    subscriberId:  u.clinicorp_subscriber_id,
    businessId:    u.clinicorp_business_id,
    codeLink:      u.clinicorp_code_link,
    bookableProfessionalIds: u.bookable_professional_ids ?? null,
  }
}

// Rotas admin de unidades. Token Clinicorp é write-only: nunca sai daqui.
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return

  const db = getSupabase()

  // ── GET ?id=&professionals=1 → profissionais ao vivo do Clinicorp ─
  // Nada de tabela sincronizada: nomes vêm direto da unidade certa.
  if (req.method === 'GET') {
    const { id, professionals } = req.query ?? {}
    if (!id || !professionals) {
      return res.status(400).json({ error: 'Use ?id=<unitId>&professionals=1' })
    }
    try {
      const { data: unit } = await db.from('units').select('*').eq('id', id).maybeSingle()
      if (!unit) return res.status(404).json({ error: 'Unidade não encontrada.' })

      const list = await fetchProfessionals(
        unit.clinicorp_user, unit.clinicorp_token, unit.clinicorp_subscriber_id
      )
      return res.status(200).json({
        professionals: list,
        bookableProfessionalIds: unit.bookable_professional_ids ?? null,
      })
    } catch (err) {
      console.error('[units] GET professionals:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST → cria unidade em uma clínica existente ────────────────
  if (req.method === 'POST') {
    const { clinicId, name, clinicorpUser, clinicorpToken, subscriberId, codeLink } = req.body ?? {}
    if (!clinicId || !name?.trim() || !clinicorpUser?.trim() || !clinicorpToken?.trim()) {
      return res.status(400).json({ error: 'Campos obrigatórios: clinicId, name, clinicorpUser, clinicorpToken' })
    }

    try {
      const { data: clinic } = await db.from('clinics').select('id').eq('id', clinicId).maybeSingle()
      if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })

      const subId = (subscriberId || clinicorpUser).trim()
      let businessId, finalCodeLink
      try {
        const fetched = await fetchBusinessId(clinicorpUser.trim(), clinicorpToken.trim(), subId)
        businessId    = fetched.businessId
        finalCodeLink = codeLink ? String(codeLink).trim() : fetched.codeLink
      } catch (err) {
        return res.status(400).json({ error: `Credenciais inválidas: ${err.message}` })
      }

      const { data: siblings } = await db
        .from('units').select('position').eq('clinic_id', clinicId)
        .order('position', { ascending: false }).limit(1)
      const position = (siblings?.[0]?.position ?? -1) + 1

      const { data: unit, error } = await db
        .from('units')
        .insert({
          clinic_id:               clinicId,
          name:                    name.trim(),
          position,
          clinicorp_user:          clinicorpUser.trim(),
          clinicorp_token:         clinicorpToken.trim(),
          clinicorp_subscriber_id: subId,
          clinicorp_business_id:   businessId,
          clinicorp_code_link:     finalCodeLink,
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return res.status(200).json({ success: true, unit: toClient(unit) })
    } catch (err) {
      console.error('[units] POST:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── PUT → atualiza somente os campos enviados ───────────────────
  if (req.method === 'PUT') {
    const { id, name, clinicorpUser, clinicorpToken, subscriberId, codeLink, active, bookableProfessionalIds } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Campo id obrigatório.' })

    try {
      const { data: current } = await db.from('units').select('*').eq('id', id).maybeSingle()
      if (!current) return res.status(404).json({ error: 'Unidade não encontrada.' })

      // Última unidade ativa não pode ser desativada — quebraria o runtime da clínica
      if (active === false && current.active) {
        const { count } = await db
          .from('units').select('id', { count: 'exact', head: true })
          .eq('clinic_id', current.clinic_id).eq('active', true)
        if ((count ?? 0) <= 1) {
          return res.status(400).json({ error: 'Não é possível desativar a última unidade ativa da clínica.' })
        }
      }

      const patch = {}
      if (name?.trim()) patch.name = name.trim()
      if (typeof active === 'boolean') patch.active = active
      if (clinicorpUser?.trim())  patch.clinicorp_user  = clinicorpUser.trim()
      if (clinicorpToken?.trim()) patch.clinicorp_token = clinicorpToken.trim()
      if (subscriberId?.trim())   patch.clinicorp_subscriber_id = subscriberId.trim()
      if (codeLink !== undefined && codeLink !== null && String(codeLink).trim() !== '') {
        patch.clinicorp_code_link = String(codeLink).trim()
      }
      // Lista vazia vira null = todos os profissionais agendáveis
      if (Array.isArray(bookableProfessionalIds)) {
        patch.bookable_professional_ids = bookableProfessionalIds.length > 0
          ? bookableProfessionalIds.map(String)
          : null
      }

      // Credencial trocou → revalida businessId/codeLink no Clinicorp
      const credentialChanged = patch.clinicorp_user || patch.clinicorp_token || patch.clinicorp_subscriber_id
      if (credentialChanged) {
        const user  = patch.clinicorp_user          ?? current.clinicorp_user
        const token = patch.clinicorp_token         ?? current.clinicorp_token
        const subId = patch.clinicorp_subscriber_id ?? current.clinicorp_subscriber_id
        try {
          const fetched = await fetchBusinessId(user, token, subId)
          patch.clinicorp_business_id = fetched.businessId
          // codeLink explícito do admin tem prioridade sobre o revalidado
          if (!('clinicorp_code_link' in patch)) patch.clinicorp_code_link = fetched.codeLink
        } catch (err) {
          return res.status(400).json({ error: `Credenciais inválidas: ${err.message}` })
        }
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
      }

      const { data: unit, error } = await db
        .from('units').update(patch).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)

      return res.status(200).json({ success: true, unit: toClient(unit) })
    } catch (err) {
      console.error('[units] PUT:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── DELETE → exclui a unidade ───────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Campo id obrigatório.' })

    try {
      const { data: current } = await db.from('units').select('id, clinic_id, active').eq('id', id).maybeSingle()
      if (!current) return res.status(404).json({ error: 'Unidade não encontrada.' })

      // Última unidade ativa não pode ser excluída — quebraria o runtime.
      // Para remover a clínica inteira, use a exclusão da clínica.
      if (current.active) {
        const { count } = await db
          .from('units').select('id', { count: 'exact', head: true })
          .eq('clinic_id', current.clinic_id).eq('active', true)
        if ((count ?? 0) <= 1) {
          return res.status(400).json({ error: 'Não é possível excluir a última unidade ativa. Exclua a clínica inteira ou cadastre outra unidade antes.' })
        }
      }

      const { error } = await db.from('units').delete().eq('id', id)
      if (error) throw new Error(error.message)

      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('[units] DELETE:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
