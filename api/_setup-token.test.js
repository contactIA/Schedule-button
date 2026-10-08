import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  signToken, verifySetupLink, verifyToken, sessionCookie, hasValidSession,
  passwordDisabled, SESSION_COOKIE,
} from './_setup-token.js'
import { makeEntrarHandler } from './setup/entrar.js'
import { requireAdmin } from './_auth.js'

const SECRET = 'segredo-do-link-de-teste'
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0)
const nowS = Math.floor(NOW / 1000)
const COMPANY = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'
const semConfig = async () => null
const link = (over = {}) => ({ v: 1, tipo: 'setup', companyId: COMPANY, exp: nowS + 120, ...over })

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {}, ended: false,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h); return this },
    end() { this.ended = true; return this },
  }
}

test('o formato é o dos tokens de painel: base64url(payload).base64url(HMAC do payload codificado)', () => {
  const token = signToken(link(), SECRET)
  const [encoded, sig] = token.split('.')
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64url').toString()), link())
  assert.equal(sig, createHmac('sha256', SECRET).update(encoded).digest('base64url'))
})

test('link válido devolve o companyId; null abre a lista', () => {
  assert.deepEqual(verifySetupLink(signToken(link(), SECRET), SECRET, NOW), { companyId: COMPANY })
  assert.deepEqual(verifySetupLink(signToken(link({ companyId: null }), SECRET), SECRET, NOW), { companyId: null })
})

test('assinatura: outro segredo, payload trocado ou assinatura cortada são recusados', () => {
  const token = signToken(link(), SECRET)
  assert.equal(verifySetupLink(token, 'outro-segredo', NOW), null)
  const [, sig] = token.split('.')
  const forjado = Buffer.from(JSON.stringify(link({ companyId: null }))).toString('base64url')
  assert.equal(verifySetupLink(`${forjado}.${sig}`, SECRET, NOW), null)
  assert.equal(verifySetupLink(token.slice(0, -2), SECRET, NOW), null)
  assert.equal(verifySetupLink('lixo', SECRET, NOW), null)
  assert.equal(verifySetupLink(undefined, SECRET, NOW), null)
  assert.equal(verifySetupLink(token, '', NOW), null)
})

test('validade: vencido é recusado, e validade longa demais também', () => {
  assert.equal(verifySetupLink(signToken(link({ exp: nowS }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ exp: nowS - 1 }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ exp: nowS + 3600 }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ exp: String(nowS + 60) }), SECRET), SECRET, NOW), null)
})

test('tipo e versão: só v 1 e tipo setup; a sessão não vale como link', () => {
  assert.equal(verifySetupLink(signToken(link({ tipo: 'painel' }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ tipo: 'sessao_setup' }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ v: 2 }), SECRET), SECRET, NOW), null)
  assert.equal(verifySetupLink(signToken(link({ companyId: 'nao-e-uuid' }), SECRET), SECRET, NOW), null)
  // e o link não vale como sessão
  assert.equal(verifyToken(signToken(link(), SECRET), SECRET, { type: 'sessao_setup', now: NOW }), null)
})

test('a rota abre a sessão e leva à clínica do link', async () => {
  const res = fakeRes()
  await makeEntrarHandler({ env: { SETUP_LINK_SEGREDO: SECRET }, now: () => NOW, config: semConfig })(
    { method: 'GET', query: { t: signToken(link(), SECRET) }, headers: {} }, res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.Location, `/setup?clinica=${COMPANY}`)
  const cookie = res.headers['Set-Cookie']
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Strict/)

  const value = cookie.split(';')[0]
  assert.equal(hasValidSession({ headers: { cookie: `x=1; ${value}` } }, SECRET, NOW + 60_000), true)
  assert.equal(hasValidSession({ headers: { cookie: value } }, SECRET, NOW + 9 * 3600_000), false)
  assert.equal(hasValidSession({ headers: { cookie: value } }, 'outro', NOW), false)
})

test('link inválido leva à tela de entrar com aviso e sem cookie', async () => {
  const res = fakeRes()
  await makeEntrarHandler({ env: { SETUP_LINK_SEGREDO: SECRET }, now: () => NOW, config: semConfig })(
    { method: 'GET', query: { t: signToken(link({ exp: nowS - 5 }), SECRET) }, headers: {} }, res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.Location, '/setup?aviso=link_invalido')
  assert.equal(res.headers['Set-Cookie'], undefined)
})

test('sem SETUP_LINK_SEGREDO e sem a chave pública a rota responde 503', async () => {
  const res = fakeRes()
  await makeEntrarHandler({ env: { SUPABASE_SERVICE_KEY: 'service' }, now: () => NOW, config: semConfig })({ method: 'GET', query: { t: 'x.y' }, headers: {} }, res)
  assert.equal(res.statusCode, 503)
})

test('SETUP_SENHA_DESLIGADA: só 1 ou true desligam', () => {
  assert.equal(passwordDisabled({ SETUP_SENHA_DESLIGADA: '1' }), true)
  assert.equal(passwordDisabled({ SETUP_SENHA_DESLIGADA: 'true' }), true)
  assert.equal(passwordDisabled({ SETUP_SENHA_DESLIGADA: 'TRUE ' }), true)
  assert.equal(passwordDisabled({ SETUP_SENHA_DESLIGADA: '0' }), false)
  assert.equal(passwordDisabled({ SETUP_SENHA_DESLIGADA: 'sim' }), false)
  assert.equal(passwordDisabled({}), false)
})

test('requireAdmin: senha, sessão e senha desligada', () => {
  const env = { ...process.env }
  try {
    process.env.ADMIN_PASSWORD = 'senha-certa'
    process.env.SETUP_LINK_SEGREDO = SECRET
    delete process.env.SETUP_SENHA_DESLIGADA

    let res = fakeRes()
    assert.equal(requireAdmin({ headers: { 'x-admin-key': 'senha-certa' } }, res), true)
    res = fakeRes()
    assert.equal(requireAdmin({ headers: { 'x-admin-key': 'errada' } }, res), false)
    assert.equal(res.statusCode, 401)

    const cookie = sessionCookie(SECRET).split(';')[0]
    res = fakeRes()
    assert.equal(requireAdmin({ headers: { cookie } }, res), true)
    res = fakeRes()
    assert.equal(requireAdmin({ headers: {} }, res), false)
    assert.equal(res.body.senhaDesligada, false)

    process.env.SETUP_SENHA_DESLIGADA = '1'
    res = fakeRes()
    assert.equal(requireAdmin({ headers: { 'x-admin-key': 'senha-certa' } }, res), false)
    assert.equal(res.statusCode, 401)
    assert.equal(res.body.senhaDesligada, true)
    res = fakeRes()
    assert.equal(requireAdmin({ headers: { cookie } }, res), true)
  } finally {
    process.env = env
  }
})
