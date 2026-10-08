import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { makeConfigReader, CONFIG_TTL_MS } from './_configuracao.js'
import { makeProvisionamentoHandler } from './provisionamento.js'
import { matchesSha256Hex } from './_setup-token.js'

// A tabela configuracao_do_servidor (CRM#217, CRM#219): o cache curto e a
// chave do provisionamento conferida pelo sha256, sem variável na Vercel.

const KEY = 'chave-de-provisionamento-de-teste'
const KEY_SHA256 = createHash('sha256').update(KEY).digest('hex')

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(b) { this.body = b; return this },
  }
}

test('o leitor guarda o valor por 60 s, também o ausente, e não guarda a falha', async () => {
  let t = 0
  let lidas = 0
  let valores = { a: 'um' }
  let falhar = false
  const get = makeConfigReader({
    now: () => t,
    read: async (chave) => { lidas++; if (falhar) throw new Error('banco fora'); return valores[chave] ?? null },
  })

  assert.equal(await get('a'), 'um')
  assert.equal(await get('nao'), null)
  valores = { a: 'dois' }
  t = CONFIG_TTL_MS - 1
  assert.equal(await get('a'), 'um')
  assert.equal(await get('nao'), null)
  assert.equal(lidas, 2)

  t = CONFIG_TTL_MS
  assert.equal(await get('a'), 'dois')
  assert.equal(lidas, 3)

  falhar = true
  t = 3 * CONFIG_TTL_MS
  await assert.rejects(get('a'))
  falhar = false
  assert.equal(await get('a'), 'dois')
  assert.equal(lidas, 5)
})

test('matchesSha256Hex: confere o sha256 em hex, maiúsculo também, e recusa hex torto', () => {
  assert.equal(matchesSha256Hex(KEY, KEY_SHA256), true)
  assert.equal(matchesSha256Hex(KEY, KEY_SHA256.toUpperCase()), true)
  assert.equal(matchesSha256Hex('outra', KEY_SHA256), false)
  assert.equal(matchesSha256Hex(KEY, KEY_SHA256.slice(2)), false)
  assert.equal(matchesSha256Hex(KEY, null), false)
})

// Um pedido sem corpo válido: passar da chave dá 400, não passar dá 401 ou 503.
async function provisionar({ env = {}, config, bearer = KEY }) {
  const res = fakeRes()
  const req = { method: 'POST', headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, body: '{nao json' }
  await makeProvisionamentoHandler({ env, config, repo: {} })(req, res)
  return res
}

test('provisionamento: com a variável, vale ela e a tabela nem é lida', async () => {
  let lidas = 0
  const config = async () => { lidas++; return createHash('sha256').update('outra').digest('hex') }
  assert.equal((await provisionar({ env: { CHAVE_DE_PROVISIONAMENTO: KEY }, config })).statusCode, 400)
  assert.equal((await provisionar({ env: { CHAVE_DE_PROVISIONAMENTO: KEY }, config, bearer: 'outra' })).statusCode, 401)
  assert.equal(lidas, 0)
})

test('provisionamento: sem a variável, confere o sha256 da linha provisionamento_sha256', async () => {
  const config = async (chave) => (chave === 'provisionamento_sha256' ? KEY_SHA256 : null)
  assert.equal((await provisionar({ config })).statusCode, 400)
  const errada = await provisionar({ config, bearer: 'outra' })
  assert.equal(errada.statusCode, 401)
  assert.equal(errada.body.codigo, 'chave_invalida')
  assert.equal((await provisionar({ config, bearer: '' })).statusCode, 401)
})

test('provisionamento: sem a variável e sem a linha, 503; linha torta ou banco fora também', async () => {
  let res = await provisionar({ config: async () => null })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.codigo, 'provisionamento_nao_configurado')

  res = await provisionar({ config: async () => 'nao-e-hex' })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.codigo, 'provisionamento_nao_configurado')

  res = await provisionar({ config: async () => { throw new Error('banco fora') } })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.codigo, 'configuracao_indisponivel')
})
