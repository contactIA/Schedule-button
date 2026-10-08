import {
  linkVersion, parsePublicKey, sessionCookie, sessionSecret, verifySetupLink, verifySetupLinkV2,
} from '../_setup-token.js'
import { getConfig, CONFIG_KEYS } from '../_configuracao.js'

// GET /api/setup/entrar?t=<token>: o setup do CRM abre o setup do botão (CRM#219).
// Dois links valem:
// · v 1, HMAC com SETUP_LINK_SEGREDO, quando a variável existe;
// · v 2, Ed25519, com a chave pública da linha 'setup_link_chave_publica' de
//   public.configuracao_do_servidor (cache de 60 s), sem segredo na Vercel.
// Link válido: grava o cookie da sessão de setup e leva ao /setup, já na
// clínica do companyId quando ele vem. Inválido ou vencido: leva à tela de
// entrar com um aviso, sem dizer o motivo. Sem o segredo e sem a chave
// pública: 503.

const NAO_CONFIGURADO = { erro: 'Entrada pelo setup do CRM não configurada.', codigo: 'link_nao_configurado' }

async function readPublicKey(config) {
  const text = await config(CONFIG_KEYS.SETUP_LINK_CHAVE_PUBLICA)
  if (!text) return null
  const key = parsePublicKey(text)
  if (!key) console.error('[setup/entrar] a linha setup_link_chave_publica não é uma chave pública Ed25519')
  return key
}

export function makeEntrarHandler({ env = process.env, now = () => Date.now(), config = getConfig } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const token = req.query?.t
    const secret = env.SETUP_LINK_SEGREDO || null
    const version = linkVersion(token)

    // A chave pública só é lida quando o link é v 2, ou quando não há segredo
    // (para saber se a entrada está configurada).
    let publicKey = null
    if (!secret || version === 2) {
      try {
        publicKey = await readPublicKey(config)
      } catch (err) {
        console.error(`[setup/entrar] configuração indisponível | ${err.message}`)
        if (!secret) return res.status(503).json({ erro: 'Configuração do botão indisponível.', codigo: 'configuracao_indisponivel' })
      }
    }
    const signer = sessionSecret(env)
    if ((!secret && !publicKey) || !signer) return res.status(503).json(NAO_CONFIGURADO)

    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
    const link = version === 2
      ? verifySetupLinkV2(token, publicKey, now())
      : verifySetupLink(token, secret, now())
    if (!link) {
      res.writeHead(302, { ...headers, Location: '/setup?aviso=link_invalido' })
      return res.end()
    }

    const location = link.companyId ? `/setup?clinica=${link.companyId}` : '/setup'
    res.writeHead(302, { ...headers, 'Set-Cookie': sessionCookie(signer, now()), Location: location })
    return res.end()
  }
}

export default makeEntrarHandler()
