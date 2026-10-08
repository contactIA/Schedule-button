// Provisionamento pelo setup do CRM (CRM#217). O CRM é a fonte do cadastro da
// clínica (nome, token da plataforma, unidades com o Clinicorp e os
// profissionais agendáveis) e manda sempre o retrato inteiro: o último vence e
// reenviar é seguro. Aqui o retrato vira a cópia em clinics e units, de que o
// botão continua dependendo sozinho para agendar.
//
// Contrato (seção A dos contratos da onda 3): POST /api/provisionamento com
// Authorization: Bearer <CHAVE_DE_PROVISIONAMENTO>; 200 { ok, clinicaId };
// 400 { erro, codigo }. Os painéis, as etapas, as etiquetas e o lembrete
// (modelo e canal) continuam no setup daqui (decisão #212 em aberto).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_UNITS = 50

const isUuid = (v) => typeof v === 'string' && UUID.test(v)
const isText = (v, max = 500) => typeof v === 'string' && v.trim() !== '' && v.length <= max
const isTextOrNull = (v, max = 2000) => v === null || isText(v, max)
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function fail(erro, codigo = 'corpo_invalido') {
  return { erro, codigo }
}

function validateUnit(u, i) {
  const where = `unidades[${i}]`
  if (!isObject(u)) return fail(`${where} não é um objeto.`)
  if (!isUuid(u.crmUnitId)) return fail(`${where}.crmUnitId precisa ser um uuid.`)
  if (!isText(u.nome, 200)) return fail(`${where}.nome é obrigatório.`)
  if (typeof u.principal !== 'boolean') return fail(`${where}.principal precisa ser verdadeiro ou falso.`)
  if (typeof u.ativa !== 'boolean') return fail(`${where}.ativa precisa ser verdadeiro ou falso.`)

  const c = u.clinicorp
  if (!isObject(c)) return fail(`${where}.clinicorp é obrigatório.`, 'unidade_sem_clinicorp')
  if (!isText(c.usuario, 200) || !isText(c.token, 500)) {
    return fail(`${where}.clinicorp precisa de usuario e token.`, 'unidade_sem_clinicorp')
  }
  if (c.subscriberId != null && typeof c.subscriberId !== 'string') return fail(`${where}.clinicorp.subscriberId precisa ser texto.`)
  const businessId = Number(c.businessId)
  if (!Number.isSafeInteger(businessId) || businessId <= 0) {
    return fail(`${where}.clinicorp.businessId é obrigatório.`, 'unidade_sem_business_id')
  }
  if (c.codeLink != null && typeof c.codeLink !== 'string' && typeof c.codeLink !== 'number') {
    return fail(`${where}.clinicorp.codeLink precisa ser texto ou número.`)
  }

  const pros = u.profissionaisAgendaveis ?? []
  if (!Array.isArray(pros) || pros.length > 500) return fail(`${where}.profissionaisAgendaveis precisa ser uma lista.`)
  for (const p of pros) {
    const id = typeof p?.id === 'number' ? String(p.id) : p?.id
    if (!isText(id, 100)) return fail(`${where}.profissionaisAgendaveis tem profissional sem id.`)
  }

  return {
    unit: {
      crmUnitId: u.crmUnitId.toLowerCase(),
      nome: u.nome.trim(),
      principal: u.principal,
      ativa: u.ativa,
      clinicorp: {
        usuario: c.usuario.trim(),
        token: c.token.trim(),
        subscriberId: (c.subscriberId?.trim() || c.usuario.trim()),
        businessId,
        codeLink: c.codeLink == null || String(c.codeLink).trim() === '' ? '0' : String(c.codeLink).trim(),
      },
      // Mesmo formato do setup daqui: ids do Clinicorp em texto; lista vazia =
      // todos agendáveis (null no banco)
      bookableIds: [...new Set(pros.map(p => String(p.id).trim()))],
    },
  }
}

// O corpo conferido, ou { erro, codigo } para o 400.
export function validateSnapshot(body) {
  if (!isObject(body)) return fail('O corpo precisa ser um objeto JSON.', 'json_invalido')
  if (body.versao !== 1) return fail('Versão do provisionamento não suportada.', 'versao_nao_suportada')
  if (typeof body.enviadoEm !== 'string' || Number.isNaN(Date.parse(body.enviadoEm))) {
    return fail('enviadoEm precisa ser uma data ISO.')
  }
  if (!isUuid(body.companyId)) return fail('companyId precisa ser um uuid.')
  if (!isText(body.nome, 200)) return fail('nome é obrigatório.')
  if (body.fusoHorario != null && !isText(body.fusoHorario, 64)) return fail('fusoHorario precisa ser texto.')
  if (typeof body.ligado !== 'boolean') return fail('ligado precisa ser verdadeiro ou falso.')
  if (!isTextOrNull(body.tokenPlataforma)) return fail('tokenPlataforma precisa ser texto ou null.')
  if (typeof body.enviaLembreteDeConsulta !== 'boolean') return fail('enviaLembreteDeConsulta precisa ser verdadeiro ou falso.')
  if (!isObject(body.crm)) return fail('crm é obrigatório.')
  if (!isTextOrNull(body.crm.chaveDaApi)) return fail('crm.chaveDaApi precisa ser texto ou null.')
  if (body.crm.urlDaApi != null && !isText(body.crm.urlDaApi, 500)) return fail('crm.urlDaApi precisa ser texto.')
  if (!Array.isArray(body.unidades)) return fail('unidades precisa ser uma lista.')
  if (body.unidades.length > MAX_UNITS) return fail(`No máximo ${MAX_UNITS} unidades.`)

  const units = []
  const seen = new Set()
  for (let i = 0; i < body.unidades.length; i++) {
    const r = validateUnit(body.unidades[i], i)
    if (r.erro) return r
    if (seen.has(r.unit.crmUnitId)) return fail(`unidades[${i}].crmUnitId repetido.`, 'unidade_repetida')
    seen.add(r.unit.crmUnitId)
    units.push(r.unit)
  }

  return {
    snapshot: {
      enviadoEm: new Date(body.enviadoEm).toISOString(),
      companyId: body.companyId.toLowerCase(),
      nome: body.nome.trim(),
      ligado: body.ligado,
      tokenPlataforma: body.tokenPlataforma?.trim() || null,
      enviaLembreteDeConsulta: body.enviaLembreteDeConsulta,
      chaveDaApi: body.crm.chaveDaApi?.trim() || null,
      // A principal primeiro: é a que o seletor do botão mostra antes
      unidades: units.map((u, i) => ({ u, i }))
        .sort((a, b) => (b.u.principal - a.u.principal) || (a.i - b.i))
        .map(x => x.u),
    },
  }
}

function toSlug(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

const sameName = (a, b) => toSlug(a ?? '') === toSlug(b ?? '')
const isProvisioned = (row) => !!row?.provisionado_em

// Grava o retrato. `repo` é a porta do banco (api/provisionamento.js tem a do
// Supabase; os testes, uma em memória):
//   findClinic(accountId) → linha | null
//   insertClinic(row) → linha · updateClinic(id, patch)
//   listUnits(clinicId) → linhas · insertUnit(row) · updateUnit(id, patch)
export async function applySnapshot(repo, snap) {
  const current = await repo.findClinic(snap.companyId)

  // Nova tentativa do worker com um retrato mais velho que o já aplicado
  if (current && isProvisioned(current) && Date.parse(current.provisionado_em) > Date.parse(snap.enviadoEm)) {
    return { clinicaId: current.id, ignorado: true }
  }
  // Botão desligado numa clínica que nunca esteve aqui: nada a desativar
  if (!current && !snap.ligado) return { clinicaId: null }

  const patch = {
    name: snap.nome,
    active: snap.ligado,
    envia_lembrete_de_consulta: snap.enviaLembreteDeConsulta,
    provisionado_em: snap.enviadoEm,
  }
  // null não apaga o token que a clínica já tem
  if (snap.tokenPlataforma) patch.helena_token = snap.tokenPlataforma
  // A chave só vem aberta no envio em que o CRM a criou; sem ela, fica a
  // configuração do CRM que já está aqui
  if (snap.chaveDaApi) {
    patch.crm_api_key = snap.chaveDaApi
    patch.crm_enabled = true
  }

  let clinicId
  if (current) {
    clinicId = current.id
    await repo.updateClinic(clinicId, patch)
  } else {
    const created = await repo.insertClinic({
      ...patch,
      slug: `${toSlug(snap.nome) || 'clinica'}-${snap.companyId.slice(0, 8)}`,
      helena_account_id: snap.companyId,
      helena_token: snap.tokenPlataforma,
      helena_tags: [],
      helena_steps: [],
    })
    clinicId = created.id
  }

  const existing = await repo.listUnits(clinicId)
  const used = new Set()
  const free = (u) => !used.has(u.id) && !u.crm_unit_id && !isProvisioned(u)

  for (let i = 0; i < snap.unidades.length; i++) {
    const u = snap.unidades[i]
    // Pelo crm_unit_id; senão, adota a unidade cadastrada aqui à mão que é o
    // mesmo negócio do Clinicorp, ou, por último, a de mesmo nome
    const match =
      existing.find(e => !used.has(e.id) && e.crm_unit_id === u.crmUnitId) ??
      existing.find(e => free(e) && Number(e.clinicorp_business_id) === u.clinicorp.businessId) ??
      existing.find(e => free(e) && sameName(e.name, u.nome)) ??
      null

    const row = {
      name: u.nome,
      position: i,
      clinicorp_user: u.clinicorp.usuario,
      clinicorp_token: u.clinicorp.token,
      clinicorp_subscriber_id: u.clinicorp.subscriberId,
      clinicorp_business_id: u.clinicorp.businessId,
      clinicorp_code_link: u.clinicorp.codeLink,
      bookable_professional_ids: u.bookableIds.length > 0 ? u.bookableIds : null,
      crm_unit_id: u.crmUnitId,
      active: u.ativa,
      provisionado_em: snap.enviadoEm,
    }
    if (match) {
      used.add(match.id)
      await repo.updateUnit(match.id, row)
    } else {
      await repo.insertUnit({ ...row, clinic_id: clinicId })
    }
  }

  // A unidade provisionada que não veio mais sai do botão, sem apagar nada
  for (const e of existing) {
    if (!used.has(e.id) && isProvisioned(e) && e.active) {
      await repo.updateUnit(e.id, { active: false })
    }
  }

  return { clinicaId: clinicId }
}
