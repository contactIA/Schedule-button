// Chama o handler Vercel /api/clinicorp que usa as credenciais da unit no Supabase.

export async function fetchClinicorpSlots(date, idconta, unitId) {
  const params = new URLSearchParams({ date, idconta })
  if (unitId) params.set('unitId', unitId)
  const res = await fetch(`/api/clinicorp?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar horários (HTTP ${res.status})`)
  }
  return res.json()
}

export async function scheduleClinicorp(payload, idconta, unitId) {
  const params = new URLSearchParams({ idconta })
  if (unitId) params.set('unitId', unitId)
  const res = await fetch(`/api/clinicorp?${params}`, {
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
