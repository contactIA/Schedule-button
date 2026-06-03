import { getClinicByAccountId } from './_supabase.js'

export default async function handler(req, res) {
  const targetPath = req.headers['x-target-path']
  const idconta    = req.headers['x-idconta']

  if (!targetPath) return res.status(400).json({ error: 'Missing x-target-path header' })
  if (!idconta)    return res.status(400).json({ error: 'Missing x-idconta header' })

  const clinic = await getClinicByAccountId(idconta)
  if (!clinic) return res.status(404).json({ error: 'not_registered' })

  const fetchUrl = `https://api.wts.chat${targetPath}`

  let bodyStr
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
  }

  console.log(`[proxy] ${req.method} ${fetchUrl} | conta: ${idconta}`)

  try {
    const upstream = await fetch(fetchUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${clinic.helena_token}`,
        'Content-Type': 'application/json',
      },
      ...(bodyStr !== undefined ? { body: bodyStr } : {}),
    })

    const text = await upstream.text()
    if (!upstream.ok) console.log('[proxy] upstream error:', text.slice(0, 500))

    try {
      return res.status(upstream.status).json(JSON.parse(text))
    } catch {
      return res.status(upstream.status).end(text)
    }
  } catch (err) {
    console.error('[proxy] FETCH THREW:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
