import { getClinicByAccountId } from './_supabase.js'
import { crmClient, syncAppointment } from './_crm.js'

// Espelho do card no CRM ContactIA (runtime, fire-and-forget). Desligado por
// padrão: só age na clínica com clinics.crm_enabled = true. É informativo para
// o operador — sempre responde 2xx e o erro fica no log da função.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const b = req.body ?? {}
  const idconta = b.idconta
  if (!idconta) return res.status(400).json({ error: 'Campo idconta obrigatório' })

  try {
    const clinic = await getClinicByAccountId(idconta)
    if (!clinic?.crm_enabled) return res.status(200).json({ status: 'disabled' })

    const apiKey = process.env.CRM_API_KEY
    if (!apiKey) {
      console.error('[crm] CRM_API_KEY ausente — clínica com crm_enabled não sincronizou:', idconta)
      return res.status(200).json({ status: 'not_configured' })
    }

    const unit = clinic.units?.find(u => u.id === b.unitId) ?? clinic.units?.[0] ?? null
    const call = crmClient({ baseUrl: process.env.CRM_API_URL, apiKey, companyId: idconta })
    const result = await syncAppointment(call, {
      phone:        b.phone,
      name:         b.name,
      contactId:    b.contactId,
      unitId:       unit?.crm_unit_id ?? null,
      scheduledFor: b.scheduledFor,
      note:         b.note,
    })

    console.log(`[crm] ${result.status} | conta: ${idconta} | card: ${result.cardId ?? '-'} | ${result.resultado ?? result.reason ?? ''}`)
    return res.status(200).json(result)
  } catch (err) {
    console.error(`[crm] falha | conta: ${idconta} | ${err.status ?? ''} ${err.code ?? ''} ${err.message}`)
    return res.status(200).json({ status: 'error', error: err.message, code: err.code ?? null })
  }
}
