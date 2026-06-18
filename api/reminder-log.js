import { getSupabase } from './_supabase.js'

// Auditoria das tentativas de lembrete. É informativo: nunca propaga
// erro que atrapalhe o operador — sempre responde 2xx.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const b = req.body ?? {}
    const db = getSupabase()
    await db.from('reminder_logs').insert({
      helena_account_id: b.idconta         ?? null,
      clinic_name:       b.clinicName       ?? null,
      patient_name:      b.patientName      ?? null,
      phone:             b.phone            ?? null,
      template_label:    b.templateLabel    ?? null,
      scheduling:        b.scheduling       ?? null,
      appointment_date:  b.appointmentDate  ?? null,
      appointment_time:  b.appointmentTime  ?? null,
      status:            b.status           ?? 'unknown',
    })
    return res.status(204).end()
  } catch (err) {
    console.error('[reminder-log]', err.message)
    return res.status(200).json({ ok: false })
  }
}
