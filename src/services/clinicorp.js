// Chama o handler Vercel /api/clinicorp que usa as credenciais do Supabase
// pelo idconta recebido na URL.

export async function fetchClinicorpSlots(date, idconta) {
  const res = await fetch(`/api/clinicorp?date=${date}&idconta=${idconta}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar horários (HTTP ${res.status})`)
  }
  return res.json()
}

export async function scheduleClinicorp(payload, idconta) {
  const res = await fetch(`/api/clinicorp?idconta=${idconta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[Clinicorp] Falha ao agendar. Payload:', payload, 'Resposta:', err)
    const detail = err.detail ? ` — Detalhe: ${JSON.stringify(err.detail)}` : ''
    throw new Error((err.error || `Erro no Clinicorp (HTTP ${res.status})`) + detail)
  }
  const data = await res.json()
  console.log('[Clinicorp] Agendamento criado:', data)
  return data
}
