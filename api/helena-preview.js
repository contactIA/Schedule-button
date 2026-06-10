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

  try {
    // Painéis (com etapas + etiquetas), canais e modelos em paralelo.
    // Canais/modelos alimentam a config do lembrete — falha neles não bloqueia.
    const [panelsRes, channelsRes, templatesRes] = await Promise.all([
      helenaGet('/crm/v2/panel?IncludeDetails=Steps&IncludeDetails=Tags&PageSize=100', token),
      helenaGet('/chat/v1/channel?ChannelType=All', token),
      helenaGet('/chat/v1/template?ApprovedOnly=true&PageSize=100&IncludeDetails=Params', token),
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

    const templates = templatesRes.ok
      ? (templatesRes.body.items ?? []).map(t => ({
          id:        t.id,
          name:      t.name,
          type:      t.type,
          channelId: t.channelId,
          params:    (t.params ?? []).map(p => p.name),
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

    return res.status(200).json({ panels, channels, templates, totalPanels: body.totalItems ?? panels.length })

  } catch (err) {
    console.error('[helena-preview]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
