// A unidade que marca na agenda do CRM (CRM#302), pelo /api/agenda: a chave do
// CRM fica no servidor. Mesmo formato do clinicorp.js, mais o `start` de cada
// horário, que volta como veio para marcar.

async function call(params, options) {
  const res = await fetch(`/api/agenda?${new URLSearchParams(params)}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro na agenda (HTTP ${res.status})`)
  return data
}

export const fetchAgendaDays = (idconta, unitId) => call({ days: '1', idconta, unitId })

export const fetchAgendaSlots = (date, idconta, unitId) => call({ date, idconta, unitId })

export async function scheduleAgenda(payload, idconta, unitId) {
  const data = await call({ idconta, unitId }, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[Agenda] Consulta marcada:', data)
  return data
}
