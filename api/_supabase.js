import { createClient } from '@supabase/supabase-js'

let _client = null

function getSupabase() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

// Busca config completa da clínica + unidades pelo helena_account_id
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

  // Busca profissionais e unidades em paralelo
  const [{ data: professionals }, { data: units, error: unitsError }] = await Promise.all([
    sb.from('professionals')
      .select('clinicorp_id, name')
      .eq('clinic_id', clinic.id)
      .eq('active', true),
    sb.from('units')
      .select('*')
      .eq('clinic_id', clinic.id)
      .eq('active', true)
      .order('position', { ascending: true }),
  ])

  if (unitsError) throw new Error(`Erro ao buscar unidades: ${unitsError.message}`)

  return {
    ...clinic,
    professionals: professionals ?? [],
    units: units ?? [],
  }
}

// Busca uma unidade específica por ID (usado nos handlers Clinicorp)
export async function getUnitById(unitId) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('units')
    .select('*')
    .eq('id', unitId)
    .eq('active', true)
    .limit(1)

  if (error) throw new Error(`Erro ao buscar unidade: ${error.message}`)
  return data?.[0] ?? null
}

export { getSupabase }
