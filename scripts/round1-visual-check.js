globalThis.round1VisualCheck = async page => {
 const evidence=[];
 for(const width of [390,430]){
  await page.setViewportSize({width,height:844});
  for(const route of ['','trips','orders','profile']){
   await page.goto('http://127.0.0.1:5188/app'+(route?'/'+route:''));
   await page.locator('.bottom-nav').waitFor();
   if(route==='trips')await page.locator('.discover-route-card').first().waitFor();
   if(route==='profile')await page.getByRole('button',{name:'保存个人资料'}).waitFor();
   const state=await page.evaluate(()=>{
    const root=document.documentElement;
    const cards=[...document.querySelectorAll('.discover-route-card')].map(el=>{
     const box=el.getBoundingClientRect();
     return {top:box.top,height:box.height,right:box.right,clamps:[...el.querySelectorAll('h3,p,small')].map(text=>getComputedStyle(text).webkitLineClamp)};
    });
    const arrow=document.querySelector('.discover-up');
    return {width:innerWidth,scrollWidth:root.scrollWidth,cards,arrow:arrow?{animation:getComputedStyle(arrow.querySelector('svg')).animationDuration,path:arrow.querySelector('path').getAttribute('d')}:null};
   });
   if(state.scrollWidth>width)throw Error('Page overflow '+route);
   for(const card of state.cards){
    if(card.clamps.some(clamp=>clamp!=='2'))throw Error('Missing two-line clamp');
    const row=state.cards.filter(other=>Math.abs(other.top-card.top)<1);
    if(row.some(other=>Math.abs(other.height-card.height)>1))throw Error('Unequal row heights');
   }
   await page.screenshot({path:'output/playwright/round1-'+(route||'discover')+'-'+width+'.png'});
   evidence.push({route:route||'discover',...state});
  }
 }
 await page.locator('.app-top select').selectOption('es');
 for(const route of ['','trips']){
  await page.goto('http://127.0.0.1:5188/app'+(route?'/'+route:''));
  await page.locator('.bottom-nav').waitFor();
  const labels=await page.locator('.bottom-nav a').allTextContents();
  if(!labels.some(label=>label.includes('Descubrir'))||!labels.some(label=>label.includes('Rutas seleccionadas')))throw Error('Spanish navigation failed');
  await page.screenshot({path:'output/playwright/round1-spanish-'+(route||'discover')+'-430.png'});
  evidence.push({route:route||'discover',locale:'es',labels});
 }
 await page.locator('.app-top select').selectOption('zh-CN');
 await page.goto('http://127.0.0.1:5188/app');
 await page.locator('.discover-up').waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 const animation=await page.locator('.discover-up svg').evaluate(el=>getComputedStyle(el).animationName);
 if(animation!=='none')throw Error('Reduced motion not respected');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.discover-up').click();
 await page.waitForURL('**/app/trips');
 evidence.push({reducedMotion:true,downArrowLinksToTrips:true});
 return evidence;
}
