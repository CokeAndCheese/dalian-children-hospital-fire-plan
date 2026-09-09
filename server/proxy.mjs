import http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_BODY_BYTES = 128 * 1024
const MAX_RESPONSE_BYTES = 256 * 1024
const hash = (value) => createHash('sha256').update(String(value)).digest()

export function createAiProxy({
  apiKey = process.env.LLM_API_KEY ?? '',
  model = process.env.LLM_MODEL ?? 'MiniMax-M3',
  origin = process.env.PUBLIC_ORIGIN ?? 'http://115.159.223.98',
  accessMode = process.env.AI_ACCESS_MODE ?? 'token',
  accessCode = process.env.AI_ACCESS_CODE ?? '',
  budgetFile = process.env.AI_BUDGET_FILE ?? '/app/data/budget.json',
  dailyLimit = 200,
  minuteLimit = 6,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const configured = apiKey.length > 8 && ['token', 'public-limited'].includes(accessMode) &&
    (accessMode !== 'token' || accessCode.length >= 16)
  let inFlight = 0
  let recent = []
  let budget = { day: '', used: 0 }
  let budgetHealthy = true
  if (budgetFile) {
    try {
      budget = JSON.parse(readFileSync(budgetFile, 'utf8'))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(budget.day) || !Number.isSafeInteger(budget.used) || budget.used < 0) throw new Error('invalid budget')
    } catch (error) {
      if (error.code !== 'ENOENT') budgetHealthy = false
    }
  }

  function consumeBudget() {
    const timestamp = now()
    const day = new Date(timestamp).toISOString().slice(0, 10)
    if (budget.day !== day) budget = { day, used: 0 }
    recent = recent.filter((time) => timestamp - time < 60_000)
    if (recent.length >= minuteLimit || budget.used >= dailyLimit || inFlight >= 2) return false
    const next = { day, used: budget.used + 1 }
    if (budgetFile) {
      try {
        mkdirSync(dirname(budgetFile), { recursive: true })
        writeFileSync(`${budgetFile}.tmp`, JSON.stringify(next), { mode: 0o600 })
        renameSync(`${budgetFile}.tmp`, budgetFile)
      } catch {
        budgetHealthy = false
        throw new Error('budget unavailable')
      }
    }
    budget = next
    recent.push(timestamp)
    return true
  }

  function reply(response, status, payload) {
    if (response.destroyed) return
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    })
    response.end(JSON.stringify(payload))
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      return reply(response, configured && budgetHealthy ? 200 : 503, { ok: configured && budgetHealthy })
    }
    if (request.url !== '/api/llm/chat/completions') return reply(response, 404, { error: 'Not found' })
    if (request.method !== 'POST') return reply(response, 405, { error: '仅支持 POST' })
    if (!configured || !budgetHealthy) return reply(response, 503, { error: 'AI 服务尚未安全配置，请联系管理员。常用本地指令仍可使用。' })
    if (request.headers.origin !== origin) return reply(response, 403, { error: '请求来源不允许' })
    if (accessMode === 'token' && !timingSafeEqual(hash(request.headers['x-ai-access-code'] ?? ''), hash(accessCode))) {
      return reply(response, 401, { error: '请在 AI 服务访问设置中填写正确的访问口令（不是供应商 API Key）。' })
    }
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) return reply(response, 415, { error: '仅接受 JSON' })
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) return reply(response, 413, { error: '请求过大' })

    let body
    try {
      let size = 0
      const chunks = []
      for await (const chunk of request) {
        size += chunk.length
        if (size > MAX_BODY_BYTES) { reply(response, 413, { error: '请求过大' }); return }
        chunks.push(chunk)
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12 || body.stream === true ||
          body.messages.some((message) => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 100_000)) {
        return reply(response, 400, { error: '消息格式不支持' })
      }
    } catch { return reply(response, 400, { error: '无法读取 JSON 请求' }) }
    try {
      if (!consumeBudget()) return reply(response, 429, { error: 'AI 请求已达并发、每分钟或每日限额，请稍后再试；本地空间指令不受影响。' })
    } catch { return reply(response, 503, { error: 'AI 额度保护不可用，服务已暂停。' }) }

    inFlight++
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 30_000)
    const onClose = () => { if (!response.writableEnded) abort.abort() }
    response.on('close', onClose)
    try {
      // Fixed upstream, server-owned model and output cap: never a generic proxy.
      const upstream = await fetchImpl('https://api.minimax.chat/v1/chat/completions', {
        method: 'POST',
        redirect: 'error',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: body.messages.map(({ role, content }) => ({ role, content })),
          temperature: 0, max_tokens: 4096, stream: false,
          response_format: { type: 'json_object' },
        }),
      })
      if (!upstream.ok) { await upstream.body?.cancel(); return reply(response, 502, { error: '模型供应商暂时不可用，请稍后重试。' }) }
      const reader = upstream.body?.getReader()
      if (!reader) throw new Error('empty response')
      const chunks = []
      let size = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('oversized response') }
        chunks.push(value)
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new Error('invalid response')
      reply(response, 200, { choices: [{ message: { role: 'assistant', content } }] })
    } catch {
      reply(response, abort.signal.aborted ? 504 : 502, { error: abort.signal.aborted ? '模型响应超时，请重试。' : '模型服务响应异常，请稍后重试。' })
    } finally {
      clearTimeout(timeout)
      response.off('close', onClose)
      inFlight--
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createAiProxy()
  server.listen(3000, '0.0.0.0', () => console.log('AI proxy listening on port 3000'))
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
}
