import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {CheckoutEndpoint} from './api/checkout.js';
import {createSupabaseServerClient,SupabaseAccessTokenVerifier,SupabaseManualPaymentGateway,SupabaseOrderInventoryGateway,SupabasePaymentEventStore,SupabasePaymentIntentRecorder,SupabaseServerPricingGateway} from './supabase.js';
import {StripeCardPaymentSessionGateway,StripeTestAdapter} from './stripe.js';
import {allowedCorsOrigin,parseAllowedOrigins} from './cors.js';
import {SupabaseBoardingGateway} from './boarding.js';
import {checkTestApiReadiness} from './readiness.js';

const port=Number(process.env.PORT||8787);const allowedOrigins=parseAllowedOrigins(process.env.ALLOWED_ORIGIN||'');
const supabase=createSupabaseServerClient({url:process.env.SUPABASE_URL||'',serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY||''});
const stripe=new StripeTestAdapter({secretKey:process.env.STRIPE_SECRET_KEY||'',webhookSecret:process.env.STRIPE_WEBHOOK_SECRET||''});
const checkout=new CheckoutEndpoint(new SupabaseAccessTokenVerifier(supabase),new SupabaseOrderInventoryGateway(supabase),new StripeCardPaymentSessionGateway(stripe,new SupabasePaymentIntentRecorder(supabase)),new SupabaseManualPaymentGateway(supabase),new SupabaseServerPricingGateway(supabase));
const events=new SupabasePaymentEventStore(supabase);
const boarding=new SupabaseBoardingGateway(supabase);const sessions=new SupabaseAccessTokenVerifier(supabase);

function send(res:ServerResponse,status:number,body:unknown,corsOrigin:string|null=null){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(corsOrigin?{'access-control-allow-origin':corsOrigin,'vary':'Origin'}:{})});res.end(JSON.stringify(body))}
async function raw(req:IncomingMessage,limit=1_000_000){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const value=Buffer.from(chunk);size+=value.length;if(size>limit)throw new Error('body_too_large');chunks.push(value)}return Buffer.concat(chunks)}
const server=createServer(async(req,res)=>{const corsOrigin=allowedCorsOrigin(req.headers.origin,allowedOrigins);try{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,mode:'test'},corsOrigin);
  if(req.method==='GET'&&req.url==='/ready'){const readiness=await checkTestApiReadiness(supabase,{STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET});return send(res,readiness.ok?200:503,readiness,corsOrigin)}
  if(req.method==='OPTIONS'){if(req.headers.origin&&!corsOrigin)return send(res,403,{error:'origin_not_allowed'});res.writeHead(204,{...(corsOrigin?{'access-control-allow-origin':corsOrigin}:{ }),'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type,stripe-signature','vary':'Origin'});return res.end()}
  if(req.headers.origin&&!corsOrigin)return send(res,403,{error:'origin_not_allowed'});
  if(req.method==='POST'&&req.url==='/v1/checkout'){const body=JSON.parse((await raw(req)).toString('utf8'));const result=await checkout.post(req.headers.authorization,body);return send(res,result.status,result.body,corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/boarding/issue'){const token=req.headers.authorization?.replace(/^Bearer\s+/i,'')??'';const session=await sessions.verify(token);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await raw(req)).toString('utf8')) as {orderId?:string};const result=body.orderId?await boarding.issue(session.accountId,body.orderId):null;return result?send(res,200,result,corsOrigin):send(res,409,{error:'boarding_unavailable'},corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/boarding/verify'){const token=req.headers.authorization?.replace(/^Bearer\s+/i,'')??'';const session=await sessions.verify(token);if(!session)return send(res,401,{error:'unauthorized'},corsOrigin);const body=JSON.parse((await raw(req)).toString('utf8')) as {token?:string;vehicleGroupId?:string;idempotencyKey?:string};const result=body.token&&body.vehicleGroupId&&body.idempotencyKey?await boarding.verify(session.accountId,{token:body.token,vehicleGroupId:body.vehicleGroupId,idempotencyKey:body.idempotencyKey}):null;return result?send(res,200,result,corsOrigin):send(res,403,{error:'boarding_verification_rejected'},corsOrigin)}
  if(req.method==='POST'&&req.url==='/v1/webhooks/stripe'){const signature=req.headers['stripe-signature'];if(typeof signature!=='string')return send(res,400,{error:'missing_signature'});const result=await stripe.handleWebhook(await raw(req),signature,events);return send(res,result.accepted?200:400,result)}
  return send(res,404,{error:'not_found'});
}catch(error){return send(res,error instanceof SyntaxError?400:500,{error:error instanceof SyntaxError?'invalid_json':'server_error'})}});
server.listen(port,'127.0.0.1',()=>console.log(`Japan Travel Weekend test API listening on http://127.0.0.1:${port}`));
