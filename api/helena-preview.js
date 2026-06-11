import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'

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
  if (!requireAdmin(req, res)) return

  // Token direto (cadastro) ou clinicId (edição — token carregado do banco)
  let token = req.query?.token
  const clinicId = req.query?.clinicId
  if (!token && clinicId) {
    const db = getSupabase()
    const { data } = await db.from('clinics').select('helena_token').eq('id', clinicId).limit(1)
    token = data?.[0]?.helena_token
    if (!token) return res.status(404).json({ error: 'Clínica não encontrada ou sem token.' })
  }
  if (!token) return res.status(400).json({ error: 'Parâmetro token ou clinicId obrigatório' })

  // ── Modo leve ?templates=1&channelId= → só modelos do canal ──────
  // O filtro é feito pela própria Helena via ChannelId — a listagem
  // completa não devolve o canal de cada modelo, então filtrar no
  // cliente não funciona.
  if (req.query?.templates) {
    const channelId = req.query?.channelId
    if (!channelId) return res.status(400).json({ error: 'Parâmetro channelId obrigatório' })
    try {
      const { ok, body } = await helenaGet(
        `/chat/v1/template?ApprovedOnly=true&PageSize=100&IncludeDetails=Params&ChannelId=${encodeURIComponent(channelId)}`,
        token
      )
      if (!ok) {
        return res.status(400).json({ error: `Erro ao listar modelos do canal. (${JSON.stringify(body).slice(0, 200)})` })
      }
      return res.status(200).json({
        templates: (body.items ?? []).map(t => ({
          id:     t.id,
          name:   t.name,
          type:   t.type,
          params: (t.params ?? []).map(p => p.name),
        })),
      })
    } catch (err) {
      console.error('[helena-preview] templates:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  try {
    // Painéis (com etapas + etiquetas) e canais em paralelo — ambos da
    // config do lembrete; modelos são buscados por canal no modo leve.
    const [panelsRes, channelsRes] = await Promise.all([
      helenaGet('/crm/v2/panel?IncludeDetails=Steps&IncludeDetails=Tags&PageSize=100', token),
      helenaGet('/chat/v1/channel?ChannelType=All', token),
    ])

    const { ok, body } = panelsRes
    if (!ok) {
      return res.status(400).json({
        error: `Token inválido ou sem acesso. (${JSON.stringify(body).slice(0, 200)})`
      })
    }

    const channels = channelsRes.ok && Array.isArray(channelsRes.body)
      ? channelsRes.body.filter(c => c.active !== false).map(c => ({
          id:     c.id,
          number: c.number,
          label:  `${c.numberFormatted || c.number}${c.identity?.platform ? ` · ${c.identity.platform}` : ''}`,
        }))
      : []

    const panels = (body.items ?? []).map(panel => ({
      id:    panel.id,
      title: panel.title ?? panel.name ?? '',
      steps: (panel.steps ?? [])
        .filter(s => !s.archived)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(s => ({ id: s.id, title: s.title || s.name || s.stepName || s.label || s.id })),
      tags: (panel.tags ?? []).map(t => ({
        id:        t.id,
        name:      (t.name ?? t.title ?? '').trim(),
        nameColor: t.nameColor || '#fff',
        bgColor:   t.bgColor   || '#9333EA',
      })),
    }))

    if (panels.length === 0) {
      return res.status(400).json({ error: 'Nenhum painel encontrado nesta conta Helena.' })
    }

    return res.status(200).json({ panels, channels, totalPanels: body.totalItems ?? panels.length })

  } catch (err) {
    console.error('[helena-preview]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
