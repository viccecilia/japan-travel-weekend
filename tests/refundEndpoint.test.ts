import {describe,expect,it,vi} from 'vitest';
import {RefundEndpoint,type RefundGateway} from '../server/refunds';

const session={accountId:'ops-1',accessTokenHash:'hash'};
describe('operations refund endpoint',()=>{
  it('fails closed when provider is unavailable',async()=>{
    const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:'pi_1',amount:5000})),prepare:vi.fn(async()=>({operationId:'operation-1',providerIdempotencyKey:'refund:operation-1',status:'prepared'}))} as unknown as RefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:false,createRefund:vi.fn()});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:503,body:{operationId:'operation-1'}});
  });
  it('rejects non-operations or ineligible requests',async()=>{
    const gateway={loadForOperations:vi.fn(async()=>null)} as unknown as RefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:true,createRefund:vi.fn()});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:403});
  });
  it('persists a stable operation before calling Stripe',async()=>{
    const calls:string[]=[];const markProviderResult=vi.fn(async()=>{calls.push('stored-result');return true});
    const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:'pi_1',amount:5000})),prepare:vi.fn(async()=>{calls.push('prepared');return {operationId:'operation-1',providerIdempotencyKey:'refund:operation-1',status:'prepared'}}),markProviderResult} as unknown as RefundGateway;
    const createRefund=vi.fn(async()=>({id:'re_1'} as never));
    createRefund.mockImplementation(async()=>{calls.push('stripe');return {id:'re_1'} as never});
    const endpoint=new RefundEndpoint(gateway,{available:true,createRefund});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:202,body:{status:'refund_processing'}});
    expect(calls).toEqual(['prepared','stripe','stored-result']);
    expect(createRefund).toHaveBeenCalledWith({paymentIntentId:'pi_1',amount:5000,idempotencyKey:'refund:operation-1'});
    expect(markProviderResult).toHaveBeenCalledWith(expect.objectContaining({refundId:'re_1',accountId:'ops-1'}));
  });
  it('completes a zero-yen cancellation without contacting Stripe',async()=>{
    const createRefund=vi.fn();const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:'pi_1',amount:0})),prepare:vi.fn(async()=>({operationId:'operation-1',providerIdempotencyKey:'refund:operation-1',status:'prepared'})),completeWithoutRefund:vi.fn(async()=>true)} as unknown as RefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:false,createRefund});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:200,body:{status:'cancelled_without_refund'}});
    expect(createRefund).not.toHaveBeenCalled();
  });
  it('routes bank transfer refunds to manual review',async()=>{
    const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:null,amount:5000})),prepare:vi.fn(async()=>({operationId:'operation-1',providerIdempotencyKey:'refund:operation-1',status:'awaiting_manual_refund'}))} as unknown as RefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:false,createRefund:vi.fn()});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:202,body:{status:'manual_refund_required'}});
  });
  it('reports successful Stripe submission as pending reconciliation when the result write fails',async()=>{
    const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:'pi_1',amount:1000})),prepare:vi.fn(async()=>({operationId:'operation-1',providerIdempotencyKey:'refund:operation-1',status:'prepared'})),markProviderResult:vi.fn(async()=>false)} as unknown as RefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:true,createRefund:vi.fn(async()=>({id:'re_1'} as never))});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:202,body:{status:'refund_result_pending_reconciliation'}});
  });
});
