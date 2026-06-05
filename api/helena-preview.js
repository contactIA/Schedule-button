const HELENA_BASE = 'https://api.wts.chat'

async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

// Retorna todos os painéis com suas etapas usando a API v2 correta.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.query?.token
  if (!token) return res.status(400).json({ error: 'Parâmetro token obrigatório' })

  try {
    // v2/panel com IncludeDetails=Steps retorna painéis + etapas em uma única chamada
    const { ok, body } = await helenaGet(
      '/crm/v2/panel?IncludeDetails=Steps&PageSize=100', token
    )

    if (!ok) {
      return res.status(400).json({
        error: `Token inválido ou sem acesso. (${JSON.stringify(body).slice(0, 200)})`
      })
    }

    const panels = (body.items ?? []).map(panel => ({
      id:    panel.id,
      title: panel.title ?? panel.name ?? '',
      steps: (panel.steps ?? [])
        .filter(s => !s.archived)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(s => ({ id: s.id, title: s.title ?? '' }))
    }))

    if (panels.length === 0) {
      return res.status(400).json({ error: 'Nenhum painel encontrado nesta conta Helena.' })
    }

    return res.status(200).json({ panels, totalPanels: body.totalItems ?? panels.length })

  } catch (err) {
    console.error('[helena-preview]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
