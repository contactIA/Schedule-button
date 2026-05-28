import { TOKEN, PANEL_ID } from './config'

async function proxyFetch(path, options = {}) {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocal) {
    return fetch(`/api${path}`, options);
  } else {
    return fetch(`/api/proxy`, {
      ...options,
      headers: {
        ...options.headers,
        'x-target-path': path
      }
    });
  }
}

export async function getContact(contactId) {
  const res = await proxyFetch(`/core/v1/contact/${contactId}`, {
    headers: { Authorization: TOKEN }
  })
  if (!res.ok) throw new Error('Contato não encontrado')
  return res.json()
}

export async function findCardByContact(contactId) {
  const qs = new URLSearchParams({ PanelId: PANEL_ID, ContactId: contactId, PageSize: 1, PageNumber: 1 })
  const res = await proxyFetch(`/crm/v1/panel/card?${qs}`, {
    headers: { Authorization: TOKEN }
  })

  if (res.ok) {
    const json = await res.json()
    if (json.items && json.items.length > 0) return json.items[0]
  }

  return null
}

export async function updateCardStep(cardId, stepId, dueDate = null) {
  const fields = ['stepId']
  const payload = { fields, stepId }

  if (dueDate) {
    fields.push('dueDate')
    payload.dueDate = new Date(dueDate).toISOString()
  }

  const res = await proxyFetch(`/crm/v2/panel/card/${cardId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Erro atualizar etapa (HTTP ${res.status}): ${text}`)
  }
  return res.json()
}

export async function addCardNote(cardId, text) {
  const payload = { text }
  const res = await proxyFetch(`/crm/v1/panel/card/${cardId}/note`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Erro ao adicionar anotação (HTTP ${res.status}): ${errText}`)
  }
  return res.json()
}

export async function createCard(stepId, title, description, contactId, dueDate = null) {
  const payload = {
    panelId: PANEL_ID,
    stepId,
    title,
    description: description || null
  }

  if (contactId) payload.contactIds = [contactId]
  if (dueDate) payload.dueDate = new Date(dueDate).toISOString()

  const res = await proxyFetch(`/crm/v1/panel/card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
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

export async function fetchClinicorpSlots(date) {
  const res = await fetch(`/api/clinicorp?date=${date}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar horários (HTTP ${res.status})`)
  }
  return res.json()
}

export async function scheduleClinicorp(payload) {
  const res = await fetch('/api/clinicorp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[Clinicorp] Falha ao agendar. Payload enviado:', payload, 'Resposta:', err)
    const detail = err.detail ? ` — Detalhe: ${JSON.stringify(err.detail)}` : ''
    throw new Error((err.error || `Erro no Clinicorp (HTTP ${res.status})`) + detail)
  }
  const data = await res.json()
  console.log('[Clinicorp] Agendamento criado com sucesso:', data)
  return data
}

export async function addContactTags(contactId, tagIds = []) {
  if (!tagIds || tagIds.length === 0) return;

  const payload = { tagIds }
  const res = await proxyFetch(`/core/v1/contact/${contactId}/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.warn(`Aviso: Falha ao adicionar etiquetas ao contato (HTTP ${res.status}): ${errText}`)
  }
}
