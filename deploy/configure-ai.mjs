/** Run on the source Mac before the first AI-enabled push. Never prints keys. */
import { loadEnv } from 'vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(repository, '..')
const env = { ...loadEnv('production', resolve(source, 'space AI platform'), ''), ...loadEnv('production', source, '') }
const apiKey = env.LLM_API_KEY || env.VITE_LLM_API_KEY
const model = env.LLM_MODEL || env.VITE_LLM_MODEL || 'MiniMax-M3'
const provider = new URL(env.LLM_BASE_URL || env.VITE_LLM_BASE_URL || 'https://api.minimax.chat/v1')
if (!apiKey || apiKey.length < 9 || /[\r\n]/.test(apiKey + model)) throw new Error('本机模型配置缺失或格式无效；未上传任何凭据。')
if (provider.origin !== 'https://api.minimax.chat' || !/^\/v1\/?$/.test(provider.pathname) || provider.search || provider.username || provider.password) throw new Error('本机供应商配置与固定 MiniMax 代理不一致，已停止。')

const mode = process.argv.includes('--public-limited') ? 'public-limited' : 'token'
const privateDir = resolve(repository, '.private')
mkdirSync(privateDir, { recursive: true, mode: 0o700 })
const codePath = resolve(privateDir, 'ai-access-code.txt')
const accessCode = existsSync(codePath) ? readFileSync(codePath, 'utf8').trim() : randomBytes(24).toString('base64url')
if (mode === 'token' && !existsSync(codePath)) writeFileSync(codePath, `${accessCode}\n`, { mode: 0o600, flag: 'wx' })
if (mode === 'token' && !/^[A-Za-z0-9_-]{16,}$/.test(accessCode)) throw new Error('本地访问口令文件格式无效，未上传。')
const remotePath = '/srv/secrets/dalian-children-hospital-fire-plan/llm.env'
const sshArgs = ['-i', '/Users/mac/.ssh/id_ed25519', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', 'ubuntu@115.159.223.98']
const check = spawnSync('ssh', [...sshArgs, `test -f ${remotePath}`], { stdio: 'ignore' })
if (check.status === 0) {
  console.log('服务器已存在 AI 配置，未覆盖。请保留现有口令；需要更新时另行确认。')
  process.exit(0)
}
if (check.status !== 1) throw new Error('SSH 检查失败，未上传凭据。')
const contents = [`LLM_API_KEY=${apiKey}`, `LLM_MODEL=${model}`, 'PUBLIC_ORIGIN=http://115.159.223.98', `AI_ACCESS_MODE=${mode}`, ...(mode === 'token' ? [`AI_ACCESS_CODE=${accessCode}`] : []), ''].join('\n')
const command = `set -eu; umask 077; sudo install -d -m 700 -o ubuntu -g ubuntu /srv/secrets/dalian-children-hospital-fire-plan; test ! -e ${remotePath}; install -m 600 /dev/stdin ${remotePath}`
const uploaded = spawnSync('ssh', [...sshArgs, command], { input: contents, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' })
if (uploaded.status !== 0) throw new Error('服务器配置写入失败，未启动部署；请核对 SSH/目录权限。')
console.log('AI 配置已通过 SSH 写入服务器专属 600 权限文件；未进入仓库或日志。')
if (mode === 'token') console.log(`访问口令保存在本机私有文件：${codePath}。不要提交或公开分享。`)
else console.log('已选择公众限流模式：全站 6 次/分钟、200 次/日、最多 2 个并发。')
