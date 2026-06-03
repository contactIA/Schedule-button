const AUTH = 'Basic ' + Buffer.from('primeodontocenter:b6b383e7-6b27-4378-8dfb-057648f6f017').toString('base64')
const SUBSCRIBER_ID = '43945422000142'
const BUSINESS_ID = 6505624431493120
const CODE_LINK = 75094
const BASE = 'https://api.clinicorp.com/rest/v1'


async function clinicorpFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...options.headers } })
  const text = await res.text()
  let body = {}
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!res.ok) {
    console.error(`[Clinicorp] ${options.method || 'GET'} ${url} → ${res.status}`, JSON.stringify(body))
  }
  return { ok: res.ok, status: res.status, body }
}

async function findPatientByPhone(phone) {
  const cleanPhone = phone ? phone.replace(/\D/g, '') : ''
  if (!cleanPhone) return null

  const { ok, body } = await clinicorpFetch(
    `${BASE}/patient/get?subscriber_id=${SUBSCRIBER_ID}&Phone=${cleanPhone}`
  )

  const patient = Array.isArray(body) ? body[0] : body
  if (ok && patient?.PatientId) {
    console.log('[Clinicorp] Paciente encontrado, ID:', patient.PatientId)
    return { patientId: patient.PatientId }
  }
  return null
}

async function createPatient(name, phone) {
  const cleanPhone = phone ? phone.replace(/\D/g, '') : ''
  const { ok, body } = await clinicorpFetch(`${BASE}/patient/create`, {
    method: 'POST',
    body: JSON.stringify({
      subscriber_id: SUBSCRIBER_ID,
      Name: name,
      MobilePhone: cleanPhone,
      IgnoreSameName: 'X',
    })
  })

  if (ok && body.id) {
    console.log('[Clinicorp] Paciente criado, ID:', body.id)
    return { patientId: body.id }
  }

  console.warn('[Clinicorp] Falha ao criar paciente:', JSON.stringify(body))
  return null
}

export default async function handler(req, res) {

  // ── GET: busca horários disponíveis ──────────────────────────────────────
  if (req.method === 'GET') {
    const date = req.query?.date
    if (!date) return res.status(400).json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' })

    try {
      const url = `${BASE}/appointment/get_avaliable_times_calendar?subscriber_id=${SUBSCRIBER_ID}&code_link=${CODE_LINK}&date=${date}`
      const { ok, status, body } = await clinicorpFetch(url)

      if (!ok) {
        return res.status(status).json({
          error: body.Message || body.message || 'Erro ao buscar horários no Clinicorp',
          detail: body,
        })
      }

      const raw = Array.isArray(body) ? body : (body.AvaliableTimes ?? [])
      const slots = raw
        .filter(s => s.isSelectable !== false)
        .map(s => ({
          from: s.From,
          to: s.To,
          professionalId: String(s.ProfessionalId),
        }))

      return res.status(200).json(slots)
    } catch (err) {
      console.error('[Clinicorp GET] exception:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── POST: busca/cria paciente e agenda ───────────────────────────────────
  const { patientName, patientPhone, dentistId, dateLocal, fromTime, toTime, notes } = req.body || {}

  if (!patientName || !dentistId || !dateLocal || !fromTime || !toTime) {
    return res.status(400).json({ error: 'Campos obrigatórios: patientName, dentistId, dateLocal, fromTime, toTime' })
  }

  try {
    // Passo 1: buscar paciente pelo telefone
    let patientResult = await findPatientByPhone(patientPhone)

    if (!patientResult) {
      // Passo 2: criar o paciente se não existir
      patientResult = await createPatient(patientName, patientPhone)
    }

    if (!patientResult) {
      return res.status(400).json({ error: 'Não foi possível encontrar ou criar o paciente no Clinicorp.' })
    }

    // Passo 3: criar o agendamento com o ID do paciente
    const payload = {
      Clinic_BusinessId: BUSINESS_ID,
      Patient_PersonId: Number(patientResult.patientId),
      Dentist_PersonId: Number(dentistId),
      PatientName: patientName,
      MobilePhone: patientPhone ? patientPhone.replace(/\D/g, '') : '',
      date: `${dateLocal}T03:00:00.000Z`,
      fromTime: fromTime,
      toTime: toTime,
      Notes: notes || 'Agendamento via Prime Agendamento',
      CategoryColor: '#ffff00',
      CategoryDescription: 'AVALIAÇÃO',
    }

    console.log('[Clinicorp POST] payload:', JSON.stringify(payload))

    const { ok, status, body } = await clinicorpFetch(
      `${BASE}/appointment/create_appointment_by_api`,
      { method: 'POST', body: JSON.stringify(payload) }
    )

    if (!ok || body.isBusy) {
      const errorMsg = body.msg || body.Message || body.message || body.error || `Erro ao criar agendamento (${status})`
      console.error('[Clinicorp POST] resposta de erro:', JSON.stringify(body))
      return res.status(400).json({ error: errorMsg, detail: body })
    }

    console.log('[Clinicorp POST] sucesso:', JSON.stringify(body))
    return res.status(200).json({ success: true, data: body })

  } catch (err) {
    console.error('[Clinicorp POST] exception:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
