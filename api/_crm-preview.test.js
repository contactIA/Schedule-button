import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCrmPreviewHandler } from './crm-preview.js'

process.env.ADMIN_PASSWORD = 'senha-admin'

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
  }
}
const req = (query, key = 'senha-admin') => ({ method: 'GET', query, headers: { 'x-admin-key': key } })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

const clinic = { id: 'c1', helena_account_id: 'acc1', crm_api_key: 'crm_da_clinica' }

test('rota: lista as unidades do CRM com a chave e o idconta da clínica', async () => {
  const seen = []
  const fetchImpl = async (url, opts) => {
    seen.push({ url, auth: opts.headers.Authorization, clinica: opts.headers['X-Clinica'] })
    return url.endsWith('/eu')
      ? json({ podeEscrever: true, paineis: ['crc1'], clinica: { nome: 'Prev' } })
      : json({ unidades: [{ id: 'u1', nome: 'Centro', ativa: true }] })
  }
  const handler = makeCrmPreviewHandler({ loadClinic: async () => clinic, fetchImpl })
  const res = fakeRes()
  await handler(req({ clinicId: 'c1' }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { clinicName: 'Prev', units: [{ id: 'u1', name: 'Centro', active: true }] })
  assert.ok(seen.every(s => s.auth === 'Bearer crm_da_clinica' && s.clinica === 'acc1'))
  assert.deepEqual(seen.map(s => s.url.split('/').pop()).sort(), ['eu', 'unidades'])
  // A chave nunca volta na resposta
  assert.equal(JSON.stringify(res.body).includes('crm_da_clinica'), false)
})

test('rota: chave recusada vira 400 com frase clara', async () => {
  const fetchImpl = async () => json({ erro: 'Chave da API inválida ou revogada', codigo: 'CHAVE_INVALIDA' }, 401)
  const handler = makeCrmPreviewHandler({ loadClinic: async () => clinic, fetchImpl })
  const res = fakeRes()
  await handler(req({ clinicId: 'c1' }), res)
  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /recusou a chave/)
})

test('rota: clínica sem chave não chama o CRM', async () => {
  let called = false
  const handler = makeCrmPreviewHandler({
    loadClinic: async () => ({ ...clinic, crm_api_key: null }),
    fetchImpl: async () => { called = true },
  })
  const res = fakeRes()
  await handler(req({ clinicId: 'c1' }), res)
  assert.equal(res.statusCode, 404)
  assert.equal(called, false)
})

test('rota: exige a senha de admin', async () => {
  const handler = makeCrmPreviewHandler({ loadClinic: async () => clinic, fetchImpl: async () => json({}) })
  const res = fakeRes()
  await handler(req({ clinicId: 'c1' }, 'errada'), res)
  assert.equal(res.statusCode, 401)
})
