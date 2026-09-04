# 部署说明

## 首次发布

1. 将本目录作为仓库根目录上传到公开 GitHub 仓库 `dalian-children-hospital-fire-plan`。
2. 服务器克隆到 `/srv/apps/dalian-children-hospital-fire-plan`。
3. 运行 `sudo docker compose config` 和 `sudo docker compose up -d --build`。
4. 健康后将 `deploy/caddy-route.caddy` 的路由添加到共享 Caddyfile，并在服务器首页添加项目卡片。

## GitHub Actions 自动发布

工作流默认被仓库变量锁定。首次手动部署和回滚验证完成后再配置：

Repository variables:

- `LIGHTHOUSE_DEPLOY_ENABLED=true`
- `LIGHTHOUSE_HOST=115.159.223.98`
- `LIGHTHOUSE_USER=ubuntu`

Repository secrets:

- `LIGHTHOUSE_SSH_PRIVATE_KEY`：该仓库专用的 Ed25519 CI 私钥
- `LIGHTHOUSE_KNOWN_HOSTS`：已核验并锁定的服务器 SSH host key

每次 `main` 推送会上传完整 Git bundle，服务器仅接受严格快进版本，随后重建该项目容器并验证健康检查和公网内容标识。失败时回滚到上一提交。

