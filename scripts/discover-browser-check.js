async page => {
  const evidence=[];
  const check=(label,condition,details={})=>{if(!condition)throw new Error(label+': '+JSON.stringify(details));evidence.push({label,result:'passed',...details})};
  for(const width of [390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto('http://127.0.0.1:5188/app');
    await page.waitForFunction(()=>document.querySelectorAll('.discover-dots button').length===3);
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.currentTime>.1&&!v.paused});
    let data=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,videoWidth:document.querySelector('video').videoWidth,source:document.querySelector('video').currentSrc}));
    check(width+' video/no overflow',data.width===data.scroll&&data.videoWidth===720,data);
    check(width+' Soul has no commercial CTA',await page.locator('.discover-cta').count()===0);
    await page.mouse.click(width/2,280);
    await page.waitForTimeout(350);
    check(width+' interaction restores controls',await page.locator('.app-top').evaluate(el=>Number(getComputedStyle(el).opacity))===1);
    await page.screenshot({path:'output/playwright/discover-'+width+'.png'});
    await page.waitForTimeout(3900);
    data=await page.evaluate(()=>({title:Number(getComputedStyle(document.querySelector('.discover-title')).opacity),ui:Number(getComputedStyle(document.querySelector('.app-top')).opacity)}));
    check(width+' idle title/UI fade',data.title===0&&data.ui<.4,data);
    await page.mouse.click(width/2,280);
    data=await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.discover-title')).opacity));
    check(width+' touch restores title',data===1);
    await page.getByRole('button',{name:'下一屏'}).click();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    check(width+' correct route CTA',await page.locator('.discover-cta').getAttribute('href')==='/app/trips/amanohashidate-ine');
    await page.mouse.click(width/2,280);
    await page.screenshot({path:'output/playwright/discover-route-'+width+'.png'});
    await page.locator('.discover-cta').click();
    await page.waitForURL('**/app/trips/amanohashidate-ine');
    check(width+' actual route navigation',page.url().endsWith('/app/trips/amanohashidate-ine'));
    await page.goBack();
    await page.waitForSelector('.discover-hero');
    await page.getByRole('button',{name:'1',exact:true}).click();
    // Real pointer gesture through the same browser event path (not state injection).
    await page.mouse.move(width-80,420);await page.mouse.down();await page.mouse.move(75,420,{steps:10});await page.mouse.up();
    check(width+' horizontal gesture',await page.locator('.discover-cta').getAttribute('href')==='/app/trips/amanohashidate-ine');
    await page.getByRole('button',{name:'下一屏'}).click();
    check(width+' third real route',await page.locator('.discover-cta').getAttribute('href')==='/app/trips/miyama-katsuoji-arashiyama');
    await page.mouse.move(width/2,500);await page.mouse.down();await page.mouse.move(width/2,300,{steps:10});await page.mouse.up();
    await page.waitForURL('**/app/trips');
    await page.waitForSelector('.discover-route-grid');
    data=await page.evaluate(()=>({columns:getComputedStyle(document.querySelector('.discover-route-grid')).gridTemplateColumns.split(' ').length,count:document.querySelectorAll('.discover-route-card').length,width:innerWidth,scroll:document.documentElement.scrollWidth,nested:document.querySelectorAll('.discover-route-card a,.discover-route-card button').length}));
    check(width+' up gesture and dynamic two-column catalogue',data.columns===2&&data.count>=3&&data.scroll<=data.width&&data.nested===0,data);
    await page.screenshot({path:'output/playwright/discover-trips-'+width+'.png',fullPage:true});
    await page.goto('http://127.0.0.1:5188/app');
    await page.locator('.discover-up').click();await page.waitForURL('**/app/trips');
    check(width+' chevron capsule opens catalogue',true);
  }
  await page.goto('http://127.0.0.1:5188/app');
  await page.locator('video').dispatchEvent('error');
  check('poster fallback after media error',await page.locator('.discover-film img').isVisible()&&await page.locator('video').count()===0);
  await page.screenshot({path:'output/playwright/discover-poster-fallback-430.png'});
  for(const [label,href] of [['精选线路','/app/trips'],['订单','/app/orders'],['消息','/app/notifications'],['我的','/app/profile']]){
    await page.goto('http://127.0.0.1:5188/app');
    await page.locator('.bottom-nav').getByRole('link',{name:label,exact:true}).click();
    await page.waitForTimeout(250);
    check('bottom navigation '+label,page.url().includes(href)||page.url().includes(encodeURIComponent(href)),{url:page.url()});
  }
  await page.goto('http://127.0.0.1:5188/app');
  return evidence;
}
