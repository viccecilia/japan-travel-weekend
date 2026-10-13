import {createServer,type ServerResponse} from 'node:http';
import {CheckoutEndpoint} from './api/checkout.js';
import {ResumePaymentEndpoint,SupabaseResumeStore} from './api/resumePayment.js';
import {createSupabaseServerClient,SupabaseAccessTokenVerifier,SupabaseCheckoutAttemptGateway,SupabaseManualPaymentGateway,SupabaseOrderInventoryGateway,SupabasePaymentEventStore,SupabasePaymentIntentRecorder,SupabaseServerPricingGateway} from './supabase.js';
import {StripeCardPaymentSessionGateway,StripeTestAdapter} from './stripe.js';
import {allowedCorsOrigin,parseAllowedOrigins} from './cors.js';
import {SupabaseBoardingGateway} from './boarding.js';
import {checkApiReadiness} from './readiness.js';
import {GoogleCloudTranslationProvider,isTranslationTarget,SupabaseMessageTranslationGateway,translateVehicleMessage} from './translation.js';
import {apiSecurityHeaders,FixedWindowRateLimiter,parseTrustedProxyAddresses,readRequestBody,RequestBodyTooLargeError,requestRateKey,sendRateLimit} from './security.js';
import {SignedNotificationReceiptHandler,SupabaseNotificationReceiptStore} from './notifications.js';
import {RefundEndpoint,SupabaseRefundGateway} from './refunds.js';
import {DeterministicSocialMetricsProvider,TravelMomentCheckEndpoint,TravelMomentMetricsRefreshJob} from './travelMoments.js';
import {resolvePaymentConfig} from './paymentConfig.js';
import {createPublicSharePage,SupabasePublicShareCatalog} from './sharePage.js';

const port=Number(process.env.PORT||8787);const allowedOrigins=parseAllowedOrigins(process.env.ALLOWED_ORIGIN||'');
const supabase=createSupabaseServerClient({url:process.env.SUPABASE_URL||'',serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY||''});
const paymentConfig=resolvePaymentConfig({NODE_ENV:process.env.NODE_ENV,JTW_STRIPE_MODE:process.env.JTW_STRIPE_MODE,JTW_PRODUCTION_PAYMENT_AUTHORIZED:process.env.JTW_PRODUCTION_PAYMENT_AUTHORIZED,STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET});
const paymentMode=paymentConfig.effectiveMode;
const stripe=new StripeTestAdapter({secretKey:paymentConfig.usable?process.env.STRIPE_SECRET_KEY||'':'',webhookSecret:paymentConfig.usable?process.env.STRIPE_WEBHOOK_SECRET||'':'',mode:paymentMode});
const checkout=new CheckoutEndpoint(new SupabaseAccessTokenVerifier(supabase),new SupabaseOrderInventoryGateway(supabase),new StripeCardPaymentSessionGateway(stripe,new SupabasePaymentIntentRecorder(supabase)),new SupabaseManualPaymentGateway(supabase),new SupabaseServerPricingGateway(supabase),undefined,new SupabaseCheckoutAttemptGateway(supabase));
const events=new SupabasePaymentEventStore(supabase);
const resumePayment=new ResumePaymentEndpoint(new SupabaseAccessTokenVerifier(supabase),new SupabaseResumeStore(supabase),stripe);
const boarding=new SupabaseBoardingGateway(supabase);const sessions=new SupabaseAccessTokenVerifier(supabase);
const translations=new SupabaseMessageTranslationGateway(supabase);const translationProvider=new GoogleCloudTranslationProvider(process.env.GOOGLE_TRANSLATION_API_KEY,process.env.JTW_TRANSLATION_ENABLED==='true');
const notificationReceipts=new SignedNotificationReceiptHandler(process.env.NOTIFICATION_WEBHOOK_SECRET||'',new SupabaseNotificationReceiptStore(supabase));
const refunds=new RefundEndpoint(new SupabaseRefundGateway(supabase),stripe);
const socialMetricsProvider=new DeterministicSocialMetricsProvider(process.env.NODE_ENV==='test'||process.env.JTW_RUNTIME_MODE==='test');
const travelMoments=new TravelMomentCheckEndpoint(socialMetricsProvider,supabase);
const travelMomentMetrics=new TravelMomentMetricsRefreshJob(socialMetricsProvider,supabase);
const sourceRate=new FixedWindowRateLimiter(300,60_000);const checkoutRate=new FixedWindowRateLimiter(30,60_000);const actionRate=new FixedWindowRateLimiter(60,60_000);
const trustedProxies=parseTrustedProxyAddresses(process.env.JTW_TRUSTED_PROXY_ADDRESSES||'127.0.0.1,::1');
const publicSharePage=createPublicSharePage({catalog:new SupabasePublicShareCatalog(supabase),origin:process.env.JTW_PUBLIC_ORIGIN||'https://weekend.japan-travel.info',shellPath:process.env.JTW_PUBLIC_DIST_DIR?`${process.env.JTW_PUBLIC_DIST_DIR}/index.html`:undefined});
const {'content-security-policy':_apiOnlyCsp,...htmlSecurityHeaders}=apiSecurityHeaders;void _apiOnlyCsp;
async function takeRequestRate(req:Parameters<typeof requestRateKey>[0],limiter:FixedWindowRateLimiter){
  const source=sourceRate.take(requestRateKey(req,null,trustedProxies));
  if(!source.allowed)return {rate:source,session:null};
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,'')??'';
  const session=token?await sessions.verify(token):null;
  return {rate:limiter.take(requestRateKey(req,session?.accountId??null,trustedProxies)),session};
}

function send(res:ServerResponse,status:number,body:unknown,corsOrigin:string|null=null,headers:Record<string,string>={}){res.writeHead(status,{...apiSecurityHeaders,'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(corsOrigin?{'access-control-allow-origin':corsOrigin,'vary':'Origin'}:{}),...headers});res.end(JSON.stringify(body))}
const server=createServer(async(req,res)=>{const corsOrigin=allowedCorsOrigin(req.headers.origin,allowedOrigins);try{
  if(req.method==='GET'&&req.url?.startsWith('/r/')){const page=await publicSharePage(req.url);if(page){res.writeHead(page.status,{...htmlSecurityHeaders,...page.headers});res.end(page.body);return}}
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,mode:paymentMode,version:process.env.JTW_RELEASE_SHA??'development'},corsOrigin);
  if(req.method==='GET'&&req.url==='/ready'){const readiness=await checkApiReadiness(supabase,{NODE_ENV:process.env.NODE_ENV,STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET,NOTIFICATION_WEBHOOK_SECRET:process.env.NOTIFICATION_WEBHOOK_SECRET,JTW_STRIPE_MODE:process.env.JTW_STRIPE_MODE,JTW_PRODUCTION_PAYMENT_AUTHORIZED:process.env.JTW_PRODUCTION_PAYMENT_AUTHORIZED});return send(res,readiness.ok?200:503,{...readiness,version:process.env.JTW_RELEASE_SHA??'development'},corsOrigin)}
  if(req.method==='OPTIONS'){if(req.headers.origin&&!corsOrigin)return send(res,403,{error:'origin_not_allowed'});res.writeHead(204,{...apiSecurityHeaders,...(corsOrigin?{'access-control-allow-origin':corsOrigin}:{ }),'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type,stripe-signature,x-jtw-notification-signature','vary':'Origin'});return res.end()}
  if(req.headers.origin&&!corsOrigin)return send(res,403,{error:'origin_not_allowed'});
  if(req.method==='POST'&&req.url==='/v1/quotes'){const {rate}=await takeRequestRate(req,checkoutRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8'));const result=await checkout.quote(req.headers.authorization,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/payments/resume'){const {rate}=await takeRequestRate(req,checkoutRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8'));const result=await resumePayment.post(req.headers.authorization,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/checkout'){const {rate}=await takeRequestRate(req,checkoutRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);const body=JSON.parse((await readRequestBody(req,64_000)).toString('utf8'));const result=await checkout.post(req.headers.authorization,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/boarding/issue'){const {rate,session}=await takeRequestRate(req,actionRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8')) as {orderId?:string};const result=body.orderId?await boarding.issue(session.accountId,body.orderId):null;return result?send(res,200,result,corsOrigin):send(res,409,{error:'boarding_unavailable'},corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/boarding/verify'){const {rate,session}=await takeRequestRate(req,actionRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8')) as {token?:string;vehicleGroupId?:string;idempotencyKey?:string};const result=body.token&&body.vehicleGroupId&&body.idempotencyKey?await boarding.verify(session.accountId,{token:body.token,vehicleGroupId:body.vehicleGroupId,idempotencyKey:body.idempotencyKey}):null;return result?send(res,200,result,corsOrigin):send(res,403,{error:'boarding_verification_rejected'},corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/translations/message'){const {rate,session}=await takeRequestRate(req,actionRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8')) as {messageId?:string;targetLanguage?:string};if(!body.messageId||!isTranslationTarget(body.targetLanguage))return send(res,400,{error:'invalid_translation_request'},corsOrigin);const result=await translateVehicleMessage({accountId:session.accountId,messageId:body.messageId,targetLanguage:body.targetLanguage},translations,translationProvider);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/operations/refunds'){const {rate,session}=await takeRequestRate(req,actionRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8')) as {requestId?:string;idempotencyKey?:string;manualReference?:string;actualAmount?:number;evidenceNote?:string};const result=await refunds.post(session,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/travel-moments/check'){const {rate,session}=await takeRequestRate(req,actionRate);if(!rate.allowed)return sendRateLimit(res,rate.retryAfterSeconds,corsOrigin,send);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await readRequestBody(req,16_000)).toString('utf8')) as {submissionId?:string;trigger?:'initial_submit'|'user_recheck'|'admin_recheck';expectedGeneration?:number};const result=await travelMoments.post(session,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/webhooks/stripe'){const signature=req.headers['stripe-signature'];if(typeof signature!=='string')return send(res,400,{error:'missing_signature'});const result=await stripe.handleWebhook(await readRequestBody(req,1_000_000),signature,events);return send(res,result.accepted?200:400,result)}
  if(req.method==='POST'&&req.url==='/v1/webhooks/notifications'){const signature=req.headers['x-jtw-notification-signature'];if(typeof signature!=='string')return send(res,400,{error:'missing_signature'});const result=await notificationReceipts.handle(await readRequestBody(req,64_000),signature);return send(res,result.accepted?200:result.reason==='store-unavailable'?503:400,result)}
  return send(res,404,{error:'not_found'});
}catch(error){const tooLarge=error instanceof RequestBodyTooLargeError;return send(res,tooLarge?413:error instanceof SyntaxError?400:500,{error:tooLarge?'body_too_large':error instanceof SyntaxError?'invalid_json':'server_error'})}});
server.requestTimeout=15_000;server.headersTimeout=10_000;server.keepAliveTimeout=5_000;server.maxRequestsPerSocket=100;
let scheduleRunning=false;let travelMomentMetricsRunning=false;
async function runLifecycleSchedule(){if(scheduleRunning||!supabase)return;scheduleRunning=true;try{const now=new Date().toISOString();for(const [name,params] of [['release_expired_inventory',{}],['process_due_trip_room_openings',{p_now:now}],['process_due_departure_cutoffs',{p_now:now}],['enqueue_due_fulfilment_notifications',{p_now:now}]] as const){const {error}=await supabase.rpc(name,params);if(error)console.error(`lifecycle schedule ${name} failed`,error.code??'database_error')}}finally{scheduleRunning=false}}
async function runTravelMomentMetricsSchedule(){if(travelMomentMetricsRunning)return;travelMomentMetricsRunning=true;try{const result=await travelMomentMetrics.run(`scheduled:${new Date().toISOString().slice(0,13)}`);if(result.error)console.error('travel moments metrics refresh failed',result.error)}finally{travelMomentMetricsRunning=false}}
server.listen(port,'127.0.0.1',()=>{console.log(`Japan Travel Weekend test API listening on http://127.0.0.1:${port}`);void runLifecycleSchedule();void runTravelMomentMetricsSchedule()});
setInterval(()=>void runLifecycleSchedule(),60_000).unref();
setInterval(()=>void runTravelMomentMetricsSchedule(),6*60*60_000).unref();
