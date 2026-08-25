const TITLES = new Set(['dr', 'dr.', 'dra', 'dra.', 'dr(a)', 'dr(a).'])

// "Dra. Fulana Silva" → "Fulana" — ignora título (Dr./Dra.) antes do primeiro nome
export function firstName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  while (parts.length > 1 && TITLES.has(parts[0].toLowerCase())) parts.shift()
  return parts[0] || ''
}
