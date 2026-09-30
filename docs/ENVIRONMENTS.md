# 环境边界

| 环境 | 职责 | 数据与集成 | 发布行为 |
|---|---|---|---|
| Local | 开发、静态检查和受控测试 | 本地配置、测试数据与测试支付；不保存正式业务数据 | 从工作树运行；不能替代部署验证 |
| Test | 集成、人工 QA、演练和候选 artifact 验证 | 独立 database、Storage、Stripe test、测试域名/凭证/数据 | 只部署版本化 artifact；记录版本与 migration |
| Production | 面向真实业务的受控运行 | 独立 database、Storage、Stripe live、正式域名/凭证/数据 | 只 Promote 已经 QA 的同一 artifact，并须明确授权 |

## Single Codebase / Multiple Environments

正式业务代码只有一套：`GitHub source → commit → versioned artifact → Test → human QA → same commit/artifact → Production`。

Test 不是另一套测试代码。允许不同的仅为 database、Storage、Stripe mode、域名、凭证、环境变量及环境数据。不得长期保留 server-only source fix、test-only business implementation 或 production-only implementation。

Test Storage 和 Production Storage 必须隔离。任何环境文档只写变量名称或职责，绝不写入其值。
