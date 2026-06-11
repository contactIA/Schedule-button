import { getClinicByAccountId } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { idconta } = req.query
  if (!idconta) return res.status(400).json({ error: 'Parâmetro idconta obrigatório' })

  try {
    const clinic = await getClinicByAccountId(idconta)
    if (!clinic) return res.status(404).json({ error: 'not_registered' })

    // Normaliza steps do banco: aceita tanto { name } quanto { title }
    const normalizeSteps = (arr) => (arr ?? []).map(s => ({
      id:   s.id,
      name: s.name || s.title || s.id,
    }))

    const clinicSteps = normalizeSteps(clinic.helena_steps)

    // Cada unidade resolve seus próprios panel/steps usando a clínica como fallback
    const units = (clinic.units ?? []).map(unit => ({
      id:             unit.id,
      name:           unit.name,
      position:       unit.position,
      panelId:        unit.helena_panel_id         ?? clinic.helena_panel_id,
      agendadoStepId: unit.helena_agendado_step_id ?? clinic.helena_agendado_step_id,
      steps:          unit.helena_steps?.length
                        ? normalizeSteps(unit.helena_steps)
                        : clinicSteps,
    }))

    // Monta lista de painéis: usa helena_panels se configurado, senão cria um painel único com os dados legados
    const panels = clinic.helena_panels?.length
      ? clinic.helena_panels.map(p => ({
          id:            p.id,
          name:          p.name,
          agendadoStepId: p.agendadoStepId,
          // null = sem restrição (clínicas cadastradas antes do recurso)
          allowedTagIds: Array.isArray(p.allowedTagIds) ? p.allowedTagIds : null,
          // Steps vêm do banco clínica (todos os painéis compartilham os steps do painel principal por ora)
          steps:         clinicSteps,
        }))
      : [{
          id:            clinic.helena_panel_id,
          name:          clinic.name,
          agendadoStepId: clinic.helena_agendado_step_id,
          allowedTagIds: null,
          steps:         clinicSteps,
        }]

    return res.status(200).json({
      name:           clinic.name,
      // Painel principal (compatibilidade)
      panelId:        panels[0]?.id,
      agendadoStepId: panels[0]?.agendadoStepId,
      steps:          clinicSteps,
      tags:           clinic.helena_tags  ?? [],
      // Config do lembrete — só vai ao runtime quando ativado
      scheduledMessage: clinic.scheduled_message?.enabled ? clinic.scheduled_message : null,
      panels,
      units,
    })
  } catch (err) {
    console.error('[clinic] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
