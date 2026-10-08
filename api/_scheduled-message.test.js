import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clinicScheduledMessage } from './_scheduled-message.js'
import { makeClinicHandler } from './clinic.js'
import { makeProxyHandler } from './proxy.js'

// CRM#218: um remetente do lembrete de consulta por clínica. Na clínica
// provisionada pelo CRM, o botão só agenda o lembrete quando o CRM o escolheu
// (enviaLembreteDeConsulta: true). A clínica cadastrada só aqui segue igual.

delete process.env.EMBED_HOSTS
const APP = 'schedule-button-xi.vercel.app'

const lembrete = {
  enabled: true,
  messages: [{ id: 'm1', label: 'Véspera', channelFrom: 'canal-1', templateId: 'tpl-1', paramMap: {} }],
}
const base = {
  id: 'c1', name: 'Prev', active: true, helena_account_id: 'acc1', helena_token: 'tok',
  helena_panel_id: 'p1', helena_agendado_step_id: 's1', helena_steps: [], helena_tags: [],
  scheduled_message: lembrete, units: [],
}
const naoProvisionada = { ...base }
const provisionadaComBotao = { ...base, provisionado_em: '2026-10-08T12:00:00.000Z', envia_lembrete_de_consulta: true }
const provisionadaSemBotao = { ...base, provisionado_em: '2026-10-08T12:00:00.000Z', envia_lembrete_de_consulta: false }
const provisionadaSemValor = { ...base, provisionado_em: '2026-10-08T12:00:00.000Z', envia_lembrete_de_consulta: null }

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b; return this },
  }
}

test('a escolha do CRM decide; sem provisionamento, vale o lembrete ligado no setup daqui', () => {
  assert.equal(clinicScheduledMessage(naoProvisionada).messages.length, 1)
  assert.equal(clinicScheduledMessage(provisionadaComBotao).messages.length, 1)
  assert.equal(clinicScheduledMessage(provisionadaSemBotao), null)
  assert.equal(clinicScheduledMessage(provisionadaSemValor), null)
  // o botão escolhido, mas sem lembrete configurado aqui: nada a agendar
  assert.equal(clinicScheduledMessage({ ...provisionadaComBotao, scheduled_message: { enabled: false } }), null)
})

async function telaDoOperador(clinic) {
  const res = fakeRes()
  await makeClinicHandler({ loadClinic: async () => clinic })({
    method: 'GET', query: { idconta: 'acc1' },
    headers: { host: APP, referer: `https://${APP}/?idconta=acc1` },
  }, res)
  assert.equal(res.statusCode, 200)
  return res.body.scheduledMessage
}

async function agendarPeloProxy(clinic) {
  const forwarded = []
  const res = fakeRes()
  await makeProxyHandler({
    loadClinic: async () => clinic,
    fetchImpl: async (url) => { forwarded.push(url); return new Response('{}', { status: 200 }) },
  })({
    method: 'POST', url: '/api/proxy',
    headers: { host: APP, origin: `https://${APP}`, 'x-target-path': '/chat/v1/scheduled-message', 'x-idconta': 'acc1' },
    body: { from: 'canal-1', to: '5562999990000', type: 'TEMPLATE', templateId: 'tpl-1', scheduling: '2026-10-09T12:00:00.000Z' },
  }, res)
  return { status: res.statusCode, forwarded }
}

test('com o botão escolhido, a tela recebe o lembrete e o proxy agenda', async () => {
  assert.ok(await telaDoOperador(provisionadaComBotao))
  const r = await agendarPeloProxy(provisionadaComBotao)
  assert.equal(r.status, 200)
  assert.equal(r.forwarded.length, 1)
})

test('com outro remetente escolhido no CRM, a tela não recebe o lembrete e o proxy recusa agendar', async () => {
  for (const clinic of [provisionadaSemBotao, provisionadaSemValor]) {
    assert.equal(await telaDoOperador(clinic), null)
    const r = await agendarPeloProxy(clinic)
    assert.equal(r.status, 403)
    assert.equal(r.forwarded.length, 0)
  }
})

test('a clínica não provisionada segue como hoje', async () => {
  assert.ok(await telaDoOperador(naoProvisionada))
  assert.equal((await agendarPeloProxy(naoProvisionada)).status, 200)
})

test('a clínica que chegou pelo CRM sem painel escolhido não carrega no botão', async () => {
  const res = fakeRes()
  await makeClinicHandler({ loadClinic: async () => ({ ...provisionadaComBotao, helena_panel_id: null, helena_panels: null }) })({
    method: 'GET', query: { idconta: 'acc1' },
    headers: { host: APP, referer: `https://${APP}/?idconta=acc1` },
  }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, 'not_registered')
})
