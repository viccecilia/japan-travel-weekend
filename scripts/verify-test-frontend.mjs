const origin='https://weekend.japan-travel.info';
async function get(path){const response=await fetch(`${origin}${path}`,{redirect:'manual',signal:AbortSignal.timeout(10_000)});return {response,text:await response.text()}}
const checks=[];
const home=await get('/app');
checks.push(['app-status',home.response.status===200]);
checks.push(['html-noindex',/name="robots" content="noindex,nofollow"/.test(home.text)]);
checks.push(['header-noindex',home.response.headers.get('x-robots-tag')==='noindex, nofollow']);
checks.push(['nosniff',home.response.headers.get('x-content-type-options')==='nosniff']);
checks.push(['frame-deny',home.response.headers.get('x-frame-options')==='DENY']);
checks.push(['csp',home.response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")===true]);
const manifest=await get('/manifest.webmanifest');checks.push(['manifest',manifest.response.status===200&&manifest.text.includes('Japan Travel Weekend')]);
const api=await get('/api-test/health');checks.push(['api-proxy',api.response.status===200&&JSON.parse(api.text).ok===true]);
const failures=checks.filter(([,passed])=>!passed).map(([name])=>name);console.log(JSON.stringify({ok:failures.length===0,origin,checks:Object.fromEntries(checks),failures}));if(failures.length)process.exitCode=1;
