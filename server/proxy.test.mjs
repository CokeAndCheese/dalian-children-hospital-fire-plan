import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAiProxy } from './proxy.mjs'

const code = 'test-access-code-not-a-real-secret'
const payload = { messages: [{ role: 'user', content: 'test query' }], model: 'attacker-model', max_tokens: 999999 }

async function fixture(options = {}) {
  const calls = []
  const server = createAiProxy({
    apiKey: 'test-key-not-a-real-secret', origin: 'http://project.test', accessCode: code, budgetFile: null,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"template"}' } }] }))
    }, ...options,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  return {
    calls,
    send: (body = payload, headers = {}) => fetch(`${url}/api/llm/chat/completions`, {
      method: 'POST', headers: { Origin: 'http://project.test', 'Content-Type': 'application/json', 'X-AI-Access-Code': code, ...headers }, body: JSON.stringify(body),
    }),
    health: () => fetch(`${url}/health`),
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) },
  }
}

test('fails closed for missing credentials and access code', async () => {
  const f = await fixture({ accessCode: '' })
  try { assert.equal((await f.health()).status, 503); assert.equal((await f.send()).status, 503); assert.equal(f.calls.length, 0) }
  finally { await f.close() }
})

test('requires origin/code; owns model, upstream and output limit', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.health()).status, 200)
    assert.equal((await f.send(payload, { Origin: 'https://evil.test' })).status, 403)
    assert.equal((await f.send(payload, { 'X-AI-Access-Code': 'wrong' })).status, 401)
    assert.equal((await f.send({ messages: [] })).status, 400)
    assert.equal((await f.send({ ...payload, stream: true })).status, 400)
    assert.equal((await f.send({ messages: [{ role: 'user', content: 'x'.repeat(140000) }] })).status, 413)
    const response = await f.send()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].url, 'https://api.minimax.chat/v1/chat/completions')
    assert.equal(f.calls[0].body.model, 'MiniMax-M3')
    assert.equal(f.calls[0].body.max_tokens, 4096)
    assert.equal(f.calls[0].body.stream, false)
  } finally { await f.close() }
})

test('global minute limit and explicit public-limited mode', async () => {
  const f = await fixture({ minuteLimit: 1, accessMode: 'public-limited', accessCode: '' })
  try { assert.equal((await f.send()).status, 200); assert.equal((await f.send()).status, 429); assert.equal(f.calls.length, 1) }
  finally { await f.close() }
})

test('daily budget survives restart and corrupt ledger fails closed', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'fire-plan-ai-test-'))
  const path = join(folder, 'budget.json')
  const opts = { budgetFile: path, dailyLimit: 1 }
  let f = await fixture(opts)
  try {
    assert.equal((await f.send()).status, 200)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).used, 1)
    await f.close()
    f = await fixture(opts)
    assert.equal((await f.send()).status, 429)
    assert.equal(f.calls.length, 0)
    await f.close()
    writeFileSync(path, 'corrupt test ledger')
    f = await fixture(opts)
    assert.equal((await f.health()).status, 503)
    assert.equal((await f.send()).status, 503)
  } finally { await f.close(); rmSync(folder, { recursive: true }) }
})

test('upstream errors are sanitized', async () => {
  const f = await fixture({ fetchImpl: async () => new Response('SENSITIVE_UPSTREAM_DIAGNOSTIC', { status: 401 }) })
  try {
    const response = await f.send()
    assert.equal(response.status, 502)
    assert.ok(!(await response.text()).includes('SENSITIVE_UPSTREAM_DIAGNOSTIC'))
  } finally { await f.close() }
})
