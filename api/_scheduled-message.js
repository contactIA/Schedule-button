// Converte o scheduled_message do banco para o runtime: shape antigo
// (mensagem única) vira lista; mensagens ocultas (active: false) saem.
// Usado pelo /api/clinic (o que o operador vê) e pelo /api/proxy (o lembrete
// só sai com um modelo daqui).
export function normalizeScheduledMessage(sm) {
  if (!sm?.enabled) return null
  const raw = Array.isArray(sm.messages)
    ? sm.messages
    : [{ id: 'msg-legado', label: sm.templateName || 'Lembrete', ...sm }]
  const messages = raw
    .filter(m => m.active !== false && m.templateId)
    .map(m => ({
      id:          m.id,
      label:       m.label || m.templateName || 'Lembrete',
      channelFrom: m.channelFrom,
      templateId:  m.templateId,
      paramMap:    m.paramMap ?? {},
      timing:      m.timing ?? null,
    }))
  return messages.length > 0 ? { enabled: true, messages } : null
}

// O lembrete que vale para a clínica (CRM#218): na clínica provisionada pelo
// CRM, só quando o CRM escolheu o botão como remetente do lembrete de consulta
// (envia_lembrete_de_consulta). A clínica cadastrada só aqui segue como antes.
export function clinicScheduledMessage(clinic) {
  if (clinic?.provisionado_em && clinic.envia_lembrete_de_consulta !== true) return null
  return normalizeScheduledMessage(clinic?.scheduled_message)
}
