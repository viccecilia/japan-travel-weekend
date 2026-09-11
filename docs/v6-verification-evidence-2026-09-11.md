# V6 可核验证据（2026-09-11 JST）

## 版本与部署边界

- GitHub 仓库：`https://github.com/viccecilia/japan-travel-weekend`
- 用户指定提交：`0b6d997076a93b285f45ce0821c9e20379165b83`，已由普通 push 推送。
- 本轮路线、缓存修复提交：`14f857bd64cbcd557ae0ef360a565572523e3879`，已由普通 push 推送。
- 当前服务器已核实：前端软链接 `/var/www/japan-travel-weekend-test` 指向 `jtw-v6-3a22a33`；API 服务使用 `14f857b` 构建并处于 active。Nginx 已安装无缓存应用壳规则及 `/api/ -> 127.0.0.1:18774/` 代理，`nginx -t` 成功。

## 健康检查与路由证据

| 检查 | 状态码 | Content-Type | 脱敏响应正文 |
|---|---:|---|---|
| 服务器内部 `http://127.0.0.1:18774/health` | 200 | `application/json; charset=utf-8` | `{"ok":true,"mode":"test"}` |
| 服务器内部 `http://127.0.0.1:18774/ready` | 200 | `application/json; charset=utf-8` | `{"ok":true,"mode":"test","checks":{"database":true,"stripeModeSafe":true,"webhookSecret":true,"notificationReceiptSecret":true}}` |
| 公网 `/api/health` | 200 | `application/json; charset=utf-8` | `{"ok":true,"mode":"test"}` |
| 公网 `/api/ready` | 200 | `application/json; charset=utf-8` | `{"ok":true,"mode":"test","checks":{"database":true,"stripeModeSafe":true,"webhookSecret":true,"notificationReceiptSecret":true}}` |

公网 `/`、`/app`、路线详情、`/staff`、`/app/operations` 均由 Nginx SPA fallback 返回 200 `text/html`。真实 Chromium 打开 `/app` 已渲染游客首页，并非服务器端 404。排查中发现首次安装的 Nginx 片段缺少公网 `/api/` 代理，已在 `65f9fba` 修复并由 `f74b615` 增加防回归测试；修复后公网 health/ready 均为 200 JSON。旧手机缓存问题由 `14f857b` 的应用壳重新验证规则处理，带哈希静态资源继续长期缓存。

## V6 十组任务验收矩阵

“代码完成”只表示实现和自动化检查存在；“隔离通过”表示在可丢弃 Supabase 或本机测试环境执行成功；“生产验证”不包含真实 Stripe 交易、退款、发券、通知或打款。

| 组 | 能力 | 代码完成 | 隔离测试 | 生产验证 | 可复核证据 / 限制 |
|---:|---|:---:|:---:|:---:|---|
| 01 | 支付与结账恢复 | ✓ | ✓ | — | checkout attempt、quote、幂等恢复；AT01–AT06 对应测试。未执行真实付款。 |
| 02 | 退款与异常收敛 | ✓ | ✓ | — | refund updated/failed、乱序与重复回调、人工凭证；AT07–AT10。未执行真实退款。 |
| 03 | 权威报价、费用明细、订单快照 | ✓ | ✓ | — | 单席优惠、附加项、零元订单与不可变快照；AT11–AT16。 |
| 04 | 司导导航、定位与履约 | ✓ | ✓ | — | 导航入口、定位续期、停用后终止；AT20/AT27。未做真机后台 GPS。 |
| 05 | 产品上下架与路线内容 | ✓ | ✓ | — | `productLifecycleMigration.test.ts`、`productRevisionPublicationMigration.test.ts`、`routeMediaStorage.test.ts`；运营修改以新 revision 发布，订单快照不变。真实运营身份浏览器上传尚未验收。 |
| 06 | 已有班次改期 | ✓ | ✓ | — | `departureRescheduleMigration.test.ts` 验证版本锁、容量下限、影响预览、不修改订单快照；游客班次选择自动测试通过。真实身份浏览器联动尚未验收。 |
| 07 | 工作台下钻 | ✓ | ✓ | — | `operationsDashboardDrilldown.test.ts` 验证订单、草稿、资源、派车、通知、推广与佣金真实目标链接。登录后的逐按钮人工验收尚未完成。 |
| 08 | 新人首单 10% 佣金与每周提现 | ✓ | ✓ | — | `ambassadorCashCommissionMigration.test.ts` 验证首笔完成订单、一次结算、10%、每周唯一提现、余额锁定、重复请求幂等和退款冲正。未真实打款。 |
| 09 | 司导、游客、运营资料维护 | ✓ | ✓ | — | 资料、请假、车辆和账号状态 RPC/权限回归；未以三名真实账号做浏览器验收。 |
| 10 | 隔离升级与三端门禁 | 部分 | 部分 | — | 118 个迁移连续；隔离项目迁移 0118 成功且 DB lint 零错误；140 文件、596 测试通过。Stripe 回调、真机 GPS、真实通知和三身份浏览器全链路仍未验证。 |

## 本轮实际命令结果

- 重点测试：11 个测试文件、69 项测试通过，涵盖产品生命周期、改期、工作台下钻、佣金提现、九路线文案与红叶照片映射。
- 全量测试：140 个测试文件、596 项测试通过。
- 构建：`npm run build` 通过；PWA 生成 12 个预缓存条目。`npm run build:server` 通过。
- 数据库：隔离项目应用 `202609110118_autumn_route_media.sql` 成功；随后 schema lint 返回 0 error。
- 路线：任何已发布记录即使简介字段为空，九条中文卡片仍使用同路线的审核基线文案，不再显示空白，也不会借用其他路线内容。
- 红叶照片 SHA-256：贵船 `BF4FEF...AA61`；三千院 `87E77F...2B28`；渡月桥 `D9E8CD...61D9`。数据库通过新 published revision 引用这三张图片，历史 revision 与订单快照不变。
- 公网浏览器：红叶路线正文、三处景点标题及简介均可见；三千院图片 naturalWidth=1536、贵船=4128、渡月桥=5184。详情页展示顺序与照片映射由 `3a22a33` 修正并部署。
