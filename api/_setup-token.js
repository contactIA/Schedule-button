import { createHmac, createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'

// Link assinado de setup (CRM#219): o setup do CRM abre o setup do botão sem a
// senha. Duas versões, as duas com o payload codificado do mesmo jeito:
//   v 1: base64url(JSON do payload) + "." + base64url(HMAC-SHA256(SETUP_LINK_SEGREDO, payload já codificado))
//        (o formato dos tokens de painel dos apps irmãos; vale quando a variável existe)
//   v 2: base64url(JSON do payload) + "." + base64url(assinatura Ed25519 sobre o payload já codificado)
//        (o CRM assina com a chave privada; aqui só mora a chave pública, na
//        linha 'setup_link_chave_publica' de public.configuracao_do_servidor)
// Payload do link: { v: 1 | 2, tipo: 'setup', companyId: '<uuid>' | null, exp: <unix segundos> }.
// A sessão que o link abre é sempre um token v 1 com o tipo 'sessao_setup', no
// cookie SESSION_COOKIE, assinado com sessionSecret(): um link não vale como
// sessão nem a sessão como link.

export const LINK_TYPE = 'setup'
export const SESSION_TYPE = 'sessao_setup'
export const SESSION_COOKIE = 'sb_setup_sessao'
export const SESSION_SECONDS = 8 * 3600
// O CRM gera o link com 120 s; aceita um pouco de relógio adiantado de lá.
const MAX_LINK_SECONDS = 120 + 30
const MAX_TOKEN_LENGTH = 2048
const ED25519_SIGNATURE_BYTES = 64

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest()
const sha256 = (data) => createHash('sha256').update(String(data)).digest()

// Comparação em tempo constante, também para tamanhos diferentes.
export function safeEqual(a, b) {
  const ha = sha256(a)
  const hb = sha256(b)
  return timingSafeEqual(ha, hb) && String(a).length === String(b).length
}

// sha256(value) bate com o hex guardado? Em tempo constante.
export function matchesSha256Hex(value, hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex.trim())) return false
  return timingSafeEqual(sha256(value), Buffer.from(hex.trim(), 'hex'))
}

export function signToken(payload, secret) {
  const encoded = b64url(JSON.stringify(payload))
  return `${encoded}.${b64url(hmac(secret, encoded))}`
}

function splitToken(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  let signature
  try { signature = Buffer.from(parts[1], 'base64url') } catch { return null }
  return { encoded: parts[0], signature }
}

function decodePayload(encoded) {
  let payload
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { return null }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload
}

// Versão, tipo e validade do payload já com a assinatura conferida.
function checkPayload(encoded, { version, type, now, maxSeconds }) {
  const payload = decodePayload(encoded)
  if (!payload) return null
  if (payload.v !== version || payload.tipo !== type) return null
  if (!Number.isInteger(payload.exp)) return null
  const nowSeconds = Math.floor(now / 1000)
  if (payload.exp <= nowSeconds) return null
  if (maxSeconds !== null && payload.exp - nowSeconds > maxSeconds) return null
  return payload
}

// v 1. Payload conferido (assinatura, v, tipo e validade) ou null. Não diz o motivo.
export function verifyToken(token, secret, { type, now = Date.now(), maxSeconds = null } = {}) {
  if (!secret) return null
  const parts = splitToken(token)
  if (!parts) return null
  const expected = hmac(secret, parts.encoded)
  if (parts.signature.length !== expected.length || !timingSafeEqual(parts.signature, expected)) return null
  return checkPayload(parts.encoded, { version: 1, type, now, maxSeconds })
}

// A chave pública do link v 2: SPKI em DER codificado em base64 (o formato
// guardado na tabela), ou PEM ("-----BEGIN PUBLIC KEY-----"). Só Ed25519.
// Devolve o KeyObject ou null.
export function parsePublicKey(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const value = text.trim()
  try {
    const key = value.includes('-----BEGIN')
      ? createPublicKey(value)
      : createPublicKey({ key: Buffer.from(value.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ed25519' ? key : null
  } catch {
    return null
  }
}

// v 2. Como verifyToken, com a assinatura Ed25519 conferida pela chave pública
// (KeyObject ou o texto de parsePublicKey).
export function verifyTokenEd25519(token, publicKey, { type, now = Date.now(), maxSeconds = null } = {}) {
  const key = typeof publicKey === 'string' ? parsePublicKey(publicKey) : publicKey
  if (!key) return null
  const parts = splitToken(token)
  if (!parts || parts.signature.length !== ED25519_SIGNATURE_BYTES) return null
  let valid
  try { valid = verify(null, Buffer.from(parts.encoded), key, parts.signature) } catch { return null }
  if (!valid) return null
  return checkPayload(parts.encoded, { version: 2, type, now, maxSeconds })
}

// A versão que o token diz ter, SEM conferir nada: só escolhe o verificador.
export function linkVersion(token) {
  const parts = splitToken(token)
  if (!parts) return null
  const payload = decodePayload(parts.encoded)
  return Number.isInteger(payload?.v) ? payload.v : null
}

function linkResult(payload) {
  if (!payload) return null
  const { companyId } = payload
  if (companyId !== null && !(typeof companyId === 'string' && UUID.test(companyId))) return null
  return { companyId }
}

// O link v 1 do CRM: companyId é uuid ou null (abre a lista).
export function verifySetupLink(token, secret, now = Date.now()) {
  return linkResult(verifyToken(token, secret, { type: LINK_TYPE, now, maxSeconds: MAX_LINK_SECONDS }))
}

// O link v 2 do CRM, assinado com Ed25519. As mesmas regras do v 1.
export function verifySetupLinkV2(token, publicKey, now = Date.now()) {
  return linkResult(verifyTokenEd25519(token, publicKey, { type: LINK_TYPE, now, maxSeconds: MAX_LINK_SECONDS }))
}

// O segredo que assina o cookie da sessão de setup. Com SETUP_LINK_SEGREDO, é
// ele (como sempre foi: as sessões abertas continuam valendo). Sem ele, uma
// chave derivada da SUPABASE_SERVICE_KEY, que o servidor já tem: assim o link
// v 2 abre sessão sem segredo novo na Vercel. Trocar a service key encerra as
// sessões abertas, nada mais. Sem nenhuma das duas: null (nenhuma sessão).
export function sessionSecret(env = process.env) {
  if (env.SETUP_LINK_SEGREDO) return env.SETUP_LINK_SEGREDO
  if (env.SUPABASE_SERVICE_KEY) {
    return createHmac('sha256', env.SUPABASE_SERVICE_KEY).update('schedule-button/sessao_setup/v1').digest('base64url')
  }
  return null
}

export function sessionCookie(secret, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS
  const value = signToken({ v: 1, tipo: SESSION_TYPE, exp }, secret)
  return `${SESSION_COOKIE}=${value}; Path=/api; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
}

export function readCookie(req, name) {
  const header = req.headers?.cookie
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export function hasValidSession(req, secret = sessionSecret(process.env), now = Date.now()) {
  if (!secret) return false
  return verifyToken(readCookie(req, SESSION_COOKIE), secret, { type: SESSION_TYPE, now }) !== null
}

// SETUP_SENHA_DESLIGADA: só "1" ou "true" desligam a entrada por senha.
export function passwordDisabled(env = process.env) {
  const v = String(env.SETUP_SENHA_DESLIGADA ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}
