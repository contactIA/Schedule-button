import { getSupabase } from './_supabase.js'

// Configuração do servidor que NÃO é segredo (CRM#217, CRM#219), na tabela
// public.configuracao_do_servidor (chave, valor). RLS ligado e nenhuma
// política: só a service role, que este servidor já usa, lê e grava. Assim a
// equipe configura o botão pelo banco, sem variável nova na Vercel.
//
// Chaves conhecidas:
//   provisionamento_sha256   sha256 em hex da chave do POST /api/provisionamento
//   setup_link_chave_publica chave pública Ed25519 do link de setup do CRM
//                            (SPKI em DER e base64; PEM também é aceito)
//
// A leitura tem cache curto em memória (60 s) por chave, também para a chave
// que não existe, para não ir ao banco a cada pedido. Falha de leitura não
// entra no cache: lança, e quem chamou responde 503.

export const CONFIG_TTL_MS = 60_000

export const CONFIG_KEYS = {
  PROVISIONAMENTO_SHA256: 'provisionamento_sha256',
  SETUP_LINK_CHAVE_PUBLICA: 'setup_link_chave_publica',
}

async function readFromSupabase(chave) {
  const { data, error } = await getSupabase()
    .from('configuracao_do_servidor')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle()
  if (error) throw new Error(`ler configuração ${chave}: ${error.message}`)
  const valor = typeof data?.valor === 'string' ? data.valor.trim() : ''
  return valor || null
}

// read(chave) => Promise<string | null>. O valor vazio conta como ausente.
export function makeConfigReader({ read = readFromSupabase, ttlMs = CONFIG_TTL_MS, now = () => Date.now() } = {}) {
  const cache = new Map()
  async function get(chave) {
    const hit = cache.get(chave)
    const t = now()
    if (hit && hit.ate > t) return hit.valor
    const valor = await read(chave)
    cache.set(chave, { valor: valor ?? null, ate: t + ttlMs })
    return valor ?? null
  }
  get.limpar = () => cache.clear()
  return get
}

// O leitor do processo: o cache vive enquanto a função da Vercel está quente.
export const getConfig = makeConfigReader()
