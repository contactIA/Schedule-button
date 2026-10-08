import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  hasValidSession, linkVersion, parsePublicKey, sessionSecret, signToken, verifySetupLink,
  verifySetupLinkV2,
} from './_setup-token.js'
import { makeEntrarHandler } from './setup/entrar.js'
import { requireAdmin } from './_auth.js'

// Link de setup v 2 (CRM#219): Ed25519, chave pública na tabela
// configuracao_do_servidor, sem segredo na Vercel.

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0)
const nowS = Math.floor(NOW / 1000)
const COMPANY = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'
const SERVICE = 'service-key-de-teste'
const link = (over = {}) => ({ v: 2, tipo: 'setup', companyId: COMPANY, exp: nowS + 120, ...over })

const par = generateKeyPairSync('ed25519')
const outro = generateKeyPairSync('ed25519')
const spkiBase64 = (k) => k.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const PUBLICA = spkiBase64(par)

// O mesmo que o CRM faz: base64url(JSON) + "." + base64url(Ed25519 sobre o payload codificado).
function signV2(payload, privateKey = par.privateKey) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(null, Buffer.from(encoded), privateKey).toString('base64url')}`
}

const configCom = (valores) => async (chave) => valores[chave] ?? null

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {}, ended: false,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h); return this },
    end() { this.ended = true; return this },
  }
}

async function entrar(token, { env = { SUPABASE_SERVICE_KEY: SERVICE }, config = configCom({ setup_link_chave_publica: PUBLICA }) } = {}) {
  const res = fakeRes()
  await makeEntrarHandler({ env, now: () => NOW, config })({ method: 'GET', query: { t: token }, headers: {} }, res)
  return res
}

test('a chave pública aceita SPKI em base64 e PEM, e recusa o que não é Ed25519', () => {
  assert.ok(parsePublicKey(PUBLICA))
  assert.ok(parsePublicKey(par.publicKey.export({ format: 'pem', type: 'spki' })))
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
  assert.equal(parsePublicKey(rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')), null)
  assert.equal(parsePublicKey('nao-e-chave'), null)
  assert.equal(parsePublicKey(''), null)
  assert.equal(parsePublicKey(null), null)
})

test('v 2: assinatura válida devolve o companyId; null abre a lista', () => {
  assert.equal(linkVersion(signV2(link())), 2)
  assert.deepEqual(verifySetupLinkV2(signV2(link()), PUBLICA, NOW), { companyId: COMPANY })
  assert.deepEqual(verifySetupLinkV2(signV2(link({ companyId: null })), PUBLICA, NOW), { companyId: null })
})

test('v 2: payload adulterado, assinatura cortada e chave errada são recusados', () => {
  const token = signV2(link())
  const [, sig] = token.split('.')
  const forjado = Buffer.from(JSON.stringify(link({ companyId: null }))).toString('base64url')
  assert.equal(verifySetupLinkV2(`${forjado}.${sig}`, PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(token.slice(0, -3), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(token, spkiBase64(outro), NOW), null)
  assert.equal(verifySetupLinkV2(signV2(link(), outro.privateKey), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(token, null, NOW), null)
})

test('v 2: vencido, validade longa demais, tipo e versão trocados são recusados', () => {
  assert.equal(verifySetupLinkV2(signV2(link({ exp: nowS })), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(signV2(link({ exp: nowS + 3600 })), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(signV2(link({ tipo: 'sessao_setup' })), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(signV2(link({ v: 1 })), PUBLICA, NOW), null)
  assert.equal(verifySetupLinkV2(signV2(link({ companyId: 'nao-e-uuid' })), PUBLICA, NOW), null)
  // o v 1 não aceita um v 2, nem com o segredo
  assert.equal(verifySetupLink(signToken(link(), 'segredo'), 'segredo', NOW), null)
})

test('rota: o v 2 abre a sessão sem SETUP_LINK_SEGREDO, assinada com a chave derivada da service key', async () => {
  const res = await entrar(signV2(link()))
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.Location, `/setup?clinica=${COMPANY}`)
  const cookie = res.headers['Set-Cookie'].split(';')[0]
  const secret = sessionSecret({ SUPABASE_SERVICE_KEY: SERVICE })
  assert.ok(secret && secret !== SERVICE)
  assert.equal(hasValidSession({ headers: { cookie } }, secret, NOW + 60_000), true)

  const env = { ...process.env }
  try {
    delete process.env.ADMIN_PASSWORD
    delete process.env.SETUP_LINK_SEGREDO
    delete process.env.SETUP_SENHA_DESLIGADA
    process.env.SUPABASE_SERVICE_KEY = SERVICE
    assert.equal(requireAdmin({ headers: { cookie } }, fakeRes()), true)
    const sem = fakeRes()
    assert.equal(requireAdmin({ headers: {} }, sem), false)
    assert.equal(sem.statusCode, 401)
  } finally {
    process.env = env
  }
})

test('rota: v 2 adulterado, com outra chave ou vencido leva à tela de entrar, sem cookie', async () => {
  const [, sig] = signV2(link()).split('.')
  const forjado = Buffer.from(JSON.stringify(link({ companyId: null }))).toString('base64url')
  for (const token of [`${forjado}.${sig}`, signV2(link(), outro.privateKey), signV2(link({ exp: nowS - 5 }))]) {
    const res = await entrar(token)
    assert.equal(res.statusCode, 302)
    assert.equal(res.headers.Location, '/setup?aviso=link_invalido')
    assert.equal(res.headers['Set-Cookie'], undefined)
  }
})

test('rota: sem o segredo e sem a chave pública responde 503; chave pública inválida conta como ausente', async () => {
  let res = await entrar(signV2(link()), { config: configCom({}) })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.codigo, 'link_nao_configurado')
  res = await entrar(signV2(link()), { config: configCom({ setup_link_chave_publica: 'lixo' }) })
  assert.equal(res.statusCode, 503)
  res = await entrar(signV2(link()), { config: async () => { throw new Error('banco fora') } })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.codigo, 'configuracao_indisponivel')
})

test('rota: com o segredo e sem a chave pública, o v 1 vale e o v 2 é recusado', async () => {
  const env = { SETUP_LINK_SEGREDO: 'segredo', SUPABASE_SERVICE_KEY: SERVICE }
  let lidas = 0
  const config = async () => { lidas++; return null }

  let res = await entrar(signToken({ ...link(), v: 1 }, 'segredo'), { env, config })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.Location, `/setup?clinica=${COMPANY}`)
  assert.equal(lidas, 0, 'o v 1 com o segredo não lê a tabela')

  res = await entrar(signV2(link()), { env, config })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.Location, '/setup?aviso=link_invalido')
})

test('rota: com o segredo e a chave pública, os dois links valem', async () => {
  const env = { SETUP_LINK_SEGREDO: 'segredo' }
  let res = await entrar(signV2(link({ companyId: null })), { env })
  assert.equal(res.headers.Location, '/setup')
  res = await entrar(signToken({ ...link(), v: 1 }, 'segredo'), { env })
  assert.equal(res.headers.Location, `/setup?clinica=${COMPANY}`)
})
