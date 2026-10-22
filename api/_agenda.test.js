import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agendaDays, agendaSlots, bookAgenda, describeAgendaError, dateIn, makeAgendaHandler } from './_agenda.js'
import handleClinicorp from './clinicorp.js'
import { CrmError } from './_crm.js'

delete process.env.EMBED_HOSTS

const APP = 'schedule-button-xi.vercel.app'
const UNIDADE_CRM = '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11'
const ANA = '8b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const BRUNO = '9c2e3d4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const contactId = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'

// Dublê da API do CRM: registra as chamadas e responde por rota (sem a query).
function fakeCall(routes) {
  const calls = []
  const call = async (method, path, body) => {
    calls.push({ method, path, body })
    const key = `${method} ${path.split('?')[0].replace(/\/cards\/[^/]+/, '/cards/:id')}`
    const handler = routes[key]
    if (!handler) throw new Error(`rota inesperada: ${key}`)
    return typeof handler === 'function' ? handler(body, path) : handler
  }
  return { call, calls }
}

const horarios = {
  profissionais: [
    { profissional: { id: ANA, nome: 'Dra. Ana' }, horarios: [
      { inicio: '2026-10-23T13:00:00.000Z', fim: '2026-10-23T13:30:00.000Z', cadeiraId: 'c1' },
      { inicio: '2026-10-23T11:00:00.000Z', fim: '2026-10-23T11:30:00.000Z', cadeiraId: 'c1' },
    ] },
    { profissional: { id: BRUNO, nome: 'Dr. Bruno' }, horarios: [
      { inicio: '2026-10-23T11:00:00.000Z', fim: '2026-10-23T11:30:00.000Z', cadeiraId: 'c2' },
    ] },
  ],
}

test('dias: de hoje, no fuso da clínica, a seis semanas', async () => {
  const { call, calls } = fakeCall({ 'GET /agenda/dias-livres': { dias: ['2026-10-22', '2026-10-23'] } })
  // 02:00 UTC do dia 22 ainda é dia 21 em São Paulo
  const dias = await agendaDays(call, { unitId: UNIDADE_CRM, timeZone: 'America/Sao_Paulo', now: Date.parse('2026-10-22T02:00:00Z') })
  assert.deepEqual(dias, ['2026-10-22', '2026-10-23'])
  const query = new URL(`https://crm${calls[0].path}`).searchParams
  assert.equal(query.get('unidadeId'), UNIDADE_CRM)
  assert.equal(query.get('de'), '2026-10-21')
  assert.equal(query.get('ate'), '2026-12-01')
})

test('horários: por hora, no fuso da clínica, com o instante para marcar', async () => {
  const { call, calls } = fakeCall({ 'GET /agenda/horarios-livres': horarios })
  const slots = await agendaSlots(call, { unitId: UNIDADE_CRM, date: '2026-10-23', timeZone: 'America/Sao_Paulo' })
  assert.match(calls[0].path, /unidadeId=3f5c9a1e-.*&data=2026-10-23$/)
  assert.deepEqual(slots, [
    { from: '08:00', to: '08:30', start: '2026-10-23T11:00:00.000Z', professionalId: ANA, professionalName: 'Dra. Ana' },
    { from: '08:00', to: '08:30', start: '2026-10-23T11:00:00.000Z', professionalId: BRUNO, professionalName: 'Dr. Bruno' },
    { from: '10:00', to: '10:30', start: '2026-10-23T13:00:00.000Z', professionalId: ANA, professionalName: 'Dra. Ana' },
  ])

  const manaus = await agendaSlots(fakeCall({ 'GET /agenda/horarios-livres': horarios }).call, { unitId: UNIDADE_CRM, date: '2026-10-23', timeZone: 'America/Manaus' })
  assert.equal(manaus[0].from, '07:00')
})

const pedido = (over = {}) => ({
  unitId: UNIDADE_CRM, professionalId: ANA, start: '2026-10-23T13:00:00.000Z',
  name: 'Maria Souza', phone: '62999990000', contactId,
  appointmentNote: 'Agendado pela plataforma.', cardNote: 'Agendamento: 2026-10-23 às 10:00\n\nAgendado pela plataforma.',
  ...over,
})

test('marcar: cria o card, marca a consulta ligada a ele e não move o card', async () => {
  const { call, calls } = fakeCall({
    'POST /cards': { card: { id: 'k1', painel: 'crc1' }, resultado: 'criado' },
    'POST /agenda/consultas': { id: 'q1', status: 'agendada' },
  })
  const r = await bookAgenda(call, pedido())
  assert.deepEqual(r, { cardId: 'k1', consultaId: 'q1', resultado: 'criado' })
  assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), ['POST /cards', 'POST /agenda/consultas'])
  assert.deepEqual(calls[0].body, {
    telefone: '62999990000', nome: 'Maria Souza', contatoPlataformaId: contactId,
    unidadeId: UNIDADE_CRM, descricao: pedido().cardNote,
  })
  assert.deepEqual(calls[1].body, {
    unidadeId: UNIDADE_CRM, profissionalId: ANA, inicio: '2026-10-23T13:00:00.000Z',
    paciente: { nome: 'Maria Souza', telefone: '62999990000' }, cardId: 'k1',
    observacoes: 'Agendado pela plataforma.',
  })
})

test('marcar com o card já aberto: a observação vira anotação depois da consulta, e a falha nela não desfaz', async () => {
  const { call, calls } = fakeCall({
    'POST /cards': { card: { id: 'k1', painel: 'crc1' }, resultado: 'ja_aberto' },
    'POST /agenda/consultas': { id: 'q1' },
    'POST /cards/:id/anotacoes': () => { throw new CrmError('fora do ar', 503) },
  })
  const r = await bookAgenda(call, pedido())
  assert.equal(r.consultaId, 'q1')
  assert.deepEqual(calls.map(c => c.path), ['/cards', '/agenda/consultas', '/cards/k1/anotacoes'])
})

test('horário ocupado: a consulta é recusada, nada mais é chamado e o erro pede outro horário', async () => {
  const { call, calls } = fakeCall({
    'POST /cards': { card: { id: 'k1', painel: 'crc1' }, resultado: 'ja_aberto' },
    'POST /agenda/consultas': () => { throw new CrmError('O profissional já tem consulta ou bloqueio nesse horário', 409, 'HORARIO_DO_PROFISSIONAL_OCUPADO') },
  })
  await assert.rejects(bookAgenda(call, pedido()), (err) => {
    assert.equal(describeAgendaError(err), 'O profissional já tem consulta ou bloqueio nesse horário. Escolha outro horário.')
    return true
  })
  assert.equal(calls.length, 2)
})

test('marcar sem telefone não chama o CRM', async () => {
  const { call, calls } = fakeCall({})
  await assert.rejects(bookAgenda(call, pedido({ phone: '' })), { code: 'SEM_TELEFONE' })
  assert.equal(calls.length, 0)
})

test('erros em frase: a chave recusada e o CRM fora do ar', () => {
  assert.match(describeAgendaError(new CrmError('x', 401, 'CHAVE_INVALIDA')), /recusou a chave/)
  assert.match(describeAgendaError(new TypeError('fetch failed')), /Não foi possível falar com a agenda/)
  assert.equal(describeAgendaError(new CrmError('A agenda não está ligada nesta clínica', 403, 'AGENDA_DESLIGADA')), 'A agenda não está ligada nesta clínica')
})

test('dateIn: a data do instante no fuso', () => {
  assert.equal(dateIn(Date.parse('2026-10-22T02:00:00Z'), 'America/Sao_Paulo'), '2026-10-21')
  assert.equal(dateIn(Date.parse('2026-10-22T03:00:00Z'), 'America/Sao_Paulo'), '2026-10-22')
})

// ── Rota ─────────────────────────────────────────────────────────

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
  }
}

const req = (method, query, body) => ({
  method, query, body, url: '/api/clinicorp',
  headers: { host: APP, referer: `https://${APP}/?idconta=acc1` },
})

const clinic = (over = {}) => ({
  id: 'c1', helena_account_id: 'acc1', crm_api_key: 'crm_chave', fuso_horario: 'America/Sao_Paulo',
  units: [
    { id: 'u-centro', agenda: false, crm_unit_id: '11111111-1111-4111-8111-111111111111' },
    { id: 'u-sul', agenda: true, crm_unit_id: UNIDADE_CRM },
  ],
  ...over,
})

function handlerWith(clinicRow, routes) {
  const fake = fakeCall(routes)
  let opened = null
  const handler = makeAgendaHandler({
    loadClinic: async () => clinicRow,
    client: (opts) => { opened = opts; return fake.call },
  })
  return { handler, calls: fake.calls, opened: () => opened }
}

test('rota: os horários da unidade da agenda, com a chave e o idconta da clínica', async () => {
  const h = handlerWith(clinic(), { 'GET /agenda/horarios-livres': horarios })
  const res = fakeRes()
  await h.handler(req('GET', { idconta: 'acc1', unitId: 'u-sul', date: '2026-10-23' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.length, 3)
  assert.equal(h.opened().apiKey, 'crm_chave')
  assert.equal(h.opened().companyId, 'acc1')
  assert.match(h.calls[0].path, new RegExp(UNIDADE_CRM))
})

test('rota: marcar devolve a consulta; o horário ocupado volta 409 com a frase', async () => {
  const body = { patientName: ' Maria ', patientPhone: '(62) 99999-0000', contactId, professionalId: ANA, start: '2026-10-23T13:00:00.000Z', appointmentNote: 'x', cardNote: 'y' }
  let h = handlerWith(clinic(), {
    'POST /cards': { card: { id: 'k1' }, resultado: 'criado' },
    'POST /agenda/consultas': { id: 'q1' },
  })
  let res = fakeRes()
  await h.handler(req('POST', { idconta: 'acc1', unitId: 'u-sul' }, body), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true, cardId: 'k1', consultaId: 'q1', resultado: 'criado' })
  assert.equal(h.calls[0].body.telefone, '62999990000')
  assert.equal(h.calls[0].body.nome, 'Maria')

  h = handlerWith(clinic(), {
    'POST /cards': { card: { id: 'k1' }, resultado: 'ja_aberto' },
    'POST /agenda/consultas': () => { throw new CrmError('O profissional já tem consulta ou bloqueio nesse horário', 409, 'HORARIO_DO_PROFISSIONAL_OCUPADO') },
  })
  res = fakeRes()
  await h.handler(req('POST', { idconta: 'acc1', unitId: 'u-sul' }, body), res)
  assert.equal(res.statusCode, 409)
  assert.match(res.body.error, /Escolha outro horário/)
})

test('rota: recusa a unidade do Clinicorp, a de outra clínica, a clínica sem chave e o pedido sem origem', async () => {
  let h = handlerWith(clinic(), {})
  let res = fakeRes()
  await h.handler(req('GET', { idconta: 'acc1', unitId: 'u-centro', date: '2026-10-23' }), res)
  assert.equal(res.statusCode, 404)
  res = fakeRes()
  await h.handler(req('GET', { idconta: 'acc1', unitId: 'u-de-outra', date: '2026-10-23' }), res)
  assert.equal(res.statusCode, 404)

  h = handlerWith(clinic({ crm_api_key: null }), {})
  res = fakeRes()
  await h.handler(req('GET', { idconta: 'acc1', unitId: 'u-sul', days: '1' }), res)
  assert.equal(res.statusCode, 409)
  assert.equal(h.calls.length, 0)

  h = handlerWith(clinic(), {})
  res = fakeRes()
  await h.handler({ ...req('GET', { idconta: 'acc1', unitId: 'u-sul', days: '1' }), headers: { host: APP, origin: 'https://outro.site' } }, res)
  assert.equal(res.statusCode, 403)
  assert.equal(h.calls.length, 0)

  res = fakeRes()
  await h.handler(req('POST', { idconta: 'acc1', unitId: 'u-sul' }, { patientName: 'Maria', professionalId: 'abc', start: 'ontem' }), res)
  assert.equal(res.statusCode, 400)
})

test('rota: o /api/clinicorp com ?agenda=1 vai para a agenda, sem abrir outra função', async () => {
  const res = fakeRes()
  await handleClinicorp(req('GET', { agenda: '1', idconta: 'acc1' }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'Parâmetros idconta e unitId obrigatórios')
})
