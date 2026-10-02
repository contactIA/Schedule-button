// Espelho do card no CRM ContactIA via /api/crm. Fire-and-forget: a chave do
// CRM fica no servidor, a clínica sem crm_enabled é ignorada lá, e nenhuma
// falha chega ao operador nem atrasa o agendamento.
export function syncCrmCard(payload) {
  fetch('/api/crm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // Continua mesmo se o operador fechar a tela logo após confirmar
    keepalive: true,
  })
    .then(r => r.json())
    .then(r => { if (r?.status === 'error') console.warn('[CRM] Espelho do card falhou:', r.error) })
    .catch(err => console.warn('[CRM] Espelho do card indisponível:', err.message))
}
