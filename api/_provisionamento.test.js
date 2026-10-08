import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSnapshot, applySnapshot } from './_provisionamento.js'
import { makeProvisionamentoHandler } from './provisionamento.js'

const COMPANY = '0b6c1d9e-2f3a-4b5c-8d7e-9f0a1b2c3d4e'
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const KEY = 'chave-de-provisionamento-de-teste'

const unidade = (over = {}) => ({
  crmUnitId: U1, nome: 'Unidade Centro', principal: true, ativa: true,
  clinicorp: { usuario: 'clin', token: 'tok-clinicorp', subscriberId: 'sub', baseUrl: 'https://api.clinicorp.com/rest/v1', businessId: 123, codeLink: '9' },
  profissionaisAgendaveis: [{ id: '55', nome: 'Dra. Ana' }],
  ...over,
})
const corpo = (over = {}) => ({
  versao: 1,
  enviadoEm: '2026-10-08T12:00:00.000Z',
  companyId: COMPANY,
  nome: 'Clínica Sorriso',
  fusoHorario: 'America/Sao_Paulo',
  ligado: true,
  tokenPlataforma: 'tok-plataforma',
  enviaLembreteDeConsulta: false,
  crm: { chaveDaApi: 'crm_chave', urlDaApi: 'https://crm.contactia.com.br/api/v1' },
  unidades: [unidade()],
  ...over,
})

// Banco em memória com a mesma porta do Supabase
function memoryRepo({ clinics = [], units = [] } = {}) {
  let seq = 0
  const db = { clinics: clinics.map(c => ({ ...c })), units: units.map(u => ({ ...u })) }
  return {
    db,
    async findClinic(acc) { return db.clinics.find(c => c.helena_account_id === acc) ?? null },
    async insertClinic(row) { const c = { id: `c${++seq}`, ...row }; db.clinics.push(c); return { id: c.id } },
    async updateClinic(id, patch) { Object.assign(db.clinics.find(c => c.id === id), patch) },
    async listUnits(clinicId) { return db.units.filter(u => u.clinic_id === clinicId).map(u => ({ ...u })) },
    async insertUnit(row) { db.units.push({ id: `u${++seq}`, ...row }) },
    async updateUnit(id, patch) { Object.assign(db.units.find(u => u.id === id), patch) },
  }
}

const snap = (over) => {
  const r = validateSnapshot(corpo(over))
  assert.equal(r.erro, undefined, r.erro)
  return r.snapshot
}

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
  }
}

test('clínica nova: cria a clínica e a unidade, marcadas como provisionadas', async () => {
  const repo = memoryRepo()
  const r = await applySnapshot(repo, snap())
  const [c] = repo.db.clinics
  assert.equal(r.clinicaId, c.id)
  assert.equal(c.helena_account_id, COMPANY)
  assert.equal(c.name, 'Clínica Sorriso')
  assert.equal(c.helena_token, 'tok-plataforma')
  assert.equal(c.active, true)
  assert.equal(c.crm_enabled, true)
  assert.equal(c.crm_api_key, 'crm_chave')
  assert.equal(c.envia_lembrete_de_consulta, false)
  assert.equal(c.provisionado_em, '2026-10-08T12:00:00.000Z')
  assert.match(c.slug, /^clinica-sorriso-0b6c1d9e$/)

  const [u] = repo.db.units
  assert.equal(u.clinic_id, c.id)
  assert.equal(u.crm_unit_id, U1)
  assert.equal(u.clinicorp_business_id, 123)
  assert.equal(u.clinicorp_code_link, '9')
  assert.deepEqual(u.bookable_professional_ids, ['55'])
  assert.ok(u.provisionado_em)
})

test('é idempotente: o mesmo retrato duas vezes não duplica nada', async () => {
  const repo = memoryRepo()
  await applySnapshot(repo, snap())
  const antes = JSON.stringify(repo.db)
  await applySnapshot(repo, snap())
  assert.equal(JSON.stringify(repo.db), antes)
})

test('clínica que já existe aqui: atualiza pelo helena_account_id e adota a unidade do mesmo negócio', async () => {
  const repo = memoryRepo({
    clinics: [{ id: 'c-old', helena_account_id: COMPANY, name: 'Antigo', helena_token: 'tok-velho', active: true, crm_enabled: false, scheduled_message: { enabled: true } }],
    units: [{ id: 'u-old', clinic_id: 'c-old', name: 'Matriz', clinicorp_business_id: 123, crm_unit_id: null, active: true }],
  })
  const r = await applySnapshot(repo, snap())
  assert.equal(r.clinicaId, 'c-old')
  assert.equal(repo.db.clinics.length, 1)
  assert.equal(repo.db.clinics[0].name, 'Clínica Sorriso')
  assert.deepEqual(repo.db.clinics[0].scheduled_message, { enabled: true }, 'o lembrete configurado aqui fica')
  assert.equal(repo.db.units.length, 1)
  assert.equal(repo.db.units[0].id, 'u-old')
  assert.equal(repo.db.units[0].crm_unit_id, U1)
  assert.equal(repo.db.units[0].name, 'Unidade Centro')
})

test('retrato sem subscriberId nem codeLink mantém os da unidade adotada; na nova, o padrão', async () => {
  const semExtras = { usuario: 'clin', token: 'tok-clinicorp', businessId: 123 }
  const repo = memoryRepo({
    clinics: [{ id: 'c-old', helena_account_id: COMPANY, name: 'Antigo', helena_token: 'tok-velho', active: true }],
    units: [{ id: 'u-old', clinic_id: 'c-old', name: 'Matriz', clinicorp_user: 'clin', clinicorp_subscriber_id: 'sub-real', clinicorp_business_id: 123, clinicorp_code_link: '77', crm_unit_id: null, active: true }],
  })
  await applySnapshot(repo, snap({ unidades: [
    unidade({ clinicorp: semExtras }),
    unidade({ crmUnitId: U2, nome: 'Unidade Sul', principal: false, clinicorp: { ...semExtras, usuario: 'sul', businessId: 456 } }),
  ] }))
  const velha = repo.db.units.find(u => u.id === 'u-old')
  assert.equal(velha.clinicorp_subscriber_id, 'sub-real')
  assert.equal(velha.clinicorp_code_link, '77')
  const nova = repo.db.units.find(u => u.crm_unit_id === U2)
  assert.equal(nova.clinicorp_subscriber_id, 'sul')
  assert.equal(nova.clinicorp_code_link, '0')
})

test('unidade provisionada que não veio mais é desativada; a cadastrada à mão fica', async () => {
  const repo = memoryRepo()
  await applySnapshot(repo, snap({ unidades: [unidade(), unidade({ crmUnitId: U2, nome: 'Bueno', principal: false, clinicorp: { ...unidade().clinicorp, businessId: 456 } })] }))
  const clinicId = repo.db.clinics[0].id
  repo.db.units.push({ id: 'manual', clinic_id: clinicId, name: 'Manual', clinicorp_business_id: 999, active: true })

  await applySnapshot(repo, snap({ enviadoEm: '2026-10-08T13:00:00.000Z', unidades: [unidade()] }))
  const byCrm = Object.fromEntries(repo.db.units.map(u => [u.crm_unit_id ?? u.id, u]))
  assert.equal(byCrm[U1].active, true)
  assert.equal(byCrm[U2].active, false)
  assert.equal(byCrm.manual.active, true)
  assert.equal(repo.db.units.length, 3, 'nada é apagado')
})

test('retrato mais velho que o aplicado é ignorado', async () => {
  const repo = memoryRepo()
  await applySnapshot(repo, snap({ enviadoEm: '2026-10-08T13:00:00.000Z', nome: 'Novo' }))
  const r = await applySnapshot(repo, snap({ enviadoEm: '2026-10-08T12:00:00.000Z', nome: 'Velho' }))
  assert.equal(r.ignorado, true)
  assert.equal(repo.db.clinics[0].name, 'Novo')
})

test('ligado false desativa sem apagar; token e chave null não apagam o que existe', async () => {
  const repo = memoryRepo()
  await applySnapshot(repo, snap())
  await applySnapshot(repo, snap({ enviadoEm: '2026-10-08T13:00:00.000Z', ligado: false, tokenPlataforma: null, crm: { chaveDaApi: null, urlDaApi: null } }))
  const [c] = repo.db.clinics
  assert.equal(c.active, false)
  assert.equal(c.helena_token, 'tok-plataforma')
  assert.equal(c.crm_api_key, 'crm_chave')
  assert.equal(c.crm_enabled, true)
  assert.equal(repo.db.units.length, 1)
})

test('ligado false numa clínica que não existe aqui não cria nada', async () => {
  const repo = memoryRepo()
  const r = await applySnapshot(repo, snap({ ligado: false }))
  assert.equal(r.clinicaId, null)
  assert.equal(repo.db.clinics.length, 0)
})

test('profissionais agendáveis vazios = todos (null), e a principal vem primeiro', async () => {
  const repo = memoryRepo()
  await applySnapshot(repo, snap({ unidades: [
    unidade({ crmUnitId: U2, nome: 'Bueno', principal: false, profissionaisAgendaveis: [] }),
    unidade(),
  ] }))
  const u2 = repo.db.units.find(u => u.crm_unit_id === U2)
  const u1 = repo.db.units.find(u => u.crm_unit_id === U1)
  assert.equal(u2.bookable_professional_ids, null)
  assert.equal(u1.position, 0)
  assert.equal(u2.position, 1)
})

test('validação: recusa o que foge do contrato', () => {
  const casos = [
    [corpo({ versao: 2 }), 'versao_nao_suportada'],
    [corpo({ companyId: 'abc' }), 'corpo_invalido'],
    [corpo({ nome: ' ' }), 'corpo_invalido'],
    [corpo({ ligado: 'sim' }), 'corpo_invalido'],
    [corpo({ enviaLembreteDeConsulta: undefined }), 'corpo_invalido'],
    [corpo({ crm: undefined }), 'corpo_invalido'],
    [corpo({ unidades: [unidade({ clinicorp: null })] }), 'unidade_sem_clinicorp'],
    [corpo({ unidades: [unidade({ clinicorp: { ...unidade().clinicorp, businessId: null } })] }), 'unidade_sem_business_id'],
    [corpo({ unidades: [unidade(), unidade()] }), 'unidade_repetida'],
    [null, 'json_invalido'],
  ]
  for (const [body, codigo] of casos) {
    const r = validateSnapshot(body)
    assert.equal(r.codigo, codigo, JSON.stringify(body)?.slice(0, 80))
    assert.ok(r.erro)
  }
})

test('rota: 503 sem a chave configurada, 401 com chave errada, 400 com corpo ruim, 200 com tudo certo', async () => {
  const req = (headers, body = corpo()) => ({ method: 'POST', headers, body })

  let res = fakeRes()
  await makeProvisionamentoHandler({ env: {}, repo: memoryRepo(), config: async () => null })(req({ authorization: `Bearer ${KEY}` }), res)
  assert.equal(res.statusCode, 503)

  const env = { CHAVE_DE_PROVISIONAMENTO: KEY }
  res = fakeRes()
  await makeProvisionamentoHandler({ env, repo: memoryRepo() })(req({ authorization: 'Bearer outra' }), res)
  assert.equal(res.statusCode, 401)
  res = fakeRes()
  await makeProvisionamentoHandler({ env, repo: memoryRepo() })(req({}), res)
  assert.equal(res.statusCode, 401)

  res = fakeRes()
  await makeProvisionamentoHandler({ env, repo: memoryRepo() })(req({ authorization: `Bearer ${KEY}` }, '{nao json'), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.codigo, 'json_invalido')

  const repo = memoryRepo()
  res = fakeRes()
  await makeProvisionamentoHandler({ env, repo })(req({ authorization: `Bearer ${KEY}` }, JSON.stringify(corpo())), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true, clinicaId: repo.db.clinics[0].id })

  res = fakeRes()
  await makeProvisionamentoHandler({ env, repo })({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 405)
})
