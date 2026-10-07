// Prova de origem das rotas que o botão chama sem senha (proxy, clinic,
// clinicorp, crm, reminder-log). O idconta da URL não é segredo, então a rota
// confere de onde veio o pedido pelos cabeçalhos que o navegador preenche e que
// a página de outro site não consegue trocar: Origin, Referer e Sec-Fetch-Site.
//
// Aceita:
//   · o próprio app: o host do pedido (o domínio da Vercel ou o domínio próprio,
//     sem configurar nada), já que o front chama /api/* do mesmo endereço;
//   · os hosts de EMBED_HOSTS (o host da plataforma onde o botão abre), cada um
//     com os subdomínios.
// Sem Origin nem Referer, só passa o pedido que o navegador marca como
// same-origin. Sem nenhuma prova, recusa.
//
// É barreira, não garantia: quem monta o pedido à mão (curl) forja os três
// cabeçalhos. O que limita o estrago é a lista de caminhos do proxy.

/** "https://app.fluxodonto.com/, outro.com:443" → ['app.fluxodonto.com', 'outro.com'] */
export function parseHosts(text) {
  return (text ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''))
    .filter(Boolean)
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

export function isAllowedOrigin(headers = {}, extraHosts = parseHosts(process.env.EMBED_HOSTS)) {
  const own = String(headers.host ?? '').toLowerCase()
  const allowed = host => {
    if (!host) return false
    if (own && host === own) return true
    const name = host.replace(/:\d+$/, '')
    return extraHosts.some(h => name === h || name.endsWith(`.${h}`))
  }

  // Origin "null" (iframe isolado, arquivo local) não é host: recusa.
  if (headers.origin) return allowed(hostOf(headers.origin))
  if (headers.referer) return allowed(hostOf(headers.referer))
  return headers['sec-fetch-site'] === 'same-origin'
}

export function requireAllowedOrigin(req, res) {
  const headers = req.headers ?? {}
  if (isAllowedOrigin(headers)) return true
  // Só o host do Referer: a URL inteira traz idconta e contactId.
  console.warn(`[origem] recusado: ${req.method} ${String(req.url ?? '').split('?')[0]} | origin: ${headers.origin ?? '-'} | referer: ${hostOf(headers.referer) ?? '-'} | host: ${headers.host ?? '-'}`)
  res.status(403).json({ error: 'origin_not_allowed' })
  return false
}
