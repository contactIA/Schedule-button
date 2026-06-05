import { getClinicByAccountId } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { idconta } = req.query
  if (!idconta) return res.status(400).json({ error: 'Parâmetro idconta obrigatório' })

  try {
    const clinic = await getClinicByAccountId(idconta)
    if (!clinic) return res.status(404).json({ error: 'not_registered' })

    // Cada unidade resolve seus próprios panel/steps usando a clínica como fallback
    const units = (clinic.units ?? []).map(unit => ({
      id:             unit.id,
      name:           unit.name,
      position:       unit.position,
      // Helena: usa da unidade se configurado, senão herda da clínica
      panelId:        unit.helena_panel_id         ?? clinic.helena_panel_id,
      agendadoStepId: unit.helena_agendado_step_id ?? clinic.helena_agendado_step_id,
      steps:          (unit.helena_steps?.length ? unit.helena_steps : null)
                      ?? clinic.helena_steps
                      ?? [],
    }))

    return res.status(200).json({
      name:           clinic.name,
      // Defaults da clínica (usado quando unit não tem painel próprio)
      panelId:        clinic.helena_panel_id,
      agendadoStepId: clinic.helena_agendado_step_id,
      steps:          clinic.helena_steps ?? [],
      tags:           clinic.helena_tags  ?? [],
      professionals:  clinic.professionals ?? [],
      units,
    })
  } catch (err) {
    console.error('[clinic] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
