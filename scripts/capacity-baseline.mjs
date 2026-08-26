const baseUrl=process.env.JTW_TEST_API_URL??'https://api-test.japan-travel.info';
const parsed=new URL(baseUrl);
if(parsed.protocol!=='https:'||parsed.hostname!=='api-test.japan-travel.info')throw new Error('capacity baseline is restricted to the approved HTTPS test API');
const requests=Math.min(100,Math.max(1,Number(process.env.JTW_CAPACITY_REQUESTS??50)));
const concurrency=Math.min(10,Math.max(1,Number(process.env.JTW_CAPACITY_CONCURRENCY??5)));
const results=[];
for(let offset=0;offset<requests;offset+=concurrency){const batch=Array.from({length:Math.min(concurrency,requests-offset)},async()=>{const started=performance.now();const response=await fetch(new URL('/health',parsed),{signal:AbortSignal.timeout(5_000)});const body=await response.json();return {status:response.status,ok:body.ok===true,ms:Math.round(performance.now()-started)}});results.push(...await Promise.all(batch))}
const times=results.map(({ms})=>ms).sort((a,b)=>a-b);const failures=results.filter(({status,ok})=>status!==200||!ok);const percentile=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
const summary={ok:failures.length===0&&percentile(.95)<=2_000,endpoint:parsed.hostname,requests,concurrency,failures:failures.length,medianMs:percentile(.5),p95Ms:percentile(.95),maxMs:times.at(-1),hardCaps:{requests:100,concurrency:10}};
console.log(JSON.stringify(summary));if(!summary.ok)process.exitCode=1;
