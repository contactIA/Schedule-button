import { createClient } from '@supabase/supabase-js'

let _client = null

function getSupabase() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

// Busca config completa da clínica pelo helena_account_id (vem do ?idconta= na URL).
// Consulta a tabela clinics diretamente (não usa a view clinic_config que pode estar desatualizada).
export async function getClinicByAccountId(idconta) {
  const sb = getSupabase()

  const { data, error } = await sb
    .from('clinics')
    .select('*')
    .eq('helena_account_id', idconta)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Erro ao consultar banco: ${error.message}`)

  const clinic = data?.[0] ?? null
  if (!clinic) return null

  // Busca profissionais separadamente
  const { data: professionals } = await sb
    .from('professionals')
    .select('clinicorp_id, name, is_evaluator')
    .eq('clinic_id', clinic.id)
    .eq('active', true)

  return { ...clinic, professionals: professionals ?? [] }
}

export { getSupabase }
