import { hasValidSession, passwordDisabled, safeEqual } from './_setup-token.js'

// Duas entradas nas rotas admin, as duas fail-closed:
// · a senha, no header x-admin-key contra ADMIN_PASSWORD (desligável com
//   SETUP_SENHA_DESLIGADA=1);
// · a sessão aberta pelo link assinado do setup do CRM (cookie, CRM#219), que
//   só existe com SETUP_LINK_SEGREDO.
export function requireAdmin(req, res) {
  const key = req.headers?.['x-admin-key']
  const disabled = passwordDisabled()

  if (key) {
    if (disabled) {
      res.status(401).json({ error: 'A entrada por senha está desligada. Abra este setup pelo setup do CRM.', senhaDesligada: true })
      return false
    }
    const expected = process.env.ADMIN_PASSWORD
    if (!expected) {
      res.status(500).json({ error: 'ADMIN_PASSWORD não configurado no servidor.' })
      return false
    }
    if (!safeEqual(key, expected)) {
      res.status(401).json({ error: 'Senha de administrador inválida.' })
      return false
    }
    return true
  }

  if (hasValidSession(req)) return true

  if (!process.env.ADMIN_PASSWORD && !process.env.SETUP_LINK_SEGREDO) {
    res.status(500).json({ error: 'ADMIN_PASSWORD não configurado no servidor.' })
    return false
  }
  res.status(401).json({ error: 'Senha de administrador inválida.', senhaDesligada: disabled })
  return false
}
