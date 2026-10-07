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
