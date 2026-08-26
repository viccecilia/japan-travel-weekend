import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {applyProbeResult,initialMonitorState} from '../.server-dist/server/monitoring.js';
import {readEmailAlertConfig,sendEmailAlert} from '../.server-dist/server/emailAlerts.js';

const baseUrl=process.env.JTW_TEST_API_URL??'https://api-test.japan-travel.info';const parsed=new URL(baseUrl);
if(parsed.protocol!=='https:'||parsed.hostname!=='api-test.japan-travel.info')throw new Error('monitor is restricted to the approved HTTPS test API');
const statePath=resolve(process.env.JTW_MONITOR_STATE_FILE??'.runtime/test-api-monitor.json');
async function load(){try{const value=JSON.parse(await readFile(statePath,'utf8'));return {consecutiveFailures:Number(value.consecutiveFailures)||0,incidentOpen:value.incidentOpen===true}}catch{return initialMonitorState}}
async function save(value){await mkdir(dirname(statePath),{recursive:true});const temporary=`${statePath}.tmp`;await writeFile(temporary,JSON.stringify(value),'utf8');await rename(temporary,statePath)}
async function probe(){const synthetic=process.env.JTW_MONITOR_SYNTHETIC_RESULT;if(synthetic&&process.env.JTW_MONITOR_ALLOW_SYNTHETIC!=='true')throw new Error('synthetic monitoring result is disabled');if(synthetic)return synthetic==='pass';const [health,ready]=await Promise.all(['/health','/ready'].map(async path=>{const response=await fetch(new URL(path,parsed),{signal:AbortSignal.timeout(10_000)});const body=await response.json();return response.status===200&&body.ok===true}));return health&&ready}
const previous=await load();let healthy;try{healthy=await probe()}catch{healthy=false}const transition=applyProbeResult(previous,healthy,3);
let delivery='not_required';
if(transition.event!=='none'){
  try{const config=readEmailAlertConfig(process.env);if(!config)delivery='not_configured';else{await sendEmailAlert(config,{event:transition.event,endpoint:parsed.hostname,consecutiveFailures:transition.state.consecutiveFailures});delivery='delivered'}}
  catch{delivery='failed'}
}
await save(transition.event!=='none'&&delivery!=='delivered'?previous:transition.state);
const result={healthy,event:transition.event,consecutiveFailures:transition.state.consecutiveFailures,incidentOpen:transition.state.incidentOpen,endpoint:parsed.hostname,delivery};
console.log(JSON.stringify(result));if(!healthy)process.exitCode=1;
