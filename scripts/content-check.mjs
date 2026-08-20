import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(), read=p=>fs.readFileSync(path.join(root,p),'utf8');
const router=read('src/router/Router.tsx'),html=read('index.html'),robots=read('public/robots.txt');
const routes=['/','/trips','/how-it-works','/rewards','/safety','/about','/app','/app-demo','/app-demo/login','/app-demo/trips','/app-demo/booking/:slug','/app-demo/passengers','/app-demo/checkout','/app-demo/payment','/app-demo/payment-result','/app-demo/orders','/app-demo/boarding-pass/:id','/app-demo/rewards','/app-demo/referral','/app-demo/profile'];
const missing=routes.filter(r=>r!=='/'&&!router.includes(`path="${r}"`));if(missing.length)throw new Error(`Missing routes: ${missing.join(', ')}`);
if(!html.includes('noindex,nofollow')||!robots.includes('Disallow: /'))throw new Error('Noindex protection missing');
const files=['src/website/Website.tsx','src/app/AppDemo.tsx','src/shared/data/trips.ts'];for(const f of files){const s=read(f);if(/href=["']\s*["']/.test(s))throw new Error(`Empty link in ${f}`);if(/(sk_live_|pk_live_|AKIA[0-9A-Z]{16})/.test(s))throw new Error(`Potential secret in ${f}`)}
console.log(`PASS: ${routes.length} routes declared, noindex enabled, no empty links or common production-key patterns.`);
