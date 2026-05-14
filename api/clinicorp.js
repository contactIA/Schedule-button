const AUTH = 'Basic ' + Buffer.from('primeodontocenter:b6b383e7-6b27-4378-8dfb-057648f6f017').toString('base64')
const SUBSCRIBER_ID = '43945422000142'
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
          from: normTime(s.From),
          to: normTime(s.To),
          professionalId: String(s.ProfessionalId),
        }))

      return res.status(200).json(slots)
    } catch (err) {
      console.error('[Clinicorp GET] exception:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── POST: cria agendamento via create_online_scheduling ──────────────────
  const { patientName, patientPhone, dentistId, dateLocal, fromTime, duracao = 30, notes } = req.body || {}

  if (!patientName || !dentistId || !dateLocal || !fromTime) {
    return res.status(400).json({ error: 'Campos obrigatórios: patientName, dentistId, dateLocal, fromTime' })
  }

  const toTime = addMinutes(fromTime, duracao)

  const payload = {
    code_link: CODE_LINK,
    subscriber_id: SUBSCRIBER_ID,
    PatientName: patientName,
    MobilePhone: patientPhone ? patientPhone.replace(/\D/g, '') : '',
    ProfessionalId: Number(dentistId),
    Date: dateLocal,
    From: fromTime,
    To: toTime,
    Notes: notes || 'Agendamento via Prime Agendamento',
  }

  console.log('[Clinicorp POST] payload:', JSON.stringify(payload))

  try {
    const { ok, status, body } = await clinicorpFetch(
      `${BASE}/appointment/create_online_scheduling`,
      { method: 'POST', body: JSON.stringify(payload) }
    )

    if (!ok) {
      return res.status(status).json({
        error: body.Message || body.message || `Erro ao criar agendamento (${status})`,
        detail: body,
      })
    }

    return res.status(200).json({ success: true, data: body })
  } catch (err) {
    console.error('[Clinicorp POST] exception:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
