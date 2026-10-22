import { getClinicByAccountId } from './_supabase.js'
import { crmClient, isUuid } from './_crm.js'
import { requireAllowedOrigin } from './_origin.js'
import { agendaDays, agendaSlots, bookAgenda, describeAgendaError, FUSO_PADRAO } from './_agenda.js'

const DATA = /^\d{4}-\d{2}-\d{2}$/

// Os dias, os horários e a consulta da unidade que marca na agenda do CRM
// (CRM#302), no lugar do /api/clinicorp. Rota do operador: prova de origem, e
// a unidade precisa ser uma das ativas da clínica do idconta, com agenda: true.
//   GET ?idconta=&unitId=&days=1 → ['YYYY-MM-DD', ...]
//   GET ?idconta=&unitId=&date=  → [{ from, to, start, professionalId, professionalName }]
//   POST ?idconta=&unitId=       { patientName, patientPhone, contactId, professionalId, start, appointmentNote, cardNote }
export function makeAgendaHandler({ loadClinic = getClinicByAccountId, client = crmClient } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!requireAllowedOrigin(req, res)) return

    const { idconta, unitId } = req.query ?? {}
    if (!idconta || !unitId) return res.status(400).json({ error: 'Parâmetros idconta e unitId obrigatórios' })

    let clinic
    try {
      clinic = await loadClinic(idconta)
    } catch (err) {
      console.error('[agenda] Erro ao carregar a clínica:', err.message)
      return res.status(500).json({ error: err.message })
    }
    const unit = clinic?.units?.find(u => u.id === unitId)
    if (!unit?.agenda || !unit.crm_unit_id) return res.status(404).json({ error: 'Unidade da agenda não encontrada.' })
    // A chave chega com o retrato do CRM (CRM#91); sem ela não há como marcar
    if (!clinic.crm_api_key) {
      console.error('[agenda] unidade da agenda sem a chave do CRM na clínica:', idconta)
      return res.status(409).json({ error: 'A agenda desta clínica ainda não está ligada ao botão. Peça à equipe para conferir o botão no setup do CRM.' })
    }

    const call = client({ baseUrl: process.env.CRM_API_URL, apiKey: clinic.crm_api_key, companyId: idconta })
    const timeZone = clinic.fuso_horario || FUSO_PADRAO
    const unidadeId = unit.crm_unit_id

    try {
      if (req.method === 'GET' && req.query.days) {
        return res.status(200).json(await agendaDays(call, { unitId: unidadeId, timeZone }))
      }
      if (req.method === 'GET') {
        if (!DATA.test(req.query.date ?? '')) return res.status(400).json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' })
        return res.status(200).json(await agendaSlots(call, { unitId: unidadeId, date: req.query.date, timeZone }))
      }

      const b = req.body ?? {}
      if (!b.patientName?.trim() || !isUuid(b.professionalId) || Number.isNaN(Date.parse(b.start ?? ''))) {
        return res.status(400).json({ error: 'Campos obrigatórios: patientName, professionalId, start' })
      }
      const result = await bookAgenda(call, {
        unitId:          unidadeId,
        professionalId:  b.professionalId,
        start:           b.start,
        name:            b.patientName.trim(),
        phone:           String(b.patientPhone ?? '').replace(/\D/g, ''),
        contactId:       b.contactId,
        appointmentNote: b.appointmentNote,
        cardNote:        b.cardNote,
      })
      console.log(`[agenda] marcada | conta: ${idconta} | card: ${result.cardId} | ${result.resultado}`)
      return res.status(200).json({ success: true, ...result })
    } catch (err) {
      console.error(`[agenda] falha | conta: ${idconta} | ${err.status ?? ''} ${err.code ?? ''} ${err.message}`)
      const status = err.status === 409 ? 409 : err.status >= 400 && err.status < 500 ? 400 : 502
      return res.status(status).json({ error: describeAgendaError(err), code: err.code ?? null })
    }
  }
}

export default makeAgendaHandler()
