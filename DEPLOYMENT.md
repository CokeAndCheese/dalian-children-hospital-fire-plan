# 更新发布说明

## 2026-09-09 HTTP 兼容修复补充

`ffd36d8` 已推送，CI 的测试与双容器门禁通过；因 GitHub 到腾讯云上传过慢，取消该次作业后由 Mac 中转同一提交发布。公网完整模型加载后暴露 HTTP 环境不提供 `crypto.randomUUID()` 的问题，故已恢复旧版 `f62ba12`。旧镜像记录 ID 已无法使用，回滚由准确旧提交重建完成，当前旧 web healthy；AI 容器停止，密钥和额度卷保留。

本地 Planner/IntentLogger 已使用原生 UUID 优先、getRandomValues 的 UUID v4 兼容路径。缺少 randomUUID 的回归、类型检查、构建和真实非安全 HTTP 浏览器模型初始化/炸开/合拢测试通过。修复包 `platformEmbed-B7oBQpSw.js` 待推送，不需要重新运行凭据配置脚本。此次新增改动仅为页面构建、发布检查和本文说明，未更改医院模型。

当前回滚基线提交仍为 `f62ba122d8bbd885ec3c2160e629fbc197019111`，重建后的镜像为 `sha256:052c4e5104e2d5b937ceef42b3bbc3ea654eac45cd7a1673d5ee3eb409a96985`。以下历史准备记录保留供追溯；下次发布前须重新读取实际版本和镜像。

## 已核对的原版本

- 仓库：https://github.com/CokeAndCheese/dalian-children-hospital-fire-plan ，分支 main。
- 2026-09-09 核对 GitHub 与服务器都为 f62ba122d8bbd885ec3c2160e629fbc197019111，原容器健康。
- 服务器目录：/srv/apps/dalian-children-hospital-fire-plan。
- 回滚提交：f62ba122d8bbd885ec3c2160e629fbc197019111。
- 回滚 web 镜像：sha256:2243d6589ddf65c85c3b3285e5684bacc5260f7e9f7395eadcb2930a61eb1574。
- 准备时未推送或切换线上版本。覆盖旧文件通过普通提交完成，不删除 .git，不强制推送。

## 首次启用生产 AI

先在这台源工程 Mac 的发布目录运行：

```bash
node deploy/configure-ai.mjs
```

脚本读取相邻源工程已有 MiniMax 配置，通过严格核验 host key 的 SSH 写入服务器 /srv/secrets/dalian-children-hospital-fire-plan/llm.env。目录权限 700，文件 600，位于仓库之外；不输出凭据，不覆盖已有服务器配置。使用源工程已安装的 Vite，无需新装依赖。

默认启用访问口令。本机口令保存到 .private/ai-access-code.txt，权限 600，已排除 Git 和 Docker build。在页面“AI 服务访问设置”填写此口令，不要填写供应商 API Key。口令仅留在页面内存，刷新后需重新填写。

只有用户明确选择公众调用时才运行 node deploy/configure-ai.mjs --public-limited。两种模式均限制全站 6 次/分钟、200 次/UTC 日、2 个并发；公众模式允许所有访客消耗额度。已有服务器配置不会被此选项覆盖。

当前仍是 HTTP IP 入口，浏览器到服务器的口令和对话未受 TLS 保护，不应用于真实敏感救援业务；供应商 Key 不进入浏览器，服务器到 MiniMax 使用 HTTPS。正式受限业务需独立域名、HTTPS 和身份权限。

## 上传命令

本次包含 55 个分层医院 GLB，合计约 202 MiB。请确认可上传到原公开仓库。命令只暂存列出的发布文件，不包含 .env、.private、SSH Key 或生产数据库。

```bash
(
  set -e
  cd '/Users/mac/Documents/Codex/大连赛题二/dalian-children-hospital-fire-plan'
  test "$(git branch --show-current)" = main
  node deploy/configure-ai.mjs
  node deploy/verify-package.mjs
  git add -A -- .dockerignore .gitignore .github/workflows/deploy.yml Dockerfile compose.yml nginx.conf README.md DEPLOYMENT.md deploy/configure-ai.mjs deploy/verify-package.mjs server site
  git diff --cached --stat
  git commit -m "feat: restore spatial AI with protected production proxy"
  git -c http.proxy=http://127.0.0.1:7892 push origin main
)
```

7892 在本次准备时已确认监听。不要设置全局代理，不要将 Mac 回环代理配置给腾讯服务器。如果远端已新增提交导致非快进拒绝，停止核对，不要 force push。

## 自动发布

沿用已验证的专用 CI SSH Key、LIGHTHOUSE_KNOWN_HOSTS 和原仓库变量。main push 后：

1. 执行代理测试和发布包检查。
2. Actions runner 用非敏感测试配置构建并启动两个容器，验证健康和鉴权路由，不调用供应商。
3. 创建准确触发提交的完整 Git bundle，经 SSH/SCP 入站传送。
4. 原 release runner 拒绝脏工作区、非快进、错误提交及并发发布；只重建本项目。失败回滚。
5. web 服务依赖 AI 代理健康；凭据/访问口令配置缺失时不会将新版本当作健康上线。不删除每日额度卷。

现有 Caddy handle_path 路由及首页卡片继续使用同一地址，无需修改其他项目或开放新端口。资源与 AI 接口均留在本项目子路径中。

公网地址：http://115.159.223.98/dalian-children-hospital-fire-plan/

推送后必须核对 Actions 成功、服务器 HEAD、新 web/AI 容器健康、更新的网页/JS、子路径模型加载、AI 鉴权与真实模型调用、根首页项目链接。只有这些通过才算部署完成。

## 验证与回滚

本机已通过源工程回归、类型检查、构建、5 项代理测试、55 个 GLB 语义检查、脚本语法检查。Mac Docker daemon 未运行，真实容器构建由 Actions runner 验证，成功后才发送 bundle。

回滚前确认服务器工作区没有额外改动，并记录本次新提交/两个镜像。切换到上述回滚提交，再运行 sudo docker compose up -d --build；不要 reset --hard、删除 volume 或修改其他项目。回滚旧静态版本后可单独停止本项目 AI 容器，保留 ai-budget 卷；不要用 --remove-orphans 广泛清理。
