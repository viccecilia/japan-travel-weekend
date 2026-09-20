# Blocker Closure 发布记录 — 2026-09-20

## 已完成

- GitHub：`feature/production-app-foundation` 已推送到代码提交 `4a3f441b9ecf05e660e1e58cfd7737d430e54f35`，普通 push，未强推。
- 测试数据库 `hzxoofvodpqpdomtmzlf`：四个已审查迁移在单个事务内成功安装并登记，最新版本 `20260919101135`；没有更改账号、订单、价格或支付模式。
- 发布后重新执行既有身份下的数据库行为测试：91 条证据记录全部通过，测试 fixture 已回滚；正式安装的迁移保持生效。日志 `runtime/blocker-installed-verification.log`。
- 发布前原函数定义、授权信息、约束与迁移历史保存于 `runtime/blocker-release-20260920/database-before.json`。恢复原函数的手动脚本同目录保留；不自动删除新审计/授权记录，不自动放松安全边界。
- 一键部署按锁文件 `npm ci`，787 项测试通过，构建、内容/发布门禁通过。保留用户未提交照片组件及本地素材，构建来源清单随包保存，不是纯 GitHub HEAD 构建。
- 包已上传服务器：`/home/ubuntu/jtw-manual-20260920-103950-4a3f441.tar.gz`，本地/远端 SHA256 一致：`a392ddc2e9d33d9d995e2dbd241e6c38379a9a37e15f2a8bb7a3b6fac34aa8c9`；远端安装脚本语法检查通过。
- 本批没有 API 源码或依赖版本变动，API 服务不重装、不修改支付配置。公网 `/api/ready` 为 200、application/json，mode=test，database/stripeModeSafe/webhookSecret/notificationReceiptSecret 均 true。

## 等待人工密码：不能标记前端部署完成

已打开 PowerShell 部署窗口，停在 `sudo` 密码输入。当前前端仍为：

`/var/www/jtw-test-releases/jtw-manual-20260914-190041-8a4fbde`

当前线上前端 SHA：`8a4fbde01a9daf99323748e77d0d69360cd52fe6`。

目标前端目录：`/var/www/jtw-test-releases/jtw-manual-20260920-103950-4a3f441`。安装脚本保留原目录并写入 `ROLLBACK_FROM`；切换失败时恢复原链接及 Nginx 配置。

密码完成后仍须核对新发布链接、前端 SHA、Nginx、API、资源哈希和近期日志。上传成功、健康接口 200 均不代表新页面已经上线或业务登录验收通过。

## 已知边界

- P01/D01/A01 当前凭据仍需更新，未重置/创建账号，未冒充真实登录验收。
- 西班牙语自动翻译仍未接通。
- 依赖审计发现现有 `nodemailer` 1 项 high 风险，未在部署中自动升级依赖；原安全检查另有 RLS 无直接策略及已有函数执行权限提示，未为消除提示开放权限。本轮新增表保持 RLS，受控 RPC 权限已行为验证。
- 未执行真实支付、退款、佣金或外部通知；本次不改变生产环境。
