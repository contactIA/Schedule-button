// Valida o header x-admin-key contra a env var ADMIN_PASSWORD.
// Fail-closed: sem a env var configurada, nenhuma rota admin funciona.
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSWORD não configurado no servidor.' })
    return false
  }
  if (req.headers['x-admin-key'] !== expected) {
    res.status(401).json({ error: 'Senha de administrador inválida.' })
    return false
  }
  return true
}
