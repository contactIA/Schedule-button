const HELENA_BASE = 'https://api.wts.chat'

async function helenaGet(path, token) {
  const res = await fetch(`${HELENA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

export default async function handler(req, res) {
  // Desabilita cache para sempre retornar dados frescos
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.query?.token
  if (!token) return res.status(400).json({ error: 'Parâmetro token obrigatório' })

  try {
    // 1. Lista painéis
    const { ok, body: panelsBody } = await helenaGet('/crm/v1/panel', token)
    if (!ok) return res.status(400).json({ error: `Token inválido ou sem acesso. Resposta: ${JSON.stringify(panelsBody).slice(0, 200)}` })

    const panels = Array.isArray(panelsBody) ? panelsBody : (panelsBody.items ?? panelsBody.data ?? [])
    if (panels.length === 0) return res.status(400).json({ error: 'Nenhum painel encontrado nesta conta Helena.' })

    const panel   = panels[0]
    const panelId = panel.id

    // 2. Busca detalhes do painel (etapas)
    const { ok: okPanel, body: panelData } = await helenaGet(`/crm/v1/panel/${panelId}`, token)

    // Log completo para diagnóstico
    console.log('[helena-preview] panelData keys:', Object.keys(panelData ?? {}))
    console.log('[helena-preview] panelData sample:', JSON.stringify(panelData).slice(0, 500))

    if (!okPanel) return res.status(400).json({ error: 'Erro ao buscar etapas do painel.' })

    // Tenta todas as chaves possíveis que a API Helena pode usar para etapas
    const rawSteps =
      panelData.steps ??
      panelData.columns ??
      panelData.stepList ??
      panelData.stages ??
      panelData.kanbanColumns ??
      panelData.data ??
      (Array.isArray(panelData) ? panelData : [])

    console.log('[helena-preview] rawSteps encontrados:', rawSteps.length)

    const steps = rawSteps
      .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))
      .map(s => ({
        id:   s.id,
        name: s.name ?? s.title ?? s.label ?? s.columnName ?? `Etapa ${s.id}`
      }))

    return res.status(200).json({
      panelId,
      panelName: panel.name ?? panel.title ?? '',
      steps,
      _debug: { totalPanels: panels.length, panelKeys: Object.keys(panelData ?? {}) }
    })
  } catch (err) {
    console.error('[helena-preview]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
