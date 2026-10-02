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
export const isUuid = (v) => typeof v === 'string' && UUID.test(v)

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
        // Sem idconta, vale a clínica única da chave
        ...(companyId ? { 'X-Clinica': String(companyId) } : {}),
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
    ...(isUuid(contactId) ? { contatoPlataformaId: contactId } : {}),
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

// ── Setup ────────────────────────────────────────────────────────

// Testa a chave da clínica e traz as unidades do CRM, só com leituras:
// GET /eu (a chave escreve? vê o CRC1?) e GET /unidades.
export async function checkCrmConnection(call) {
  const [me, { unidades }] = await Promise.all([call('GET', '/eu'), call('GET', '/unidades')])
  if (!me?.podeEscrever) {
    throw new CrmError('Esta chave do CRM é só de leitura. O botão precisa de uma chave com escrita.', 403, 'CHAVE_SO_LEITURA')
  }
  if (Array.isArray(me.paineis) && !me.paineis.includes('crc1')) {
    throw new CrmError('Esta chave do CRM não vê o painel CRC1, onde fica a coluna Agendados.', 403, 'CHAVE_SEM_CRC1')
  }
  return {
    clinicName: me.clinica?.nome ?? null,
    units: (unidades ?? []).map(u => ({ id: u.id, name: u.nome, active: u.ativa !== false })),
  }
}

// Erro do CRM em frase para o admin, sem jargão de HTTP.
export function describeCrmError(err, companyId) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err instanceof TypeError) {
    return 'Não foi possível falar com o CRM agora. Tente de novo em instantes.'
  }
  switch (err?.code) {
    case 'CHAVE_INVALIDA':
    case 'SEM_CREDENCIAL':
      return 'O CRM recusou a chave. Confira se ela foi copiada inteira e se não foi revogada.'
    case 'CLINICA_FORA_DA_CHAVE':
      return `Esta chave não alcança a clínica no CRM. Confira se a clínica está cadastrada no CRM com o idconta ${companyId} e se a chave inclui essa clínica.`
    case 'CLINICA_INATIVA':
      return 'A clínica não está ativa no CRM.'
    case 'CHAVE_SO_LEITURA':
    case 'CHAVE_SEM_CRC1':
      return err.message
    default:
      return `Erro do CRM: ${err?.message ?? 'desconhecido'}`
  }
}

// Campos do CRM no PUT da clínica. A chave é write-only, como o token Helena.
// Chave nova, ou envio sendo ligado, passa pelo teste de conexão antes de gravar.
// `test(apiKey)` lança se o CRM recusar. Devolve { patch } ou { error }.
export async function crmClinicPatch(body, current, test) {
  const patch = {}
  const newKey = typeof body?.crmApiKey === 'string' ? body.crmApiKey.trim() : ''
  if (newKey) patch.crm_api_key = newKey
  if (typeof body?.crmEnabled === 'boolean') patch.crm_enabled = body.crmEnabled

  const enabling = patch.crm_enabled === true && current?.crm_enabled !== true
  const willBeEnabled = patch.crm_enabled ?? current?.crm_enabled === true
  const key = patch.crm_api_key ?? current?.crm_api_key ?? ''

  if (willBeEnabled && !key) {
    return { error: 'Para enviar ao CRM, preencha a chave da API do CRM.' }
  }
  if (key && (patch.crm_api_key || enabling)) {
    try {
      await test(key)
    } catch (err) {
      return { error: describeCrmError(err, current?.helena_account_id) }
    }
  }
  return { patch }
}
