# Japan Travel Weekend

测试服务栈已批准为 Supabase + Stripe + Google Maps Platform。Supabase 远程测试项目已执行至 019 迁移；虚构账户、RLS、测试 Webhook 与浏览器 100 日元 Stripe 测试卡流程均已验收。配置变量见 `.env.example`，操作与安全边界见 `docs/approved-test-service-stack.md`。

Supabase 测试项目迁移必须按文件名顺序且每份只执行一次；使用网页 SQL Editor 时必须先 `Ctrl+A` 全选编辑器内容再粘贴完整文件，避免只覆盖可见区域。执行后运行 `supabase/verification/remote_structure_acceptance.sql`。远程行为联调状态见 `docs/remote-test-validation.md`。

面向关西国际居民的周末拼席旅行产品基础工程，由株式会社大寅／大寅集团运营。本仓库独立于 `japan-travel.info`。

## 本地运行

需要 Node.js 24。`npm run dev` 使用 development 模式并加载集中开发种子；正式构建 `npm run build` 使用 production 模式，绝不自动加载出发班次、订单、司机、倒计时、聊天或位置等假数据。

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run check:content
npm run check:launch
npm run probe:test-api
npm run build
```

显式演示模式：`VITE_RUNTIME_MODE=demo npm run dev`。关闭开发种子：`VITE_ENABLE_SEED_DATA=false npm run dev`。

## 产品边界

- 网站与应用当前完整使用简体中文，语言入口保留但其他语言不可选；`html lang` 固定为 `zh-CN`。
- 业务读取经过 repository/service，可在后续替换为安全后端 API。
- `localStorage` 只保存界面偏好；订单、乘客隐私、消息和位置授权仅在会话内存中存在。
- 正式环境不编造价格、余位、距离或实时状态，缺少数据时展示正式空状态。
- 保留 `noindex,nofollow` 和阻止抓取的 `robots.txt`，直到产品具备公开上线条件。

详细说明见 `docs/production-foundation.md`、`docs/runtime-modes.md`、`docs/data-model.md`、`docs/vehicle-allocation.md`、`docs/trip-room.md` 与 `docs/account-authentication.md`。
