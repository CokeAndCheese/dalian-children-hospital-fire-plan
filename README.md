# 大连儿童医院三维动态消防预案

这是驾驶舱 Demo 发布包，包含同源 Space AI Platform 三维视图、55 个分层医院模型、真实空间指令，以及独立标注的 B20/B4 模拟消防研判。

- 入口：`site/fire-rescue-cockpit.html`
- 容器：Nginx 位于 Docker `web` 网络；MiniMax 代理只在项目内部网络提供端口 3000，不开放新公网端口
- 公网路径：`/dalian-children-hospital-fire-plan/`
- 健康检查：`/health`
- 运行数据：本地浏览器会话，不会下发到真实指挥或物联系统
- AI 防护：默认访问口令、固定供应商/模型、2 并发、全站 6 次/分钟和 200 次/UTC 日，每日额度持久化

`site/` 由业务源工程的 `npm run build` 产物生成。源项目更新后，需重新构建并同步整个 `site/` 目录。

首次生产 AI 配置和 GitHub 上传命令见 `DEPLOYMENT.md`。不要上传 `.env`、`.private/` 或任何密钥。
