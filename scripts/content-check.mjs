import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(), read=p=>fs.readFileSync(path.join(root,p),'utf8');
const router=read('src/router/Router.tsx'),html=read('index.html'),robots=read('public/robots.txt');
const routes=['/','/trips','/private-groups','/how-it-works','/rewards','/safety','/about','/app-info','/app','/app/login','/app/trips','/app/booking/:slug','/app/passengers','/app/checkout','/app/payment','/app/payment-result','/app/orders','/app/my-trip','/app/my-trip/room','/app/private-groups','/app/boarding-pass/:id','/app/rewards','/app/referral','/app/profile'];
const missing=routes.filter(r=>r!=='/'&&!router.includes(`path="${r}"`));if(missing.length)throw new Error(`Missing routes: ${missing.join(', ')}`);
if(!html.includes('lang="zh-CN"'))throw new Error('HTML lang 必须固定为 zh-CN');
if(!html.includes('noindex,nofollow')||!robots.includes('Disallow: /'))throw new Error('Noindex protection missing');
const files=['src/website/Website.tsx','src/app/App.tsx','src/app/TripRoom.tsx','src/shared/data/trips.ts'];for(const f of files){const s=read(f);if(/href=["']\s*["']/.test(s))throw new Error(`Empty link in ${f}`);if(/(sk_live_|pk_live_|AKIA[0-9A-Z]{16})/.test(s))throw new Error(`Potential secret in ${f}`)}
const ui=files.map(read).join('\n');const forbidden=['Page not found','Return home','Open App Demo','View details','Trip not found','Choose a Departure','Reset Demo Data','Passenger view','Staff demo','No locally created orders'];for(const phrase of forbidden){if(ui.includes(phrase))throw new Error(`发现遗留用户可见英文：${phrase}`)}
if(!ui.includes('简体中文')||!ui.includes('后续开放'))throw new Error('语言选择器缺少中文或后续开放状态');
if(/localStorage\.(setItem|getItem).*?(order|passenger|location|message)/i.test(ui))throw new Error('敏感业务数据不得写入 localStorage');
console.log(`PASS: ${routes.length} 条路线、zh-CN、noindex、语言入口、中文关键文案、空链接、敏感存储和常见密钥模式检查通过。`);
