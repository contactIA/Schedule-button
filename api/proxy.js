export default async function handler(req, res) {
  const targetPath = req.headers['x-target-path']

  if (!targetPath) {
    return res.status(400).json({ error: 'Missing x-target-path header' })
  }

  const fetchUrl = `https://api.wts.chat${targetPath}`

  // Monta body — Vercel pode entregar req.body parseado (objeto) ou string
  let bodyStr
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
  }

  const options = {
    method: req.method,
    headers: {
      'Authorization': req.headers.authorization || '',
      'Content-Type': 'application/json',
    },
    ...(bodyStr !== undefined ? { body: bodyStr } : {}),
  }

  console.log(`[proxy] ${req.method} ${fetchUrl}`)
  if (bodyStr) console.log('[proxy] body:', bodyStr.slice(0, 300))

  try {
    const upstream = await fetch(fetchUrl, options)
    const text = await upstream.text()

    console.log(`[proxy] upstream status: ${upstream.status}`)
    if (!upstream.ok) console.log('[proxy] upstream body:', text.slice(0, 500))

    try {
      return res.status(upstream.status).json(JSON.parse(text))
    } catch {
      return res.status(upstream.status).end(text)
    }
  } catch (err) {
    console.error('[proxy] FETCH THREW:', err.name, err.message, err.stack)
    return res.status(500).json({
      error: err.message,
      type: err.name,
      target: fetchUrl,
    })
  }
}
