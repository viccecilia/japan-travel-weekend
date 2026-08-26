# 测试 API 监控状态机演练（2026-08-26）

监控脚本同时检查 `/health` 和 dependency-aware `/ready`，只允许访问批准的 HTTPS 测试 API。状态以原子临时文件替换方式持久化；连续三次失败才打开事件，持续失败不重复告警，首次恢复产生 recovery 并清零。输出不包含请求头、会话、乘客、支付载荷或秘密。

合成演练结果依次为：失败 1（none）、失败 2（none）、失败 3（alert）、失败 4（none）、恢复（recovery）。随后真实探测返回 healthy。单元测试覆盖阈值、去重和恢复，临时状态文件已删除。

用户已选择邮件作为第一阶段告警渠道。SMTP 适配器、中文异常／恢复邮件、凭据缺失保护和失败后重试语义已经实现；凭据只允许保存在 VPS 未跟踪环境文件中。邮件账户和 SMTP 已完成配置，真实异常与恢复演练均返回 `delivered`。

## 邮件通道实测补充

2026-08-26 已在 Sakura 新建专用测试发件账户 `alerts@japan-travel.info`，容量 1GB，启用病毒检查和简易垃圾邮件过滤；没有查看或修改其他邮箱账户。随机强密码只保存在本机未跟踪环境文件和 VPS 权限为 `600` 的密钥文件中。

SMTP 使用 Sakura 初始域名、587 端口和 STARTTLS。VPS 受控演练依次返回失败 1、失败 2、失败 3 `alert/delivered`、恢复 `recovery/delivered`；临时演练状态随后删除。收件人已在 Webmail 打开并确认异常告警与恢复邮件，发件人、收件人、中文主题、服务名、连续失败次数和时间均正确。外部送达、人工确认与自动恢复关闭门禁判定通过。

真实健康探测恢复后返回 `healthy: true`，测试 API `/ready` 为 200，服务保持 active。用户 crontab 已安装每 5 分钟一次的监控执行项，使用 `flock` 防止重叠，并将无敏感信息的结果写入 `.runtime/test-api-monitor.log`。

## 隔离备份恢复前置检查

初次检查时 Supabase Free 组织已有 2 个活跃免费项目。经用户明确确认，未使用的 `viccecilia's Project` 已暂停但未删除，释放了一个免费项目名额；当前 Japan Travel Weekend 测试项目未改变。

仓库新增恢复目标预检：只接受 URL 与项目 ref 完全一致、且显式标记为可丢弃的隔离项目，并拒绝当前测试项目和已暂停旧项目。20 个迁移文件还会校验为非空且编号连续 `0001-0020`。

取得动作时确认后，已创建东京 Free 隔离项目并完成 001–020、三组最终状态结构检查及库存／支付补偿／登车凭证回滚回归。五个虚构账户覆盖两名乘客、司机、导游和运营；项目保持 Healthy，无真实资料、生产支付或套餐升级。详细证据见 `supabase-restore-drill-2026-08-26.md`，`backup_restore_drill` 已通过。该门禁证明 clean-room migration recovery，不代替未来 Supabase PITR／真实备份恢复演练。
