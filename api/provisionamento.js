import { getSupabase } from './_supabase.js'
import { safeEqual, matchesSha256Hex } from './_setup-token.js'
import { getConfig, CONFIG_KEYS } from './_configuracao.js'
import { validateSnapshot, applySnapshot } from './_provisionamento.js'

// POST /api/provisionamento: o worker do CRM entrega o retrato da clínica
// (CRM#217). Chave de serviço em Authorization: Bearer, igual à
// BOTAO_CHAVE_DE_PROVISIONAMENTO do CRM. A chave se confere de um de dois jeitos:
// · com a variável CHAVE_DE_PROVISIONAMENTO, contra ela (como sempre foi);
// · sem ela, contra o sha256 em hex da chave, guardado na linha
//   'provisionamento_sha256' de public.configuracao_do_servidor (cache de 60 s).
// Sem a variável e sem a linha: 503.

function supabaseRepo(db) {
  const must = ({ data, error }, what) => {
    if (error) throw new Error(`${what}: ${error.message}`)
    return data
  }
  return {
    async findClinic(accountId) {
      const rows = must(await db.from('clinics').select('*')
        .eq('helena_account_id', accountId)
        .order('created_at', { ascending: false }).limit(1), 'buscar clínica')
      return rows?.[0] ?? null
    },
    async insertClinic(row) {
      return must(await db.from('clinics').insert(row).select('id').single(), 'criar clínica')
    },
    async updateClinic(id, patch) {
      must(await db.from('clinics').update(patch).eq('id', id), 'atualizar clínica')
    },
    async listUnits(clinicId) {
      return must(await db.from('units').select('*').eq('clinic_id', clinicId)
        .order('position', { ascending: true }), 'buscar unidades') ?? []
    },
    async insertUnit(row) {
      must(await db.from('units').insert(row), 'criar unidade')
    },
    async updateUnit(id, patch) {
      must(await db.from('units').update(patch).eq('id', id), 'atualizar unidade')
    },
  }
}

function bearer(req) {
  const h = req.headers?.authorization
  if (typeof h !== 'string') return ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function parseBody(body) {
  if (typeof body !== 'string') return body
  try { return JSON.parse(body) } catch { return undefined }
}

const SEM_CHAVE = { erro: 'Provisionamento não configurado no botão.', codigo: 'provisionamento_nao_configurado' }

// true ou false, ou o corpo de um 503.
async function checkKey(given, env, config) {
  const expected = env.CHAVE_DE_PROVISIONAMENTO
  if (expected) return Boolean(given) && safeEqual(given, expected)

  let hash
  try {
    hash = await config(CONFIG_KEYS.PROVISIONAMENTO_SHA256)
  } catch (err) {
    console.error(`[provisionamento] configuração indisponível | ${err.message}`)
    return { erro: 'Configuração do botão indisponível.', codigo: 'configuracao_indisponivel' }
  }
  if (!hash) return SEM_CHAVE
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    console.error('[provisionamento] a linha provisionamento_sha256 não é um sha256 em hex')
    return SEM_CHAVE
  }
  return Boolean(given) && matchesSha256Hex(given, hash)
}

export function makeProvisionamentoHandler({ env = process.env, repo = null, config = getConfig } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.', codigo: 'metodo_nao_permitido' })

    const ok = await checkKey(bearer(req), env, config)
    if (typeof ok === 'object') return res.status(503).json(ok)
    if (!ok) {
      return res.status(401).json({ erro: 'Chave de provisionamento inválida.', codigo: 'chave_invalida' })
    }

    const checked = validateSnapshot(parseBody(req.body))
    if (checked.erro) {
      console.warn(`[provisionamento] recusado: ${checked.codigo} | ${checked.erro}`)
      return res.status(400).json({ erro: checked.erro, codigo: checked.codigo })
    }

    const snap = checked.snapshot
    try {
      const result = await applySnapshot(repo ?? supabaseRepo(getSupabase()), snap)
      console.log(`[provisionamento] conta: ${snap.companyId} | clínica: ${result.clinicaId ?? '-'} | unidades: ${snap.unidades.length}${result.ignorado ? ' | retrato antigo, ignorado' : ''}`)
      return res.status(200).json({ ok: true, clinicaId: result.clinicaId, ...(result.ignorado ? { ignorado: true } : {}) })
    } catch (err) {
      console.error(`[provisionamento] falha | conta: ${snap.companyId} | ${err.message}`)
      return res.status(500).json({ erro: 'Não foi possível gravar o provisionamento.', codigo: 'erro_ao_gravar' })
    }
  }
}

export default makeProvisionamentoHandler()
