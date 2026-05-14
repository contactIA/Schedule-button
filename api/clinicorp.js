const AUTH = 'Basic ' + Buffer.from('primeodontocenter:b6b383e7-6b27-4378-8dfb-057648f6f017').toString('base64')
const SUBSCRIBER_ID = '43945422000142'
const BUSINESS_ID = 6505624431493120
const CODE_LINK = '75094'
const BASE = 'https://api.clinicorp.com/rest/v1'

function normTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${String(Number(m || 0)).padStart(2, '0')}`
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + Number(minutes)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function findOrCreatePatient(name, phone) {
  const clean = phone ? phone.replace(/\D/g, '') : ''

  if (clean) {
    const url = `${BASE}/patient/get?subscriber_id=${SUBSCRIBER_ID}&Phone=${clean}`
    const res = await fetch(url, { headers: { Authorization: AUTH } })
    if (res.ok) {
      const data = await res.json()
      const pid = Array.isArray(data) ? data[0]?.PatientId : data?.PatientId
      if (pid) return pid
    }
  }

  // Tenta pelo nome se não achou pelo telefone
  if (name) {
    const url = `${BASE}/patient/get?subscriber_id=${SUBSCRIBER_ID}&Name=${encodeURIComponent(name)}`
    const res = await fetch(url, { headers: { Authorization: AUTH } })
    if (res.ok) {
      const data = await res.json()
      const pid = Array.isArray(data) ? data[0]?.PatientId : data?.PatientId
      if (pid) return pid
    }
  }

  // Cria paciente
  const body = {
    subscriber_id: SUBSCRIBER_ID,
    Name: name,
    MobilePhone: clean,
    Notes: 'Paciente cadastrado via Prime Agendamento',
  }
  const res = await fetch(`${BASE}/patient/create`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.Message || `Erro ao criar paciente (${res.status})`)
  }
  const data = await res.json()
  return data.id || data.PatientId
}

export default async function handler(req, res) {
  // GET → busca horários disponíveis
  if (req.method === 'GET') {
    const date = req.query?.date
    if (!date) return res.status(400).json({ error: 'Parâmetro date obrigatório (YYYY-MM-DD)' })
    try {
      const url = `${BASE}/appointment/get_avaliable_times_calendar?subscriber_id=${SUBSCRIBER_ID}&code_link=${CODE_LINK}&date=${date}`
      const r = await fetch(url, { headers: { Authorization: AUTH } })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}))
        console.error('[Clinicorp GET] status:', r.status, 'body:', JSON.stringify(errBody))
        return res.status(r.status).json({ error: errBody.Message || errBody.message || 'Erro ao buscar horários no Clinicorp', detail: errBody })
      }
      const raw = await r.json()
      // Normaliza formato de hora (ex: "8:30" → "08:30")
      const slots = (Array.isArray(raw) ? raw : raw.AvaliableTimes ?? [])
        .filter(s => s.isSelectable !== false)
        .map(s => ({ from: normTime(s.From), to: normTime(s.To), professionalId: String(s.ProfessionalId) }))
      return res.status(200).json(slots)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { patientName, patientPhone, dentistId, dateLocal, fromTime, duracao = 30, notes } = req.body

  if (!patientName || !dentistId || !dateLocal || !fromTime) {
    return res.status(400).json({ error: 'Campos obrigatórios: patientName, dentistId, dateLocal, fromTime' })
  }

  try {
    const patientId = await findOrCreatePatient(patientName, patientPhone)
    const toTime = addMinutes(fromTime, duracao)

    // Converte para ISO com fuso BRT (UTC-3)
    const dateISO = new Date(`${dateLocal}T${fromTime}:00-03:00`).toISOString()

    const payload = {
      Clinic_BusinessId: BUSINESS_ID,
      Patient_PersonId: patientId,
      Dentist_PersonId: Number(dentistId),
      PatientName: patientName,
      MobilePhone: patientPhone ? patientPhone.replace(/\D/g, '') : '',
      date: dateISO,
      fromTime,
      toTime,
      Notes: notes || 'Agendamento via Prime Agendamento',
      CategoryColor: '#FFD700',
      CategoryDescription: 'Avaliação',
    }

    const apptRes = await fetch(`${BASE}/appointment/create_appointment_by_api`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!apptRes.ok) {
      const err = await apptRes.json().catch(() => ({}))
      throw new Error(err.Message || `Erro ao criar agendamento (${apptRes.status})`)
    }

    const result = await apptRes.json()
    return res.status(200).json({ success: true, appointmentId: result.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
