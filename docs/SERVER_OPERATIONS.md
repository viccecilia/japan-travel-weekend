# 服务器运行规范

## 运行角色

Test server 用于版本化候选 artifact 的集成验证；Production server 仅运行已授权的同一 artifact。服务器不作为正式源码目录或长期源码修复位置。

版本化 release 通过 `current` symlink 激活；部署前执行 preflight，激活后检查 health。API service 由进程管理器运行，Nginx 提供反向代理与静态服务。运行时版本以 `RELEASE_SHA`（前端）和 `JTW_RELEASE_SHA`（API）表达。

## 可观测性与漂移

- `/health`：检查服务存活、mode 和 release/version。
- `/ready`：检查环境依赖是否就绪，不能替代 `/health`。
- 每次核对 GitHub expected SHA、frontend deployed SHA、API `/health` version、migration version，并读取必要日志。
- 环境结论只能是 `CONSISTENT` 或 `DRIFTED`；DRIFTED 时先恢复一致性，再继续依赖该环境的测试。

日志不得包含敏感配置或个人数据。release cleanup 必须保留当前及已知可回滚版本，并受发布留存策略控制。

## 回滚缺口

现有 Test 发布具备 versioned release、`current` symlink、preflight 和 health check；但尚未确认失败后自动恢复到 previous known-good release 的完整闭环。此项为 **Release Hardening Gap**，本轮仅记录，不改 deploy script。
