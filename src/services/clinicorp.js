// Chama o handler Vercel em /api/clinicorp (que por sua vez acessa a API Clinicorp com as credenciais seguras)

export async function fetchClinicorpSlots(date) {
  const res = await fetch(`/api/clinicorp?date=${date}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar horários (HTTP ${res.status})`)
  }
  return res.json()
}

export async function scheduleClinicorp(payload) {
  const res = await fetch('/api/clinicorp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[Clinicorp] Falha ao agendar. Payload enviado:', payload, 'Resposta:', err)
    const detail = err.detail ? ` — Detalhe: ${JSON.stringify(err.detail)}` : ''
    throw new Error((err.error || `Erro no Clinicorp (HTTP ${res.status})`) + detail)
  }
  const data = await res.json()
  console.log('[Clinicorp] Agendamento criado com sucesso:', data)
  return data
}
