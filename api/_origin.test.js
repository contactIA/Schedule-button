import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedOrigin, parseHosts, requireAllowedOrigin } from './_origin.js'
import clinicorpHandler from './clinicorp.js'
import crmHandler from './crm.js'
import reminderLogHandler from './reminder-log.js'

for (const k of ['EMBED_HOSTS', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) delete process.env[k]

const APP = 'schedule-button-xi.vercel.app'
const PLATAFORMA = ['app.fluxodonto.com']

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
    end() { return this },
  }
}

test('parseHosts: tira esquema, caminho, porta e espaços', () => {
  assert.deepEqual(parseHosts(' https://App.Fluxodonto.com/ , outro.com:443,,'), ['app.fluxodonto.com', 'outro.com'])
  assert.deepEqual(parseHosts(undefined), [])
  assert.deepEqual(parseHosts(''), [])
})

test('aceita o próprio app: Origin do POST, Referer do GET, Sec-Fetch-Site sem os dois', () => {
  assert.equal(isAllowedOrigin({ host: APP, origin: `https://${APP}` }, []), true)
  assert.equal(isAllowedOrigin({ host: APP, referer: `https://${APP}/?idconta=acc1&contactId=c1` }, []), true)
  assert.equal(isAllowedOrigin({ host: APP, 'sec-fetch-site': 'same-origin' }, []), true)
  // Domínio próprio ou prévia: vale o host que serviu o pedido, sem configurar
  assert.equal(isAllowedOrigin({ host: 'agenda.exemplo.com.br', origin: 'https://agenda.exemplo.com.br' }, []), true)
  // Desenvolvimento local: a porta faz parte do host
  assert.equal(isAllowedOrigin({ host: 'localhost:3000', origin: 'http://localhost:3000' }, []), true)
  assert.equal(isAllowedOrigin({ host: 'localhost:3000', origin: 'http://localhost:5175' }, []), false)
})

test('aceita os endereços que a Vercel dá ao deploy, mesmo com outro Host no pedido', () => {
  const headers = { host: 'interno.vercel.internal', origin: `https://${APP}` }
  assert.equal(isAllowedOrigin(headers, []), false)
  process.env.VERCEL_PROJECT_PRODUCTION_URL = APP
  try {
    assert.equal(isAllowedOrigin(headers, []), true)
    // Só o endereço exato, sem subdomínio
    assert.equal(isAllowedOrigin({ ...headers, origin: `https://x.${APP}` }, []), false)
  } finally {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  }
  assert.equal(isAllowedOrigin({ host: 'interno', 'x-forwarded-host': APP, referer: `https://${APP}/` }, []), true)
})

test('aceita o host da plataforma da lista e os subdomínios dele', () => {
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://app.fluxodonto.com' }, PLATAFORMA), true)
  assert.equal(isAllowedOrigin({ host: APP, referer: 'https://clinica.app.fluxodonto.com/chat' }, PLATAFORMA), true)
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://app.fluxodonto.com' }, []), false)
})

test('recusa outro site, imitações do host e pedido sem prova nenhuma', () => {
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://evil.com' }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP, origin: `https://${APP}.evil.com` }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://app.fluxodonto.com.evil.com' }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://evilapp.fluxodonto.com' }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP, referer: 'https://evil.com/?u=https://schedule-button-xi.vercel.app' }, PLATAFORMA), false)
  // Origin "null" (iframe isolado) não vale, nem com Referer bom
  assert.equal(isAllowedOrigin({ host: APP, origin: 'null', referer: `https://${APP}/` }, PLATAFORMA), false)
  // Origin manda: Referer bom não salva Origin de fora
  assert.equal(isAllowedOrigin({ host: APP, origin: 'https://evil.com', referer: `https://${APP}/` }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP, 'sec-fetch-site': 'cross-site' }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({ host: APP }, PLATAFORMA), false)
  assert.equal(isAllowedOrigin({}, PLATAFORMA), false)
})

test('EMBED_HOSTS do ambiente é lido a cada pedido', () => {
  const headers = { host: APP, origin: 'https://app.fluxodonto.com' }
  assert.equal(isAllowedOrigin(headers), false)
  process.env.EMBED_HOSTS = 'app.fluxodonto.com'
  try {
    assert.equal(isAllowedOrigin(headers), true)
  } finally {
    delete process.env.EMBED_HOSTS
  }
})

test('requireAllowedOrigin responde 403 e para a rota', () => {
  const res = fakeRes()
  const ok = requireAllowedOrigin({ method: 'GET', url: '/api/clinic?idconta=acc1', headers: { host: APP, origin: 'https://evil.com' } }, res)
  assert.equal(ok, false)
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { error: 'origin_not_allowed' })
})

// As rotas que o front chama sem senha: a conferência vem antes de tudo,
// então o pedido de fora não chega ao banco.
const fora = { host: APP, origin: 'https://evil.com' }
const dentro = { host: APP, origin: `https://${APP}` }

test('/api/clinicorp: recusa de fora, aceita do app', async () => {
  let res = fakeRes()
  await clinicorpHandler({ method: 'GET', query: { idconta: 'acc1', date: '2026-10-10' }, headers: fora }, res)
  assert.equal(res.statusCode, 403)

  res = fakeRes()
  await clinicorpHandler({ method: 'GET', query: {}, headers: { host: APP, referer: `https://${APP}/?idconta=acc1` } }, res)
  assert.equal(res.statusCode, 400)
})

test('/api/crm: recusa de fora, aceita do app', async () => {
  let res = fakeRes()
  await crmHandler({ method: 'POST', body: { idconta: 'acc1', phone: '62999990000' }, headers: fora }, res)
  assert.equal(res.statusCode, 403)

  res = fakeRes()
  await crmHandler({ method: 'POST', body: {}, headers: dentro }, res)
  assert.equal(res.statusCode, 400)
})

test('/api/reminder-log: recusa de fora', async () => {
  const res = fakeRes()
  await reminderLogHandler({ method: 'POST', body: { idconta: 'acc1', status: 'ok' }, headers: fora }, res)
  assert.equal(res.statusCode, 403)
})
