# 外部服务决策记录（待产品批准）

本文不选择供应商，仅整理候选与决策依据。正式决定前需确认数据驻留、费用上限、公司合同／DPA、支持等级、备份导出、锁定风险及日本地区可用性。

## Supabase

架构匹配度较高：Auth 与 Postgres 结合，可用 Row Level Security 约束行级访问；Realtime 私有频道也可通过 RLS 授权。对于 Trip → Departure → Order → Vehicle Group 这类关系数据，以及“一车一群”和订单所有权，关系模型迁移成本可能最低。这是基于官方能力的架构推断，不是最终推荐。[Supabase Auth](https://supabase.com/docs/guides/auth)、[Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)

批准前必须验证：日本区域、备份／PITR、连接池、RLS 负面测试、服务角色密钥隔离、Realtime 私有频道规模、Auth 邮件送达和数据导出。

## Firebase

Firebase Authentication、Firestore Security Rules 与 App Check 的客户端生态成熟。官方说明移动／Web 客户端依赖 Authentication 与 Security Rules，而服务端 SDK 会绕过 Firestore Rules、改由 IAM 控制，因此两条权限路径都必须测试。[Secure data in Cloud Firestore](https://firebase.google.com/docs/firestore/security/overview)、[Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)

关键风险是字段级隐私：Firestore 读取以文档为单位，Rules 不能隐藏同一文档中的部分字段，儿童／轮椅等隐私必须拆到独立私有文档或子集合。[Control access to specific fields](https://firebase.google.com/docs/firestore/security/rules-fields) 关系型订单／库存事务的建模与迁移也需专项原型验证。

## Cloudflare

Workers 可作为 provider-neutral API 层；D1 提供版本化 SQL migration，Durable Objects 可承载按 Vehicle Group 分片的 WebSocket 协调。官方建议 WebSocket Hibernation 以降低空闲成本，重要状态必须持久化。[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)、[Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

Cloudflare 更偏组合式方案：认证、邮件、支付和部分数据库能力仍需自行实现或接第三方，工程与运维责任更高。Secrets 必须使用加密 secrets／bindings，不能放在普通 vars 或提交到 Git。[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 建议决策方法

先用同一套 provider ports 做三个不含真实数据的短期 spike，评分维度为：权限模型、关系事务、Realtime 私有群、数据导出、恢复目标、东京延迟、预计费用、团队熟悉度和退出成本。若产品优先低迁移成本与关系完整性，可优先验证 Supabase；若优先移动生态且接受私有文档拆分，可验证 Firebase；若需要边缘 API 与高度定制 realtime，可验证 Cloudflare 组合。最终选择必须由产品、运营、安全和费用负责人共同批准。

## 最小批准清单

- 批准的主平台与区域。
- 账户、支付、地图、Realtime、通知是否允许分别选供应商。
- 月度费用上限与告警阈值。
- 数据保留、删除、备份、恢复和驻留要求。
- 法律文本、DPA 与隐私负责人批准。
- 各环境管理员、密钥保管人与轮换责任人。
