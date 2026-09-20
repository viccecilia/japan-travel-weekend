globalThis.discoverVisualCheck = async page => {
 const evidence=[];
 for(const width of [390,430]){
  await page.setViewportSize({width,height:844});
  await page.goto('http://127.0.0.1:5188/app');
  await page.locator('.discover-film video').waitFor();
  await page.waitForFunction(()=>{const video=globalThis.document.querySelector('video');return video&&video.readyState>=2&&!video.paused});
  for(const kind of ['soul','route']){
   if(kind==='route')await page.locator('.discover-next').click();
   await page.waitForTimeout(4500);
   const state=await page.evaluate(()=>{
    const selectors=['.discover-title','.discover-title h1','.discover-title p','.app-top','.app-brand','.language-select','.bottom-nav','.discover-dots','.discover-story-kind','.discover-story-tag','.discover-cta'];
    const opacity=Object.fromEntries(selectors.flatMap(s=>{const el=globalThis.document.querySelector(s);return el?[[s,globalThis.getComputedStyle(el).opacity]]:[]}));
    const arrows=['.discover-previous','.discover-next','.discover-up'].map(s=>{const el=globalThis.document.querySelector(s);const css=globalThis.getComputedStyle(el);const box=el.getBoundingClientRect();return {selector:s,opacity:css.opacity,background:css.backgroundColor,color:css.color,width:box.width,height:box.height}});
    const v=globalThis.document.querySelector('video');
    return {opacity,arrows,scroll:globalThis.document.documentElement.scrollWidth,viewport:globalThis.innerWidth,video:{playing:!v.paused,time:v.currentTime,muted:v.muted,loop:v.loop,inline:v.playsInline},title:globalThis.document.querySelector('.discover-title').textContent};
   });
   if(Object.values(state.opacity).some(v=>v!=='1'))throw Error('Idle opacity regression '+JSON.stringify(state));
   if(state.scroll>width||!state.video.playing)throw Error('Overflow or video failed');
   if(state.arrows.some(a=>a.opacity!=='1'||!['rgba(45, 28, 17, 0.34)','rgba(45, 28, 17, 0.46)'].includes(a.background)))throw Error('Arrow material incorrect '+JSON.stringify(state.arrows));
   if(/[¥￥]/.test(state.title))throw Error('Hero contains price');
   if(kind==='soul'&&await page.locator('.discover-cta').count())throw Error('Soul CTA');
   await page.screenshot({path:'output/playwright/discover-final-'+kind+'-'+width+'.png'});
   evidence.push({width,kind,...state});
  }
  const target=await page.locator('.discover-cta').getAttribute('href');
  if(!target.startsWith('/app/trips/'))throw Error('Invalid CTA');
  await page.locator('.discover-cta').click();await page.waitForURL('**'+target);
  await page.goBack();await page.locator('.discover-title').waitFor();
  const before=await page.locator('.discover-dots [aria-current=true]').getAttribute('aria-label');
  await page.mouse.move(width-60,470);await page.mouse.down();await page.mouse.move(60,470,{steps:8});await page.mouse.up();
  const after=await page.locator('.discover-dots [aria-current=true]').getAttribute('aria-label');
  if(before===after)throw Error('Horizontal swipe failed');
  await page.mouse.move(60,470);await page.mouse.down();await page.mouse.move(width-60,470,{steps:8});await page.mouse.up();
  if(await page.locator('.discover-dots [aria-current=true]').getAttribute('aria-label')!==before)throw Error('Reverse swipe failed');
  await page.mouse.move(width/2,470);await page.mouse.down();await page.mouse.move(width/2,270,{steps:8});await page.mouse.up();await page.waitForURL('**/app/trips');
  await page.goto('http://127.0.0.1:5188/app');await page.locator('.discover-up').click();await page.waitForURL('**/app/trips');
  evidence.push({width,cta:target,horizontalSwipe:true,upSwipe:true,upClick:true});
 }
 return evidence;
}
