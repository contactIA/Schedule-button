import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crmClient, syncAppointment, CrmError, checkCrmConnection, crmClinicPatch } from './_crm.js'

// Dublê da API do CRM: registra as chamadas e responde por rota.
function fakeCall(routes) {
  const calls = []
  const call = async (method, path, body) => {
    calls.push({ method, path, body })
    const key = `${method} ${path.replace(/\/cards\/[^/]+/, '/cards/:id')}`
    const handler = routes[key]
    if (!handler) throw new Error(`rota inesperada: ${key}`)
    return typeof handler === 'function' ? handler(body) : handler
  }
  return { call, calls }
}

const card = (over = {}) => ({ id: 'c1', painel: 'crc1', etapa: { chave: 'leads' }, ...over })
const contactId = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'

test('card novo: cria com descrição e move para Agendados com o "Agendado para"', async () => {
  const { call, calls } = fakeCall({
    'POST /cards': { card: card(), resultado: 'criado' },
    'POST /cards/:id/mover': { etapa: { chave: 'agendados' } },
  })
  const r = await syncAppointment(call, {
    phone: '62999990000', name: 'Ana', contactId, unitId: 'u1',
    scheduledFor: '2026-10-10T17:00:00.000Z', note: 'Agendado pela plataforma.',
  })
  assert.equal(r.status, 'ok')
  assert.deepEqual(calls.map(c => c.path), ['/cards', '/cards/c1/mover'])
  assert.deepEqual(calls[0].body, {
    telefone: '62999990000', nome: 'Ana', contatoPlataformaId: contactId,
    unidadeId: 'u1', descricao: 'Agendado pela plataforma.',
  })
  assert.deepEqual(calls[1].body, { etapa: 'agendados', agendadoPara: '2026-10-10T17:00:00.000Z' })
})

test('card já aberto: não cria outro, move e anota', async () => {
  const { call, calls } = fakeCall({
    'POST /cards': { card: card({ etapa: { chave: 'nao_agendados' } }), resultado: 'ja_aberto' },
    'POST /cards/:id/mover': { etapa: { chave: 'agendados' } },
    'POST /cards/:id/anotacoes': {},
  })
  const r = await syncAppointment(call, { phone: '62999990000', name: 'Ana', note: 'Obs' })
  assert.equal(r.resultado, 'ja_aberto')
  assert.deepEqual(calls.map(c => c.path), ['/cards', '/cards/c1/mover', '/cards/c1/anotacoes'])
  assert.deepEqual(calls[1].body, { etapa: 'agendados' })
  assert.deepEqual(calls[2].body, { texto: 'Obs' })
})

test('card no CRC2 fica onde está', async () => {
  const { call, calls } = fakeCall({ 'POST /cards': { card: card({ painel: 'crc2' }), resultado: 'ja_aberto' } })
  const r = await syncAppointment(call, { phone: '62999990000' })
  assert.equal(r.reason, 'card_no_crc2')
  assert.equal(calls.length, 1)
})

test('sem telefone não chama o CRM; contactId que não é UUID não vai', async () => {
  const empty = fakeCall({})
  assert.equal((await syncAppointment(empty.call, { phone: '' })).reason, 'sem_telefone')
  assert.equal(empty.calls.length, 0)

  const { call, calls } = fakeCall({
    'POST /cards': { card: card(), resultado: 'criado' },
    'POST /cards/:id/mover': {},
  })
  await syncAppointment(call, { phone: '62999990000', contactId: 'abc' })
  assert.equal('contatoPlataformaId' in calls[0].body, false)
})

test('cliente: manda chave e clínica e traduz o erro { erro, codigo }', async () => {
  let seen
  const fetchImpl = async (url, opts) => {
    seen = { url, opts }
    return new Response(JSON.stringify({ erro: 'Esta chave não alcança a clínica pedida', codigo: 'CLINICA_FORA_DA_CHAVE' }), { status: 403 })
  }
  const call = crmClient({ baseUrl: 'https://crm.test/api/v1/', apiKey: 'crm_x', companyId: 'acc1', fetchImpl })
  await assert.rejects(call('POST', '/cards', {}), (err) => {
    assert.ok(err instanceof CrmError)
    assert.equal(err.status, 403)
    assert.equal(err.code, 'CLINICA_FORA_DA_CHAVE')
    return true
  })
  assert.equal(seen.url, 'https://crm.test/api/v1/cards')
  assert.equal(seen.opts.headers.Authorization, 'Bearer crm_x')
  assert.equal(seen.opts.headers['X-Clinica'], 'acc1')
})

// ── Setup: teste de conexão e troca da chave ─────────────────────

const me = (over = {}) => ({ podeEscrever: true, paineis: ['crc1', 'crc2'], clinica: { nome: 'Prev Odonto' }, ...over })

test('teste de conexão: devolve a clínica e as unidades do CRM', async () => {
  const { call } = fakeCall({
    'GET /eu': me(),
    'GET /unidades': { unidades: [{ id: 'u1', nome: 'Centro', ativa: true }, { id: 'u2', nome: 'Sul', ativa: false }] },
  })
  assert.deepEqual(await checkCrmConnection(call), {
    clinicName: 'Prev Odonto',
    units: [{ id: 'u1', name: 'Centro', active: true }, { id: 'u2', name: 'Sul', active: false }],
  })
})

test('teste de conexão: chave só de leitura é recusada', async () => {
  const { call } = fakeCall({ 'GET /eu': me({ podeEscrever: false }), 'GET /unidades': { unidades: [] } })
  await assert.rejects(checkCrmConnection(call), { code: 'CHAVE_SO_LEITURA' })
})

const current = { helena_account_id: 'acc1', crm_enabled: false, crm_api_key: null }
const okTest = () => { const keys = []; return { keys, test: async (k) => { keys.push(k) } } }

test('chave nova: testa a conexão com ela e grava', async () => {
  const t = okTest()
  const r = await crmClinicPatch({ crmApiKey: '  crm_nova  ' }, { ...current, crm_api_key: 'crm_velha' }, t.test)
  assert.deepEqual(r, { patch: { crm_api_key: 'crm_nova' } })
  assert.deepEqual(t.keys, ['crm_nova'])
})

test('chave recusada pelo CRM: não grava e explica o motivo', async () => {
  const refuse = async () => { throw new CrmError('Chave da API inválida ou revogada', 401, 'CHAVE_INVALIDA') }
  const r = await crmClinicPatch({ crmApiKey: 'crm_errada', crmEnabled: true }, current, refuse)
  assert.equal(r.patch, undefined)
  assert.match(r.error, /recusou a chave/)
})

test('chave de outra clínica: o erro cita o idconta', async () => {
  const refuse = async () => { throw new CrmError('x', 403, 'CLINICA_FORA_DA_CHAVE') }
  const r = await crmClinicPatch({ crmApiKey: 'crm_x' }, current, refuse)
  assert.match(r.error, /idconta acc1/)
})

test('ligar o envio sem chave nenhuma é recusado', async () => {
  const t = okTest()
  const r = await crmClinicPatch({ crmEnabled: true }, current, t.test)
  assert.match(r.error, /preencha a chave/)
  assert.equal(t.keys.length, 0)
})

test('ligar o envio com a chave salva testa a chave salva', async () => {
  const t = okTest()
  const r = await crmClinicPatch({ crmEnabled: true }, { ...current, crm_api_key: 'crm_salva' }, t.test)
  assert.deepEqual(r, { patch: { crm_enabled: true } })
  assert.deepEqual(t.keys, ['crm_salva'])
})

test('desligar o envio não chama o CRM; campo vazio mantém a chave', async () => {
  const t = okTest()
  const r = await crmClinicPatch({ crmEnabled: false, crmApiKey: '   ' }, { ...current, crm_enabled: true, crm_api_key: 'crm_salva' }, t.test)
  assert.deepEqual(r, { patch: { crm_enabled: false } })
  assert.equal(t.keys.length, 0)
})
