globalThis.passengerFrameCheck = async page => {
 const evidence=[];
 for(const width of [390,430]){
  await page.setViewportSize({width,height:844});
  for(const [name,url,selector] of [
   ['discover','/app','.discover-hero'],
   ['trips','/app/trips','.discover-route-grid'],
   ['orders','/app/orders','.passenger-order-link'],
   ['messages','/app/messages','.passenger-chat-composer'],
   ['profile','/app/profile','.passenger-profile-sections'],
  ]){
   await page.goto('http://127.0.0.1:5188'+url);
   await page.locator(selector).first().waitFor();
   if(name==='discover')await page.waitForFunction(()=>{const v=globalThis.document.querySelector('video');return v&&v.readyState>=2});
   if(name==='profile')await page.getByRole('button',{name:'保存个人资料'}).waitFor({state:'visible'});
   await page.waitForTimeout(600);
   const size=await page.evaluate(()=>({viewport:globalThis.innerWidth,scroll:globalThis.document.documentElement.scrollWidth}));
   if(size.scroll>size.viewport)throw Error(name+' overflow '+JSON.stringify(size));
   const nav=await page.locator('.bottom-nav [aria-current=page]').count();
   if(nav!==1)throw Error(name+' navigation not unique');
   if(name==='trips'){
    if(await page.locator('.route-catalog>:first-child a').getAttribute('href')!=='/app/vip-charter')throw Error('VIP position');
    if(await page.locator('.route-catalog>:last-child a').getAttribute('href')!=='/app/private-groups')throw Error('Groups position');
   }
   await page.screenshot({path:'output/playwright/frame-'+name+'-'+width+'.png'});
   if(name==='profile')await page.screenshot({path:'output/playwright/frame-profile-full-'+width+'.png',fullPage:true});
   evidence.push({name,width,...size,result:'passed'});
  }
 }
 await page.goto('http://127.0.0.1:5188/app/orders?status=paid');
 await page.locator('.passenger-order-link').first().waitFor();
 const target=await page.locator('.passenger-order-link').first().getAttribute('href');
 await page.locator('.passenger-order-link').first().click();
 await page.getByRole('region',{name:'不可变订单账单'}).waitFor();
 if(!page.url().endsWith(target))throw Error('wrong order');
 await page.screenshot({path:'output/playwright/frame-order-detail-430.png',fullPage:true});
 const back=page.locator('a[href="/app/orders?status=paid"]');
 if(await back.count()!==1)throw Error('order return filter lost');
 await back.click();await page.locator('.passenger-order-link').first().waitFor();
 await page.reload();await page.locator('.passenger-order-link').first().waitFor();
 evidence.push({name:'order detail / return / refresh filter',target,result:'passed'});
 await page.goto('http://127.0.0.1:5188/app');
 await page.locator('.discover-next').click();
 await page.locator('.discover-cta').waitFor();
 const metrics=await page.locator('.discover-next').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
 if(metrics.height>52||metrics.width>30)throw Error('edge pills not compact');
 await page.waitForTimeout(3800);
 if(await page.locator('.discover-title').evaluate(el=>Number(globalThis.getComputedStyle(el).opacity))!==1)throw Error('title must remain visible');
 await page.mouse.click(210,290);
 await page.waitForTimeout(100);
 if(await page.locator('.discover-title').evaluate(el=>Number(globalThis.getComputedStyle(el).opacity))<.9)throw Error('title not restored');
 await page.mouse.move(210,430);await page.mouse.down();await page.mouse.move(210,250,{steps:5});await page.mouse.up();
 await page.waitForURL('**/app/trips');
 evidence.push({name:'Discover compact pills/persistent title/up swipe',...metrics,result:'passed'});
 return evidence;
}
