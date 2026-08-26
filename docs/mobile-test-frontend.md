# 手机真实验收测试前端

真实手机的定位、相机、PWA 和 Stripe 测试返回需要可信 HTTPS 页面。项目统一预留 `https://weekend.japan-travel.info` 作为 **noindex 测试前端**；它不是正式产品域名，不得复用或覆盖现有 `japan-travel.info` 内容。

当前权威检查为：`weekend.japan-travel.info`、`app-test.japan-travel.info` 和 `weekend-test.japan-travel.info` 均为 NXDOMAIN；只有 `api-test.japan-travel.info` 指向测试 VPS。因此尚不能开始真实手机验收。

## 安全部署顺序

1. 用户在 Sakura DNS 为 `weekend.japan-travel.info` 新增 A 记录 `133.167.79.170`。只新增子域记录，不修改根域、`www`、MX 或现有 API 记录。
2. 等待权威 DNS 返回该地址后，构建只含公开测试配置的前端；`VITE_ENABLE_SEED_DATA=false`，API 使用同源 `/api-test` 代理。
3. 上传到独立目录 `/var/www/japan-travel-weekend-test`，不得写入现有网站目录。
4. 使用 `deploy/nginx/weekend-test.conf`，先 `nginx -t`，再申请该子域独立证书并 reload。
5. 运行 `npm run verify:test-frontend`；必须同时通过 noindex meta、`X-Robots-Tag`、CSP、nosniff、frame deny、PWA manifest 和测试 API 代理。
6. 用虚构账户执行 `final-user-acceptance.md`；不得输入真实乘客、真实银行卡或真实照片。

Nginx CSP 仅允许本项目、当前 Supabase 测试项目和 Stripe 官方必要来源；Stripe 所需 CSP 来源依据其官方 Integration security guide。正式托管、支付或地图来源变化时必须重新核验，不能直接照搬到生产。
