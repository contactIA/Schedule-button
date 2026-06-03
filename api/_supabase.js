import { createClient } from '@supabase/supabase-js'

let _client = null

function getSupabase() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

// Busca config completa da clínica pelo helena_account_id (vem do ?idconta= na URL)
export async function getClinicByAccountId(idconta) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('clinic_config')
    .select('*')
    .eq('helena_account_id', idconta)
    .maybeSingle()

  if (error) throw new Error(`Erro ao consultar banco: ${error.message}`)
  if (!data) return null  // não cadastrada — frontend mostra tela de "contate o admin"
  return data
}

export { getSupabase }
