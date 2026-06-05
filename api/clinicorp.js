import { getClinicByAccountId, getUnitById } from './_supabase.js'

const BASE = 'https://api.clinicorp.com/rest/v1'

function normTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${String(Number(m || 0)).padStart(2, '0')}`
}

async function clinicorpFetch(url, auth, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...options.headers }
  })
  const text = await res.text()
  let body = {}
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!res.ok) console.error(`[Clinicorp] ${options.method || 'GET'} ${url} → ${res.status}`, JSON.stringify(body))
  return { ok: res.ok, status: res.status, body }
}

async function findPatientByPhone(phone, auth, subscriberId) {
  const cleanPhone = phone ? phone.replace(/\D/g, '') : ''
  if (!cleanPhone) return null
  const { ok, body } = await clinicorpFetch(
    `${BASE}/patient/get?subscriber_id=${subscriberId}&Phone=${cleanPhone}`, auth
  )
  const patient = Array.isArray(body) ? body[0] : body
  if (ok && patient?.PatientId) return { patientId: patient.PatientId }
  return null
}

async function createPatient(name, phone, auth, subscriberId) {
  const cleanPhone = phone ? phone.replace(/\D/g, '') : ''
  const { ok, body } = await clinicorpFetch(`${BASE}/patient/create`, auth, {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, Name: name, MobilePhone: cleanPhone, IgnoreSameName: 'X' })
  })
  if (ok && body.id) return { patientId: body.id }
  console.warn('[Clinicorp] Falha ao criar paciente:', JSON.stringify(body))
  return null
}

// Resolve as credenciais: busca unit pelo unitId, com fallback para a primeira unit da clínica
async function resolveUnit(idconta, unitId) {
  if (unitId) {
    const unit = await getUnitById(unitId)
    if (unit) return unit
  }
  // Fallback: primeira unidade ativa da clínica
  const clinic = await getClinicByAccountId(idconta)
  if (!clinic?.units?.length) throw new Error('Nenhuma unidade configurada para esta clínica.')
  return clinic.units[0]
}

export default async function handler(req, res) {
  const idconta = req.query?.idconta || req.headers?.['x-idconta']
  const unitId  = req.query?.unitId  || req.body?.unitId
  if (!idconta) return res.status(400).json({ error: 'Parâmetro idconta obrigatório' })

  let unit
  try {
    unit = await resolveUnit(idconta, unitId)
  } catch (err) {
    return res.status(404).json({ error: err.message })
  }

  const auth         = 'Basic ' + Buffer.from(`${unit.clinicorp_user}:${unit.clinicorp_token}`).toString('base64')
  const subscriberId = unit.clinicorp_subscriber_id
  const businessId   = unit.clinicorp_business_id
  const codeLink     = unit.clinicorp_code_link
  const categoryColor       = unit.clinicorp_category_color       || '#ffff00'
  const categoryDescription = unit.clinicorp_category_description || 'AVALIAÇÃO'

  // ── GET: busca horários disponíveis ──────────────────────────────
  if (req.method === 'GET') {
    const date = req.query?.date
    if (!date) return res.status(400).json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' })

    console.log('[Clinicorp GET] unit:', unit.name, '| subscriberId:', subscriberId, '| codeLink:', codeLink, '| date:', date)

    try {
      const url = `${BASE}/appointment/get_avaliable_times_calendar?subscriber_id=${subscriberId}&code_link=${codeLink}&date=${date}`
      const { ok, status, body } = await clinicorpFetch(url, auth)
      if (!ok) return res.status(status).json({
        error: body.Message || body.message || 'Erro ao buscar horários no Clinicorp',
        detail: body,
      })
      const raw = Array.isArray(body) ? body : (body.AvaliableTimes ?? [])
      const slots = raw
        .filter(s => s.isSelectable !== false)
        .map(s => ({ from: normTime(s.From), to: normTime(s.To), professionalId: String(s.ProfessionalId) }))
      return res.status(200).json(slots)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── POST: busca/cria paciente e agenda ────────────────────────────
  const { patientName, patientPhone, dentistId, dateLocal, fromTime, toTime, notes } = req.body || {}
  if (!patientName || !dentistId || !dateLocal || !fromTime || !toTime) {
    return res.status(400).json({ error: 'Campos obrigatórios: patientName, dentistId, dateLocal, fromTime, toTime' })
  }

  try {
    let patientResult = await findPatientByPhone(patientPhone, auth, subscriberId)
    if (!patientResult) patientResult = await createPatient(patientName, patientPhone, auth, subscriberId)
    if (!patientResult) return res.status(400).json({ error: 'Não foi possível encontrar ou criar o paciente no Clinicorp.' })

    const payload = {
      Clinic_BusinessId:  businessId,
      Patient_PersonId:   Number(patientResult.patientId),
      Dentist_PersonId:   Number(dentistId),
      PatientName:        patientName,
      MobilePhone:        patientPhone ? patientPhone.replace(/\D/g, '') : '',
      date:               `${dateLocal}T03:00:00.000Z`,
      fromTime, toTime,
      Notes:              notes || 'Agendamento via Schedule Button',
      CategoryColor:      categoryColor,
      CategoryDescription: categoryDescription,
    }

    const { ok, status, body } = await clinicorpFetch(
      `${BASE}/appointment/create_appointment_by_api`, auth,
      { method: 'POST', body: JSON.stringify(payload) }
    )
    if (!ok || body.isBusy) {
      const errorMsg = body.msg || body.Message || body.message || body.error || `Erro ao criar agendamento (${status})`
      return res.status(400).json({ error: errorMsg, detail: body })
    }
    return res.status(200).json({ success: true, data: body })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
