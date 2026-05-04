import { TOKEN, PANEL_ID } from './config'

const BASE_CRM = '/api/crm/v1'
const BASE_CRM_V2 = '/api/crm/v2'
const BASE_CORE = '/api/core/v1'

export async function getContact(contactId) {
  const res = await fetch(`${BASE_CORE}/contact/${contactId}`, {
    headers: { Authorization: TOKEN }
  })
  if (!res.ok) throw new Error('Contato não encontrado')
  return res.json()
}

export async function findCardByContact(contactId, contactName = null) {
  let qs = new URLSearchParams({ PanelId: PANEL_ID, ContactId: contactId, PageSize: 1, PageNumber: 1 })
  let res = await fetch(`${BASE_CRM}/panel/card?${qs}`, {
    headers: { Authorization: TOKEN }
  })
  
  if (res.ok) {
    const json = await res.json()
    if (json.items && json.items.length > 0) return json.items[0]
  }

  if (contactName) {
    qs = new URLSearchParams({ PanelId: PANEL_ID, TextFilter: contactName, PageSize: 1, PageNumber: 1 })
    res = await fetch(`${BASE_CRM}/panel/card?${qs}`, {
      headers: { Authorization: TOKEN }
    })
    if (res.ok) {
      const json = await res.json()
      if (json.items && json.items.length > 0) return json.items[0]
    }
  }

  return null
}

export async function updateCardStep(cardId, stepId) {
  const payload = {
    fields: ["stepId"],
    stepId
  }
  const res = await fetch(`${BASE_CRM_V2}/panel/card/${cardId}`, {
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
  const res = await fetch(`${BASE_CRM}/panel/card/${cardId}/note`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Erro ao adicionar anotação (HTTP ${res.status}): ${text}`)
  }
  return res.json()
}

export async function createCard(stepId, title, description, contactId) {
  const payload = {
    stepId,
    title,
    description: description || null
  }

  if (contactId) {
    payload.contactIds = [contactId]
  }

  const res = await fetch(`${BASE_CRM}/panel/card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Erro ao criar card (HTTP ${res.status})`)
  }

  return res.json()
}
