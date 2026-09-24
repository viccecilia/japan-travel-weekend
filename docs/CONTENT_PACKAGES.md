# 内容包与翻译包（运营使用说明）

本功能只创建或更新**草稿**。导入、翻译和复核均不会直接覆盖游客正在看的已发布路线。

## 新增路线

1. 后台「导出中文模板」，或使用 `examples/content-packages/route-zh-CN-template.json`。将模板和原始 Word/PDF 一并交给 ChatGPT；模板内的 `authoring_instructions` 已说明字段含义、稳定 ID 与 `needs_review` 规则。
2. 后台「产品与班次 → 产品管理」点击「导入中文内容包」。已有相同 `entity_id` 或 `slug` 时，会创建新草稿；没有时建立新路线草稿。
3. 在产品编辑器核对中文、图片和景点后保存草稿。
4. 打开「多语言」点击「导出翻译包」。
5. 将导出的 JSON 上传给 ChatGPT，并使用：**“请严格按照文件内置任务规则完成所有缺失语言，保持 JSON schema、ID、path 和 locked 字段不变，并返回可直接导入的完整 JSON。”**
6. 下载返回 JSON，在同一产品的「多语言」点击「导入译文」。
7. 使用右侧手机预览逐一检查 8 种语言；确认后才点击发布草稿。

## Discover / Soul Hero

在「素材与营销 → Discover 视频」点击「导出中文模板」或「导入中文内容包」，再选择该 Hero：上传或核对视频与封面，导出翻译包，导入译文，逐语言检查标题、强调词和副标题，最后保存内容。

Hero 的 `highlight_phrase` 必须是对应语言标题中的连续文字。强调色固定为 JTW 金色，后台不会开放颜色配置。

## 安全与状态

- 翻译包是非可信输入。系统核对 schema、实体 ID、路径、稳定景点 ID、源哈希、语言和数据类型。
- 翻译包不能写入价格、库存、班次、坐标、媒体、路线顺序或任何订单数据。
- 翻译导入默认状态为 `draft`；中文源变化后旧译文会显示为 `stale`，下次导出会优先带出需要重译的字段。
- `missing`、`draft`、`reviewed`、`published`、`stale` 为译文状态；本期仍由运营人工决定何时发布产品草稿。
- 示例仅用于格式演示，不包含真实客户、订单、密钥或生产价格。

## 路线详情 V2 与媒体

- V2 自动使用 `heroTitle`、`heroSubtitle`、`heroHighlightPhrase`、`departureCity`、稳定 `itinerary[].id`、`shortDescription`、`longDescription`、`included`、`excluded`、`preparation` 与六类政策字段生成游客页面。
- Hero 和景点均优先为横向 16:9 媒体框。图片是可靠回退；存在已验证的 MP4 时，游客点击播放后才加载播放器。竖版视频会在横框中裁切预览，不会撑高详情页。
- 媒体 URL、storage path、价格、库存、日期、坐标、路线顺序均为 locked 数据，翻译包不允许写入。

## 可用样例

1. `route-zh-CN-template.json`：自描述中文模板。
2. `route-zh-CN.json`：完成的路线内容包。
3. `discover-hero-zh-CN-template.json`：Discover Hero 中文模板。
4. `translation-package-untranslated.json`：未填写译文的翻译包。
5. `translation-package-partial.json`：部分译文回传示例。
6. `route-needs-review.json`：故意保留 `needs_review`、应被导入器拒绝的示例。
