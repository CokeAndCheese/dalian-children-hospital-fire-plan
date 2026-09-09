import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (path) => readFileSync(path, 'utf8')
const embed = read('site/platform-embed.html')
const script = embed.match(/src="\.\/([^\"]+\.js)"/)?.[1]
assert(script && read(`site/${script}`).includes('空间指令'), 'missing spatial chat release')
assert(read(`site/${script}`).includes('浏览器缺少随机数能力') && read(`site/${script}`).includes('getRandomValues'), 'missing public-HTTP runtime ID compatibility')
assert(read('site/fire-rescue-cockpit.html').includes('id="fire-rescue-cockpit"'), 'missing cockpit')
assert.equal(readdirSync('site/models/hospital').filter((name) => name.endsWith('.glb')).length, 55, 'must contain 55 semantic GLBs')
for (const name of readdirSync('site/models/hospital').filter((name) => name.endsWith('.glb'))) {
  const path = `site/models/hospital/${name}`
  assert(statSync(path).size < 100 * 1024 * 1024, 'asset exceeds GitHub single-file limit')
  const bytes = readFileSync(path)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  assert(json.scenes?.[0]?.extras?.floorName, `semantic metadata missing: ${name}`)
}
assert(read('compose.yml').includes('condition: service_healthy'), 'AI health dependency missing')
assert(read('nginx.conf').includes('location = /api/llm/chat/completions'), 'AI route missing')
console.log('Release package OK: semantic models, spatial AI, internal proxy and health dependency')
