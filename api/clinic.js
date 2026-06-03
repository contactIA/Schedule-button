import { getClinicByAccountId } from './_supabase.js'

// Retorna apenas campos não-sensíveis para o frontend.
// Tokens e credenciais NUNCA saem deste handler.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { idconta } = req.query
  if (!idconta) return res.status(400).json({ error: 'Parâmetro idconta obrigatório' })

  try {
    const clinic = await getClinicByAccountId(idconta)

    if (!clinic) {
      return res.status(404).json({ error: 'not_registered' })
    }

    return res.status(200).json({
      name:            clinic.name,
      panelId:         clinic.helena_panel_id,
      agendadoStepId:  clinic.helena_agendado_step_id,
      tags:            clinic.helena_tags ?? [],
      professionals:   clinic.professionals ?? [],
    })
  } catch (err) {
    console.error('[clinic] Erro:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
