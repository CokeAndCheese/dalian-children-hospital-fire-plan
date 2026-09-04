# 大连儿童医院三维动态消防预案

这是驾驶舱 Demo 的静态发布包，包含同源 Space AI Platform 三维视图、B20 病区和 B4 停车区两个演示场景。

- 入口：`site/fire-rescue-cockpit.html`
- 容器：Nginx，仅暴露到 Docker `web` 网络
- 公网路径：`/dalian-children-hospital-fire-plan/`
- 健康检查：`/health`
- 运行数据：本地浏览器会话，不会下发到真实指挥或物联系统

`site/` 由业务源工程的 `npm run build` 产物生成。源项目更新后，需重新构建并同步整个 `site/` 目录。

