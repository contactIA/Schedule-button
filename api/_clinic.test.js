import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeClinicHandler } from './clinic.js'

delete process.env.EMBED_HOSTS

const APP = 'schedule-button-xi.vercel.app'

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
  }
}

const req = (headers = { referer: `https://${APP}/?idconta=acc1&contactId=c1` }) => ({
  method: 'GET', url: '/api/clinic?idconta=acc1', query: { idconta: 'acc1' }, headers: { host: APP, ...headers },
})

// A linha da clínica como sai do banco (select *), com todos os segredos.
const SEGREDOS = {
  helena_token: 'tok_plataforma_secreto',
  crm_api_key: 'crm_chave_secreta',
  clinicorp_user: 'usuario_clinicorp_secreto',
  clinicorp_token: 'tok_clinicorp_secreto',
  clinicorp_subscriber_id: 'assinante_secreto',
}
const clinic = {
  id: 'c1', slug: 'prev', name: 'Prev', active: true,
  helena_account_id: 'acc1',
  helena_token: SEGREDOS.helena_token,
  crm_api_key: SEGREDOS.crm_api_key,
  crm_enabled: true,
  helena_panel_id: 'p1',
  helena_agendado_step_id: 's2',
  helena_steps: [{ id: 's1', title: 'Novo' }, { id: 's2', name: 'Agendado' }],
  helena_tags: [{ id: 't1', label: 'Avaliação', locked: false }],
  helena_panels: [{ id: 'p1', name: 'Comercial', agendadoStepId: 's2', allowedTagIds: ['t1'] }],
  scheduled_message: { enabled: true, messages: [{ id: 'm1', label: 'Véspera', channelFrom: 'canal-1', templateId: 'tpl-1', paramMap: {} }] },
  units: [{
    id: 'u1', clinic_id: 'c1', name: 'Centro', position: 0, active: true,
    clinicorp_user: SEGREDOS.clinicorp_user,
    clinicorp_token: SEGREDOS.clinicorp_token,
    clinicorp_subscriber_id: SEGREDOS.clinicorp_subscriber_id,
    clinicorp_business_id: 4242, clinicorp_code_link: 7,
    crm_unit_id: 'crm-u1',
  }],
}

test('devolve a config da tela sem nenhum token nem credencial', async () => {
  const res = fakeRes()
  await makeClinicHandler({ loadClinic: async () => clinic })(req(), res)

  assert.equal(res.statusCode, 200)
  const texto = JSON.stringify(res.body)
  for (const [campo, valor] of Object.entries(SEGREDOS)) {
    assert.equal(texto.includes(valor), false, `${campo} vazou na resposta`)
  }
  assert.doesNotMatch(texto, /token|api_key|apiKey|clinicorp_|subscriber|password|senha/i)

  // O que o front usa continua lá
  assert.equal(res.body.name, 'Prev')
  assert.equal(res.body.panelId, 'p1')
  assert.deepEqual(res.body.units, [{ id: 'u1', name: 'Centro', position: 0, panelId: 'p1', agendadoStepId: 's2', steps: res.body.steps }])
  assert.deepEqual(res.body.steps, [{ id: 's1', name: 'Novo' }, { id: 's2', name: 'Agendado' }])
  assert.equal(res.body.scheduledMessage.messages[0].templateId, 'tpl-1')
})

test('recusa pedido de fora do app antes de ir ao banco', async () => {
  let loaded = false
  const handler = makeClinicHandler({ loadClinic: async () => { loaded = true; return clinic } })
  for (const headers of [{ origin: 'https://evil.com' }, { referer: 'https://evil.com/' }, {}]) {
    const res = fakeRes()
    await handler(req(headers), res)
    assert.equal(res.statusCode, 403)
  }
  assert.equal(loaded, false)
})

test('clínica não cadastrada continua not_registered', async () => {
  const res = fakeRes()
  await makeClinicHandler({ loadClinic: async () => null })(req(), res)
  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { error: 'not_registered' })
})

test('clínica do CRM sem o token da plataforma ou sem painel: not_registered (CRM#217)', async () => {
  for (const row of [
    { ...clinic, helena_token: null },
    { ...clinic, helena_panels: null, helena_panel_id: null },
  ]) {
    const res = fakeRes()
    await makeClinicHandler({ loadClinic: async () => row })(req(), res)
    assert.equal(res.statusCode, 404)
    assert.deepEqual(res.body, { error: 'not_registered' })
  }
})
