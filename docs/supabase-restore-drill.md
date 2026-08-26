# Supabase 隔离恢复演练

本演练只允许在名称明确、可随时清空的隔离 Supabase 测试项目执行。不得连接当前 Japan Travel Weekend 测试项目或已暂停旧项目，不得导入真实乘客、司机、员工或支付资料。

## 阶段门

1. 用户在实际创建动作前明确确认创建隔离恢复项目；不升级套餐、不绑定新的付款方式。
2. 项目凭据只写入 Git 忽略的本机环境文件，不出现在聊天、日志、截图或提交中。
3. 设置 `RESTORE_SUPABASE_PROJECT_REF`、`RESTORE_SUPABASE_URL` 与 `RESTORE_TARGET_IS_DISPOSABLE=yes-delete-test-data`，运行 `npm run check:restore-target`。
4. 运行 `npm run manifest:restore`，把输出作为本次演练的文件名、顺序、字节数和 SHA-256 基线；输出不含密钥。
5. 依次且仅一次执行迁移 `0001-0020`，不得选择性跳过或重复粘贴。
6. 先运行三个只读结构验收 SQL；全部通过后，再创建虚构 passenger、driver、guide、operations 账户。
7. 运行三个事务内回滚的业务回归 SQL，确认库存、支付补偿和登车凭证边界。
8. 记录项目 ref、迁移版本、验收结果和清理结果，不记录密码、token、用户资料或支付载荷。

任何一步目标校验、迁移、结构检查或角色权限检查失败时立即停止。先诊断失败文件和数据库状态，不在同一项目上反复整套重跑，也不转向现有测试项目规避问题。
