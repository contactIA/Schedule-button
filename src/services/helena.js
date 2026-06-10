// Todas as chamadas à API Helena passam pelo /api/proxy (Vercel Function),
// que usa o x-idconta header para buscar o token correto no Supabase.
async function proxyFetch(path, idconta, options = {}) {
  return fetch('/api/proxy', {
    ...options,
    headers: {
      ...options.headers,
      'x-target-path': path,
      'x-idconta':     idconta,
    }
  })
}


export async function getContact(contactId, idconta) {
  const res = await proxyFetch(`/core/v1/contact/${contactId}`, idconta)
  if (!res.ok) throw new Error('Contato não encontrado')
  return res.json()
}

// Busca card aberto do contato no painel. A API exige PanelId —
// sem ele retorna 500 e o app criaria um card duplicado.
export async function findCardByContact(contactId, idconta, panelId) {
  if (!contactId || !panelId) return null
  const qs = new URLSearchParams({ PanelId: panelId, ContactId: contactId, PageSize: 1, PageNumber: 1 })
  const res = await proxyFetch(`/crm/v1/panel/card?${qs}`, idconta)
  if (res.ok) {
    const json = await res.json()
    if (json.items && json.items.length > 0) return json.items[0]
  }
  return null
}

// Retorna etapas E tags do painel em uma única chamada.
// IncludeDetails=Steps,Tags garante que ambos venham na resposta.
export async function getPanelData(panelId, idconta) {
  const qs = new URLSearchParams({ PageSize: '100' })
  qs.append('IncludeDetails', 'Steps')
  qs.append('IncludeDetails', 'Tags')
  const res = await proxyFetch(`/crm/v2/panel?${qs}`, idconta)
  if (!res.ok) throw new Error('Erro ao buscar dados do painel')
  const json   = await res.json()
  const panels = json.items ?? []
  const panel  = panels.find(p => p.id === panelId) ?? panels[0]
  if (!panel) throw new Error('Painel não encontrado')

  const steps = (panel.steps ?? [])
    .filter(s => !s.archived)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(s => ({
      id:   s.id,
      name: s.title || s.name || s.stepName || s.columnName || s.label || s.id
    }))

  const tags = (panel.tags ?? []).map(t => ({
    id:        t.id,
    label:     (t.name ?? t.title ?? '').trim(),
    nameColor: t.nameColor || '#fff',
    bgColor:   t.bgColor   || '#9333EA',
  }))

  return { steps, tags }
}


export async function updateCardStep(cardId, stepId, idconta, dueDate = null, tagIds = null) {
  const fields = ['stepId']
  const payload = { fields, stepId }
  if (dueDate) {
    fields.push('dueDate')
    payload.dueDate = new Date(dueDate).toISOString()
  }
  if (tagIds?.length) {
    fields.push('tagIds')
    payload.tagIds = tagIds
  }
  const res = await proxyFetch(`/crm/v2/panel/card/${cardId}`, idconta, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Erro atualizar etapa (HTTP ${res.status}): ${text}`)
  }
  return res.json()
}

export async function addCardNote(cardId, text, idconta) {
  const res = await proxyFetch(`/crm/v1/panel/card/${cardId}/note`, idconta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Erro ao adicionar anotação (HTTP ${res.status}): ${errText}`)
  }
  return res.json()
}

export async function createCard(stepId, panelId, title, description, contactId, idconta, dueDate = null, tagIds = null) {
  const payload = { panelId, stepId, title, description: description || null }
  if (contactId) payload.contactIds = [contactId]
  if (dueDate) payload.dueDate = new Date(dueDate).toISOString()
  if (tagIds?.length) payload.tagIds = tagIds

  const res = await proxyFetch('/crm/v1/panel/card', idconta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[createCard] payload enviado:', payload)
    console.error('[createCard] resposta erro:', res.status, err)
    const errMsg = err.message || err.error || err.detail || JSON.stringify(err)
    throw new Error(`Erro ao criar card (HTTP ${res.status}): ${errMsg}`)
  }
  return res.json()
}
