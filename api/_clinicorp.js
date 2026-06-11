const CLINICORP_BASE = 'https://api.clinicorp.com/rest/v1'

export function clinicorpAuth(user, token) {
  return 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64')
}

async function clinicorpGet(path, auth) {
  const res = await fetch(`${CLINICORP_BASE}${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) } }
  catch { return { ok: false, status: res.status, body: { error: text } } }
}

// Busca o businessId de uma unidade Clinicorp pelo subscriber_id
export async function fetchBusinessId(user, token, subscriberId) {
  const auth = clinicorpAuth(user, token)
  const { ok, body } = await clinicorpGet(`/business/list?subscriber_id=${subscriberId}`, auth)
  if (!ok) throw new Error(`Erro ao buscar unidade Clinicorp: ${JSON.stringify(body).slice(0, 200)}`)
  const businesses = Array.isArray(body) ? body : (body.Businesses ?? body.businesses ?? [])
  if (businesses.length === 0) throw new Error('Nenhuma unidade Clinicorp encontrada para este subscriber_id.')
  const biz = businesses[0]
  return {
    businessId: biz.BusinessId ?? biz.businessId ?? biz.id,
    codeLink:   biz.CodeLink   ?? biz.codeLink   ?? biz.code_link ?? 0,
  }
}

// Busca profissionais de uma unidade — só os habilitados no agendamento
// online (mesma agenda usada pelo botão) e deduplicados por id
export async function fetchProfessionals(user, token, subscriberId) {
  const auth = clinicorpAuth(user, token)
  const { body } = await clinicorpGet(`/professional/list_all_professionals?subscriber_id=${subscriberId}&fromOnlineScheduling=true`, auth)
  const seen = new Set()
  return (Array.isArray(body) ? body : [])
    .map(p => ({
      clinicorp_id: String(p.PersonId ?? p.Id ?? p.id ?? ''),
      name:         (p.Name ?? p.name ?? '').trim(),
      is_evaluator: false,
    }))
    .filter(p => {
      if (!p.clinicorp_id || !p.name || seen.has(p.clinicorp_id)) return false
      seen.add(p.clinicorp_id)
      return true
    })
}
