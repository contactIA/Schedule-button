import { sessionCookie, verifySetupLink } from '../_setup-token.js'

// GET /api/setup/entrar?t=<token>: o setup do CRM abre o setup do botão (CRM#219).
// Link válido: grava o cookie da sessão de setup e leva ao /setup, já na
// clínica do companyId quando ele vem. Inválido ou vencido: leva à tela de
// entrar com um aviso, sem dizer o motivo. Sem SETUP_LINK_SEGREDO: 503.
export function makeEntrarHandler({ env = process.env, now = () => Date.now() } = {}) {
  return function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const secret = env.SETUP_LINK_SEGREDO
    if (!secret) return res.status(503).json({ erro: 'Entrada pelo setup do CRM não configurada.', codigo: 'link_nao_configurado' })

    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
    const link = verifySetupLink(req.query?.t, secret, now())
    if (!link) {
      res.writeHead(302, { ...headers, Location: '/setup?aviso=link_invalido' })
      return res.end()
    }

    const location = link.companyId ? `/setup?clinica=${link.companyId}` : '/setup'
    res.writeHead(302, { ...headers, 'Set-Cookie': sessionCookie(secret, now()), Location: location })
    return res.end()
  }
}

export default makeEntrarHandler()
