const HELENA_BASE = 'https://api.wts.chat'

async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

// Retorna painéis e etapas disponíveis para o token informado.
// Usado no setup para o admin escolher qual etapa aciona o Clinicorp.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.query?.token
  if (!token) return res.status(400).json({ error: 'Parâmetro token obrigatório' })

  try {
    const { ok, body: panelsBody } = await helenaGet('/crm/v1/panel', token)
    if (!ok) return res.status(400).json({ error: `Token inválido ou sem acesso. (${JSON.stringify(panelsBody)})` })

    const panels = Array.isArray(panelsBody) ? panelsBody : (panelsBody.items ?? [])
    if (panels.length === 0) return res.status(400).json({ error: 'Nenhum painel encontrado nesta conta Helena.' })

    const panel   = panels[0]
    const panelId = panel.id

    const { ok: okPanel, body: panelData } = await helenaGet(`/crm/v1/panel/${panelId}`, token)
    if (!okPanel) return res.status(400).json({ error: 'Erro ao buscar etapas do painel.' })

    const rawSteps = panelData.steps ?? panelData.columns ?? panelData.stepList ?? []
    const steps = rawSteps
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(s => ({ id: s.id, name: s.name ?? s.title ?? '' }))

    return res.status(200).json({ panelId, panelName: panel.name ?? '', steps })
  } catch (err) {
    console.error('[helena-preview]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
