import { getSupabase } from './_supabase.js'
import { requireAdmin } from './_auth.js'
import { crmClient, checkCrmConnection, describeCrmError } from './_crm.js'

async function loadClinicFromDb(clinicId) {
  const { data, error } = await getSupabase()
    .from('clinics').select('*').eq('id', clinicId).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

// Rota admin: unidades do CRM da clínica (seletor "Unidade no CRM"), com a
// chave salva no banco. Só leitura no CRM. A chave nunca sai daqui.
export function makeCrmPreviewHandler({ loadClinic = loadClinicFromDb, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    if (!requireAdmin(req, res)) return

    const clinicId = req.query?.clinicId
    if (!clinicId) return res.status(400).json({ error: 'Parâmetro clinicId obrigatório' })

    try {
      const clinic = await loadClinic(clinicId)
      if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
      if (!clinic.crm_api_key) return res.status(404).json({ error: 'Esta clínica ainda não tem chave do CRM.' })

      const call = crmClient({
        baseUrl:   process.env.CRM_API_URL,
        apiKey:    clinic.crm_api_key,
        companyId: clinic.helena_account_id,
        fetchImpl,
      })
      try {
        return res.status(200).json(await checkCrmConnection(call))
      } catch (err) {
        console.error('[crm-preview]', err.status ?? '', err.code ?? '', err.message)
        return res.status(400).json({ error: describeCrmError(err, clinic.helena_account_id) })
      }
    } catch (err) {
      console.error('[crm-preview]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }
}

export default makeCrmPreviewHandler()
