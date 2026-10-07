import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeProxyHandler, matchRoute } from './proxy.js'
import * as front from '../src/services/helena.js'

delete process.env.EMBED_HOSTS

const APP = 'schedule-button-xi.vercel.app'
const CONTATO = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'
const PAINEL = '7a1e2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const ETAPA = '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9'
const CARD = 'c0ffee00-1234-4abc-9def-0123456789ab'

const clinic = {
  helena_token: 'tok_da_clinica',
  scheduled_message: {
    enabled: true,
    messages: [{ id: 'm1', label: 'Véspera', channelFrom: 'canal-1', templateId: 'tpl-1', paramMap: { '[NOME]': 'patient_name' } }],
  },
}

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b; return this },
  }
}

function harness({ loadClinic = async () => clinic } = {}) {
  const forwarded = []
  const loaded = []
  const handler = makeProxyHandler({
    loadClinic: async (id) => { loaded.push(id); return loadClinic(id) },
    fetchImpl: async (url, opts) => {
      forwarded.push({ url, method: opts.method, auth: opts.headers.Authorization, body: opts.body })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    },
  })
  return { handler, forwarded, loaded }
}

function proxyReq(method, path, body, headers = { origin: `https://${APP}` }) {
  return {
    method,
    url: '/api/proxy',
    headers: { host: APP, 'x-target-path': path, 'x-idconta': 'acc1', ...headers },
    body,
  }
}

async function send(h, method, path, body, headers) {
  const res = fakeRes()
  await h.handler(proxyReq(method, path, body, headers), res)
  return res
}

// Roda as funções do front (src/services/helena.js) e guarda o que cada uma
// mandaria ao proxy: é o contrato da lista.
async function captureFront(run) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ method: opts.method ?? 'GET', path: opts.headers['x-target-path'], body: opts.body })
    return new Response(JSON.stringify({ id: CONTATO, items: [{ id: PAINEL, steps: [], tags: [] }] }), { status: 200 })
  }
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
  return calls
}

test('contrato: tudo o que o front pede passa pelo proxy, com o token da clínica', async () => {
  const calls = await captureFront(async () => {
    await front.getContact(CONTATO, 'acc1')
    await front.findContactByPhone('62999990000', 'acc1')
    await front.findCardByContact(CONTATO, 'acc1', PAINEL)
    await front.getPanelData(PAINEL, 'acc1')
    await front.createCard(ETAPA, PAINEL, 'Ana', 'Obs', CONTATO, 'acc1', { agendado_para: '2026-10-10T17:00:00.000Z' }, ['t1'])
    await front.updateCardStep(CARD, ETAPA, 'acc1', { agendado_para: '2026-10-10T17:00:00.000Z' }, ['t1', 't2'])
    await front.updateCardStep(CARD, ETAPA, 'acc1')
    await front.addCardNote(CARD, 'Obs', 'acc1')
    await front.scheduleReminder(
      clinic.scheduled_message.messages[0],
      { phone: '62999990000', patientName: 'Ana', dateBr: '10/10/2026', time: '14:00', scheduling: '2026-10-09T12:00:00.000Z' },
      'acc1',
    )
  })
  assert.equal(calls.length, 9)

  const h = harness()
  for (const c of calls) {
    // A Vercel entrega o corpo JSON já lido
    const res = await send(h, c.method, c.path, c.body ? JSON.parse(c.body) : undefined)
    assert.equal(res.statusCode, 200, `${c.method} ${c.path} foi recusado: ${JSON.stringify(res.body)}`)
  }
  assert.deepEqual(h.forwarded.map(f => `${f.method} ${f.url}`), calls.map(c => `${c.method} https://api.wts.chat${c.path}`))
  assert.ok(h.forwarded.every(f => f.auth === 'Bearer tok_da_clinica'))
})

test('recusa método e caminho fora da lista, sem ir ao banco nem à plataforma', async () => {
  const h = harness()
  const fora = [
    ['DELETE', `/crm/v1/panel/card/${CARD}`],
    ['OPTIONS', `/core/v1/contact/${CONTATO}`],
    ['HEAD', `/core/v1/contact/${CONTATO}`],
    ['GET', '/core/v1/user'],
    ['GET', '/core/v1/contact'],
    ['POST', '/chat/v1/message/send'],
    ['PUT', `/core/v1/contact/${CONTATO}`],
    ['POST', `/crm/v2/panel/card/${CARD}`],
    // Andar na árvore da API
    ['GET', `/core/v1/contact/../../crm/v1/panel/card`],
    ['GET', `/core/v1/contact/%2e%2e%2fuser`],
    ['GET', `/core/v1/contact/${CONTATO}/`],
    ['GET', `/core/v1/contact/${CONTATO}#x`],
    // Caminho que não começa em /
    ['GET', '.evil.com/core/v1/contact/x'],
    ['GET', '@evil.com/core/v1/contact/x'],
    ['GET', '//evil.com/core/v1/contact/x'],
    // Busca por telefone com outra coisa que dígitos
    ['GET', '/core/v1/contact/phonenumber/5562abc'],
  ]
  for (const [method, path] of fora) {
    const res = await send(h, method, path)
    assert.equal(res.statusCode, 403, `${method} ${path} deveria ser recusado`)
    assert.deepEqual(res.body, { error: 'path_not_allowed' })
  }
  assert.equal(h.loaded.length, 0)
  assert.equal(h.forwarded.length, 0)
})

test('busca de card: sempre de um contato, uma página de 1 (não lista o painel)', async () => {
  const ok = `/crm/v1/panel/card?PanelId=${PAINEL}&ContactId=${CONTATO}&PageSize=1&PageNumber=1`
  assert.ok(matchRoute('GET', ok))
  const recusados = [
    `/crm/v1/panel/card?PanelId=${PAINEL}`,
    `/crm/v1/panel/card?PanelId=${PAINEL}&PageSize=500`,
    `/crm/v1/panel/card?PanelId=${PAINEL}&ContactId=${CONTATO}&PageSize=100&PageNumber=1`,
    `/crm/v1/panel/card?PanelId=${PAINEL}&ContactId=${CONTATO}&PageSize=1&PageNumber=2`,
    `${ok}&Extra=1`,
    `${ok}&ContactId=${CARD}`,
    `/crm/v1/panel/card?PanelId=${PAINEL}&ContactId=a%2Fb&PageSize=1&PageNumber=1`,
  ]
  for (const p of recusados) assert.equal(matchRoute('GET', p), null, p)
})

test('painéis: só etapas e etiquetas, até 100 por página', () => {
  assert.equal(matchRoute('GET', '/crm/v2/panel?PageSize=100&IncludeDetails=Steps&IncludeDetails=Tags').path,
    '/crm/v2/panel?PageSize=100&IncludeDetails=Steps&IncludeDetails=Tags')
  assert.equal(matchRoute('GET', '/crm/v2/panel?PageSize=1000'), null)
  assert.equal(matchRoute('GET', '/crm/v2/panel?IncludeDetails=Users'), null)
  assert.equal(matchRoute('GET', '/crm/v2/panel?PageSize=100&PageSize=100'), null)
})

test('mover card: recusa mexer em outro campo que não etapa, campos personalizados e etiquetas', async () => {
  const h = harness()
  const path = `/crm/v2/panel/card/${CARD}`
  for (const body of [
    { fields: ['title'], title: 'x' },
    { fields: ['stepId', 'contactIds'], stepId: ETAPA, contactIds: [] },
    { stepId: ETAPA },
    { fields: [], title: 'x' },
    // Chave fora das que o front manda, ou a mesma com outra grafia
    { fields: ['stepId'], stepId: ETAPA, title: 'x' },
    { fields: ['stepId'], stepId: ETAPA, Fields: ['title'], title: 'x' },
    [{ fields: ['stepId'] }],
    undefined,
  ]) {
    const res = await send(h, 'PUT', path, body)
    assert.equal(res.statusCode, 403, JSON.stringify(body))
    assert.deepEqual(res.body, { error: 'body_not_allowed' })
  }
  // Corpo como texto também é lido
  const res = await send(h, 'PUT', path, JSON.stringify({ fields: ['stepId'], stepId: ETAPA }))
  assert.equal(res.statusCode, 200)
  assert.equal(h.forwarded.length, 1)
})

test('mover card: vai à plataforma o corpo conferido, não o texto recebido', async () => {
  const h = harness()
  const texto = `{"fields":["title"],"fields":["stepId"],"stepId":"${ETAPA}"}`
  const res = await send(h, 'PUT', `/crm/v2/panel/card/${CARD}`, texto)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(h.forwarded[0].body), { fields: ['stepId'], stepId: ETAPA })
  assert.equal(h.forwarded[0].body.includes('title'), false)
})

test('lembrete: só um modelo do Setup, pelo canal dele', async () => {
  const h = harness()
  const path = '/chat/v1/scheduled-message'
  const base = { from: 'canal-1', to: '5562999990000', type: 'TEMPLATE', templateId: 'tpl-1', templateParams: { parameters: {}, file: null } }
  for (const body of [
    { ...base, templateId: 'tpl-outro' },
    { ...base, from: 'canal-2' },
    { ...base, from: undefined },
    { ...base, type: 'TEXT', text: 'promoção' },
    { from: 'canal-1', to: '5562999990000', type: 'TEXT', text: 'oi' },
    // A mesma chave com outra grafia, ou chave que o front não manda
    { ...base, TemplateId: 'tpl-outro' },
    { ...base, Type: 'CHATBOT' },
    { ...base, From: 'canal-2' },
    { ...base, botId: 'bot-1' },
    undefined,
  ]) {
    const res = await send(h, 'POST', path, body)
    assert.equal(res.statusCode, 403, JSON.stringify(body))
  }
  assert.equal(h.forwarded.length, 0)

  assert.equal((await send(h, 'POST', path, base)).statusCode, 200)

  // Clínica com o lembrete desligado não manda nenhum
  const off = harness({ loadClinic: async () => ({ ...clinic, scheduled_message: { ...clinic.scheduled_message, enabled: false } }) })
  assert.equal((await send(off, 'POST', path, base)).statusCode, 403)
  // Mensagem oculta no Setup também não
  const hidden = harness({ loadClinic: async () => ({ ...clinic, scheduled_message: { enabled: true, messages: [{ ...clinic.scheduled_message.messages[0], active: false }] } }) })
  assert.equal((await send(hidden, 'POST', path, base)).statusCode, 403)
})

test('lembrete no formato antigo (mensagem única) continua passando', async () => {
  const legado = harness({ loadClinic: async () => ({ ...clinic, scheduled_message: { enabled: true, channelFrom: 'canal-1', templateId: 'tpl-1', paramMap: {} } }) })
  const res = await send(legado, 'POST', '/chat/v1/scheduled-message', { from: 'canal-1', to: '5562999990000', type: 'TEMPLATE', templateId: 'tpl-1' })
  assert.equal(res.statusCode, 200)
})

test('recusa pedido de fora do app antes de ir ao banco', async () => {
  const h = harness()
  for (const headers of [{ origin: 'https://evil.com' }, { referer: 'https://evil.com/' }, {}]) {
    const res = await send(h, 'GET', `/core/v1/contact/${CONTATO}`, undefined, headers)
    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, { error: 'origin_not_allowed' })
  }
  assert.equal(h.loaded.length, 0)
  assert.equal(h.forwarded.length, 0)

  // GET do próprio app vem com Referer, sem Origin
  const res = await send(h, 'GET', `/core/v1/contact/${CONTATO}`, undefined, { referer: `https://${APP}/?idconta=acc1&contactId=${CONTATO}` })
  assert.equal(res.statusCode, 200)
})

test('clínica não cadastrada continua 404, sem chamar a plataforma', async () => {
  const h = harness({ loadClinic: async () => null })
  const res = await send(h, 'GET', `/core/v1/contact/${CONTATO}`)
  assert.equal(res.statusCode, 404)
  assert.equal(h.forwarded.length, 0)
})
