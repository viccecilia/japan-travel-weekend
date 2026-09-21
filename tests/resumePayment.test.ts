import {describe,it,expect,vi} from 'vitest';
import {ResumePaymentEndpoint} from '../server/api/resumePayment';
const orderId='00000000-0000-0000-0000-000000000001';
function setup(){
 const auth={verify:vi.fn(async()=>({accountId:'owner',accessTokenHash:'hash'}))};
 const context={orderId,amount:12300,paymentIntentId:'pi_old'};
 const intent={id:'pi_old',amount:12300,currency:'jpy',status:'requires_payment_method',livemode:false,client_secret:'test-secret',metadata:{order_id:orderId}};
 const store={context:vi.fn(async()=>context),record:vi.fn(async()=>true)};
 const stripe={mode:'test' as 'test'|'live',available:true,retrievePaymentIntent:vi.fn(async()=>intent),createPaymentIntent:vi.fn(async()=>({...intent,id:'pi_new'}))};
 const endpoint=new ResumePaymentEndpoint(auth,store,stripe);
 return {auth,context,intent,store,stripe,post:(input:unknown={orderId,idempotencyKey:'attempt'},authorization:string|undefined='Bearer token')=>endpoint.post(authorization,input)};
}
describe('resume an existing order without checkout side effects',()=>{
 it('requires authentication before reading or disclosing an order',async()=>{
  const s=setup();s.auth.verify.mockResolvedValueOnce(null as never);
  expect((await s.post()).status).toBe(401);expect(s.store.context).not.toHaveBeenCalled();
 });
 it('is test-only even if the existing payment adapter supports live mode',async()=>{
  const s=setup();s.stripe.mode='live';expect((await s.post()).status).toBe(503);expect(s.stripe.createPaymentIntent).not.toHaveBeenCalled();
 });
 it('uses confirmed historical amount, ignores tampered amount and returns the same order',async()=>{
  const s=setup();const result=await s.post({orderId,idempotencyKey:'attempt',amount:1,seats:99});
  expect(result).toMatchObject({status:200,body:{orderId,amount:12300,clientSecret:'test-secret'}});
  expect(s.stripe.createPaymentIntent).not.toHaveBeenCalled();
  expect(s.store.context).toHaveBeenCalledWith('owner',orderId);
 });
 it('replaces a confirmed cancelled PI with one generation key even with different retry keys',async()=>{
  const s=setup();s.intent.status='canceled';
  await Promise.all([s.post({orderId,idempotencyKey:'a'}),s.post({orderId,idempotencyKey:'b'})]);
  expect(s.stripe.createPaymentIntent.mock.calls[0]).toEqual(s.stripe.createPaymentIntent.mock.calls[1]);
  expect(s.stripe.createPaymentIntent).toHaveBeenCalledWith({orderId,amount:12300,idempotencyKey:'resume:'+orderId+':pi_old'});
 });
 for(const status of ['succeeded','processing','requires_capture']){
  it('does not create a second charge for '+status,async()=>{
   const s=setup();s.intent.status=status;expect((await s.post()).status).toBe(409);
   expect(s.stripe.createPaymentIntent).not.toHaveBeenCalled();
  });
 }
 it('does not replace an intent whose retrieval failed',async()=>{
  const s=setup();s.stripe.retrievePaymentIntent.mockResolvedValueOnce(null as never);
  expect((await s.post()).status).toBe(503);expect(s.stripe.createPaymentIntent).not.toHaveBeenCalled();
 });
 it('rejects metadata mismatch and live intents',async()=>{
  const s=setup();s.intent.metadata.order_id='other';
  expect((await s.post()).status).toBe(409);s.intent.metadata.order_id=orderId;s.intent.livemode=true;
  expect((await s.post()).status).toBe(409);expect(s.store.record).not.toHaveBeenCalled();
 });
 it('rejects an ineligible/foreign/paid/expired order before talking to Stripe',async()=>{
  const s=setup();s.store.context.mockResolvedValueOnce(null as never);
  expect((await s.post()).status).toBe(409);expect(s.stripe.retrievePaymentIntent).not.toHaveBeenCalled();
 });
 it('does not disclose a secret if expiry or concurrency changes the order',async()=>{
  const s=setup();s.store.record.mockResolvedValueOnce(false);
  expect(await s.post()).toEqual({status:409,body:{error:'order_changed'}});
 });
});
