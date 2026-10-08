import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

// Link assinado de setup (CRM#219): o setup do CRM abre o setup do botão sem a
// senha. O formato é o dos tokens de painel dos apps irmãos:
//   base64url(JSON do payload) + "." + base64url(HMAC-SHA256(segredo, payload já codificado))
// Payload do link: { v: 1, tipo: 'setup', companyId: '<uuid>' | null, exp: <unix segundos> }.
// A sessão que o link abre usa o mesmo formato, com o tipo 'sessao_setup', no
// cookie SESSION_COOKIE: um link não vale como sessão nem a sessão como link.

export const LINK_TYPE = 'setup'
export const SESSION_TYPE = 'sessao_setup'
export const SESSION_COOKIE = 'sb_setup_sessao'
export const SESSION_SECONDS = 8 * 3600
// O CRM gera o link com 120 s; aceita um pouco de relógio adiantado de lá.
const MAX_LINK_SECONDS = 120 + 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest()

// Comparação em tempo constante, também para tamanhos diferentes.
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb) && String(a).length === String(b).length
}

export function signToken(payload, secret) {
  const encoded = b64url(JSON.stringify(payload))
  return `${encoded}.${b64url(hmac(secret, encoded))}`
}

// Payload conferido (assinatura, v, tipo e validade) ou null. Não diz o motivo.
export function verifyToken(token, secret, { type, now = Date.now(), maxSeconds = null } = {}) {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [encoded, signature] = parts

  const expected = hmac(secret, encoded)
  let given
  try { given = Buffer.from(signature, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { return null }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (payload.v !== 1 || payload.tipo !== type) return null
  if (!Number.isInteger(payload.exp)) return null
  const nowSeconds = Math.floor(now / 1000)
  if (payload.exp <= nowSeconds) return null
  if (maxSeconds !== null && payload.exp - nowSeconds > maxSeconds) return null
  return payload
}

// O link do CRM: companyId é uuid ou null (abre a lista).
export function verifySetupLink(token, secret, now = Date.now()) {
  const payload = verifyToken(token, secret, { type: LINK_TYPE, now, maxSeconds: MAX_LINK_SECONDS })
  if (!payload) return null
  const { companyId } = payload
  if (companyId !== null && !(typeof companyId === 'string' && UUID.test(companyId))) return null
  return { companyId }
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

export function hasValidSession(req, secret = process.env.SETUP_LINK_SEGREDO, now = Date.now()) {
  if (!secret) return false
  return verifyToken(readCookie(req, SESSION_COOKIE), secret, { type: SESSION_TYPE, now }) !== null
}

// SETUP_SENHA_DESLIGADA: só "1" ou "true" desligam a entrada por senha.
export function passwordDisabled(env = process.env) {
  const v = String(env.SETUP_SENHA_DESLIGADA ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}
