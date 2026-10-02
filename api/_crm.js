// Espelha no CRM ContactIA o card que o botão acabou de gravar no painel nativo.
// Roda ao lado do painel nativo, ligado por clínica (clinics.crm_enabled): uma
// falha aqui nunca desfaz nem bloqueia o agendamento.
//
// API: https://crm.contactia.com.br/api/docs. A clínica vai no X-Clinica pelo
// companyId da conta (o mesmo idconta do botão), e as colunas pelas chaves
// estáveis (`agendados`).

const DEFAULT_BASE_URL = 'https://crm.contactia.com.br/api/v1'
const TIMEOUT_MS = 8000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CrmError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function crmClient({ baseUrl, apiKey, companyId, fetchImpl = fetch }) {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Clinica':     companyId,
        'Content-Type':  'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      throw new CrmError(json?.erro || text.slice(0, 300) || `HTTP ${res.status}`, res.status, json?.codigo)
    }
    return json
  }
}

// Cria (ou acha) o card do contato e o leva para Agendados.
// POST /cards já é idempotente pelo telefone: contato com card aberto volta
// `ja_aberto`, e quem foi para Perda é reaberto — então não existe "buscar e
// depois criar" com corrida entre dois cliques.
export async function syncAppointment(call, input) {
  const { phone, name, contactId, unitId, scheduledFor, note } = input
  if (!phone) return { status: 'skipped', reason: 'sem_telefone' }

  const { card, resultado } = await call('POST', '/cards', {
    telefone: phone,
    nome: name || null,
    ...(contactId && UUID.test(contactId) ? { contatoPlataformaId: contactId } : {}),
    ...(unitId ? { unidadeId: unitId } : {}),
    ...(note ? { descricao: note } : {}),
  })

  // Card que já passou para o CRC2 não volta para Agendados (o CRM recusa
  // mover entre painéis); fica como está e o caso aparece no log.
  if (card.painel !== 'crc1') {
    return { status: 'skipped', reason: 'card_no_crc2', cardId: card.id, resultado }
  }

  // Sem `agendadoEm`: o agendamento acontece agora, e o instante do pedido é a
  // data real. Mandar um relógio de fora arrisca a recusa por "data no futuro".
  // Já em Agendados, o mesmo pedido só atualiza o "Agendado para" (reagendamento).
  const moved = await call('POST', `/cards/${card.id}/mover`, {
    etapa: 'agendados',
    ...(scheduledFor ? { agendadoPara: scheduledFor } : {}),
  })

  // No card novo a observação já foi como descrição; no existente vira anotação.
  if (note && resultado !== 'criado') {
    await call('POST', `/cards/${card.id}/anotacoes`, { texto: note })
  }

  return { status: 'ok', cardId: card.id, resultado, etapa: moved?.etapa?.chave ?? 'agendados' }
}
