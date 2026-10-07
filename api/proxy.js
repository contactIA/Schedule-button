import { getClinicByAccountId } from './_supabase.js'
import { requireAllowedOrigin } from './_origin.js'
import { normalizeScheduledMessage } from './_scheduled-message.js'

const BASE = 'https://api.wts.chat'

// Um segmento de id no caminho: sem ponto, barra nem %, para não andar na
// árvore da API (../) nem trocar de rota.
const ID = '[A-Za-z0-9_-]{1,64}'
const ID_RE = new RegExp(`^${ID}$`)

const CARD_UPDATE_FIELDS = ['stepId', 'customFields', 'tagIds']
const REMINDER_KEYS = ['from', 'to', 'type', 'templateId', 'templateParams', 'scheduling']

// Corpo só com as chaves que o front manda, na grafia exata. A plataforma pode
// ler as chaves sem diferenciar maiúsculas: um "Fields" ou "TemplateId" ao lado
// do conferido passaria por fora da regra.
function hasOnlyKeys(body, keys) {
  return body !== null && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(k => keys.includes(k))
}

function isCardUpdate(body) {
  return hasOnlyKeys(body, ['fields', ...CARD_UPDATE_FIELDS]) &&
    Array.isArray(body.fields) && body.fields.length > 0 &&
    body.fields.every(f => CARD_UPDATE_FIELDS.includes(f))
}

// O lembrete só sai com um modelo configurado no Setup, pelo canal dele: o
// proxy não manda texto livre nem outro modelo.
function isConfiguredReminder(body, clinic) {
  if (!hasOnlyKeys(body, REMINDER_KEYS)) return false
  if (body.type !== 'TEMPLATE' || !body.templateId) return false
  const messages = normalizeScheduledMessage(clinic.scheduled_message)?.messages ?? []
  return messages.some(m => m.templateId === body.templateId && (m.channelFrom || null) === (body.from || null))
}

// Tudo o que o botão pede à plataforma (src/services/helena.js). O resto é 403.
const ROUTES = [
  // Nome e telefone do contato que abriu o botão
  { method: 'GET', path: new RegExp(`^/core/v1/contact/${ID}$`) },
  // Busca manual por telefone: só dígitos, com DDI
  { method: 'GET', path: /^\/core\/v1\/contact\/phonenumber\/\d{10,20}$/ },
  // Card aberto do contato: sempre de um contato, uma página de 1 (não lista o painel)
  {
    method: 'GET', path: /^\/crm\/v1\/panel\/card$/,
    query: { PanelId: ID_RE, ContactId: ID_RE, PageSize: /^1$/, PageNumber: /^1$/ },
    required: ['PanelId', 'ContactId'],
  },
  // Etapas e etiquetas dos painéis
  {
    method: 'GET', path: /^\/crm\/v2\/panel$/,
    query: { PageSize: /^(?:[1-9]\d?|100)$/, IncludeDetails: /^(?:Steps|Tags)$/ },
    repeatable: ['IncludeDetails'],
  },
  // Cria o card
  { method: 'POST', path: /^\/crm\/v1\/panel\/card$/ },
  // Move o card: só etapa, campos personalizados e etiquetas
  {
    method: 'PUT', path: new RegExp(`^/crm/v2/panel/card/${ID}$`),
    body: isCardUpdate,
  },
  // Anotação no card
  { method: 'POST', path: new RegExp(`^/crm/v1/panel/card/${ID}/note$`) },
  // Lembrete agendado
  { method: 'POST', path: /^\/chat\/v1\/scheduled-message$/, body: isConfiguredReminder },
]

// A rota da lista que casa com o pedido, e o caminho remontado só com os
// parâmetros conferidos. null = fora da lista.
export function matchRoute(method, targetPath) {
  if (typeof targetPath !== 'string' || !targetPath.startsWith('/')) return null
  const q = targetPath.indexOf('?')
  const path  = q === -1 ? targetPath : targetPath.slice(0, q)
  const query = q === -1 ? '' : targetPath.slice(q + 1)

  const route = ROUTES.find(r => r.method === method && r.path.test(path))
  if (!route) return null

  const params = new URLSearchParams(query)
  const rules = route.query ?? {}
  const seen = new Set()
  for (const [key, value] of params) {
    if (!Object.hasOwn(rules, key) || !rules[key].test(value)) return null
    if (seen.has(key) && !route.repeatable?.includes(key)) return null
    seen.add(key)
  }
  if (route.required?.some(k => !seen.has(k))) return null

  const qs = params.toString()
  return { route, path: qs ? `${path}?${qs}` : path }
}

function parseBody(body) {
  if (body === undefined || body === null || body === '') return null
  if (typeof body === 'object') return body
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export function makeProxyHandler({ loadClinic = getClinicByAccountId, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (!requireAllowedOrigin(req, res)) return

    const targetPath = req.headers['x-target-path']
    const idconta    = req.headers['x-idconta']

    if (!targetPath) return res.status(400).json({ error: 'Missing x-target-path header' })
    if (!idconta)    return res.status(400).json({ error: 'Missing x-idconta header' })

    const match = matchRoute(req.method, targetPath)
    if (!match) {
      console.warn(`[proxy] fora da lista: ${req.method} ${String(targetPath).slice(0, 200)} | conta: ${idconta}`)
      return res.status(403).json({ error: 'path_not_allowed' })
    }

    const clinic = await loadClinic(idconta)
    if (!clinic) return res.status(404).json({ error: 'not_registered' })

    const checked = match.route.body ? parseBody(req.body) : undefined
    if (match.route.body && !match.route.body(checked, clinic)) {
      console.warn(`[proxy] corpo fora da regra: ${req.method} ${match.path} | conta: ${idconta}`)
      return res.status(403).json({ error: 'body_not_allowed' })
    }

    const fetchUrl = `${BASE}${match.path}`

    let bodyStr
    if (checked !== undefined) {
      // Vai o corpo que foi conferido, não o texto recebido: chave repetida no
      // texto não chega à plataforma.
      bodyStr = JSON.stringify(checked)
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined && req.body !== null) {
        bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      }
    }

    console.log(`[proxy] ${req.method} ${fetchUrl} | conta: ${idconta}`)

    try {
      const upstream = await fetchImpl(fetchUrl, {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${clinic.helena_token}`,
          'Content-Type': 'application/json',
        },
        ...(bodyStr !== undefined ? { body: bodyStr } : {}),
      })

      const text = await upstream.text()
      if (!upstream.ok) console.log('[proxy] upstream error:', text.slice(0, 500))

      try {
        return res.status(upstream.status).json(JSON.parse(text))
      } catch {
        return res.status(upstream.status).end(text)
      }
    } catch (err) {
      console.error('[proxy] FETCH THREW:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }
}

export default makeProxyHandler()
