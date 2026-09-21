# Round 2 预检：前置条件未满足

> 历史预检记录：以下FAIL/缺失描述是Round 1追加实现之前的快照，不代表封箱时最新代码。当前状态以ROUND1_PROGRESS.md的“安全封箱checkpoint”为准；Round 2全链路仍未执行。

2026-09-21。本文不是全链路验收通过报告。

## 当前来源

- 正式工作区 / feature/production-app-foundation。
- HEAD ad3719c24cefd4a9b235ff799ebe548103e76082。
- 上轮未提交改动仍在，ROUND1_PROGRESS.md 明确记录未完成，未发现后续提交。
- 用户照片组件、素材和历史数据保留。未 push、未 deploy。

## 安全预检实际结果

1. 修复前 http://127.0.0.1:5188/api/ready 返回200、text/html、Vite应用壳，不能作为API就绪证据。
2. https://api-test.japan-travel.info/ready 及本地 /api-test/ready 返回：

```json
{
  "ok": false,
  "mode": "test",
  "checks": {
    "database": true,
    "stripeModeSafe": true,
    "webhookSecret": true,
    "notificationReceiptSecret": false
  },
  "version": "864cd432aba32fdf7b3ff88129e1058a240be595"
}
```

HTTP503，Content-Type application/json; charset=utf-8。
这是实际运行时test模式证据，不是支付成功或webhook送达证据。

3. .env.production.local：VITE_STRIPE_MODE=test、VITE_LIVE_PAYMENTS_ENABLED=false。
4. 未读取/修改服务器支付密钥，未启动付款、未创建订单、未伪造paid、未创建fixture。
5. JTW_STRIPE_MODE在已检查本地server test文件未显式配置；服务器ready报告有效模式test，不能据此声称已核对远端环境变量的字面值。

## 本轮只修一个阻断Bug

前端API基址为/api，但Vite只代理/api-test，导致本地API请求被SPA接管。

- scripts/dev-api-proxy.ts：两个严格路径前缀统一代理现有 https://api-test.japan-travel.info。
- vite.config.ts：使用该配置，未改变线上Nginx、生产服务或业务接口。
- tsconfig.node.json：仅增加此配置文件及显式TS扩展名支持。
- tests/devApiProxy.test.ts：3项测试通过；ready/checkout/查询参数路径正确，近似前缀/apiary等不匹配。
- 修复后本地/api/ready实际返回与上游相同的503 JSON，不再伪装200 HTML。
- 涉及文件eslint通过。
- npm run typecheck及npm run build通过；保留既有大包警告。

## 尚未开始的全链路测试

Round 1未完成项包括：Resume Payment、群照片私有上传、游客真实坐标分享、集合电话窗口及整页八语。
这些是开发缺口，不是浏览器登录一次即可验证的问题。

| 模块 | 当前分类 | 本轮准确范围 |
|---|---|---|
| Payment | FAIL | 恢复支付API/按钮缺失；通知回执配置检查失败；没有执行Stripe支付 |
| Orders | PARTIAL | 未创建本轮测试订单，未验证金额/库存回调 |
| Dispatch | PARTIAL | 未派车或发布，不修改现有旅行团 |
| Staff | PARTIAL | 尚未以D01/G01独立登录联调 |
| Chat | PARTIAL | 上轮已有单open直达验证，本轮未建立A/B/C及双端Realtime测试 |
| Photos | FAIL | Round1真实私有上传未实现 |
| Location | FAIL | Round1游客接口仍只建授权记录，真实坐标链路未完成 |
| Meeting | PARTIAL | 本轮未执行 |
| Phone | FAIL | 仍是旧出发后窗口；集合窗口尚未实现/验证 |
| Boarding | PARTIAL | 本轮未执行 |
| Journey | PARTIAL | 本轮未执行 |
| AI | PARTIAL | 本轮未执行 |
| i18n | FAIL | 剩余页面有硬编码；不能用八语导航通过替代整页 |
| Profile | PARTIAL | 上轮同意迁移仅回滚测试，未部署；本轮未执行浏览器保存 |
| PWA | PARTIAL | 本轮未执行旧版本升级测试 |

PARTIAL表示未完成验收，不代表已经通过部分业务操作。未生成模拟截图冒充证据。

## 待决策

- P1：是否先恢复Round1缺口开发，再启动Round2？当前Round2限定“只测试、修阻断Bug”，不能把未实现的大项描述为已完成后测试。
- 外部配置：测试API通知回执密钥缺失或不满足长度检查，需要服务维护人配置；不要在聊天中发送密钥。未擅自配置服务器。
- P1：新增本地迁移未部署，不能直接拿远端旧函数执行新版浏览器验收；需要确定隔离联调数据库的迁移应用方式，遵守不部署要求。
- 尚未做全量安全审计，不能宣称没有其他P0/P1问题。
