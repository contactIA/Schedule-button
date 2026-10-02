import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crmClient, syncAppointment, CrmError } from './_crm.js'

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
