import {describe,expect,it,vi} from 'vitest';
import {RefundEndpoint,SupabaseRefundGateway} from '../server/refunds';

const session={accountId:'ops-1',accessTokenHash:'hash'};
describe('operations refund endpoint',()=>{
  it('fails closed when provider is unavailable',async()=>{
    const endpoint=new RefundEndpoint({} as SupabaseRefundGateway,{available:false,createRefund:vi.fn()});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:503});
  });
  it('rejects non-operations or ineligible requests',async()=>{
    const gateway={loadForOperations:vi.fn(async()=>null)} as unknown as SupabaseRefundGateway;
    const endpoint=new RefundEndpoint(gateway,{available:true,createRefund:vi.fn()});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:403});
  });
  it('creates the refund before recording processing audit',async()=>{
    const markProcessing=vi.fn(async()=>true);
    const gateway={loadForOperations:vi.fn(async()=>({requestId:'request-1',orderId:'order-1',paymentIntentId:'pi_1',amount:5000})),markProcessing} as unknown as SupabaseRefundGateway;
    const createRefund=vi.fn(async()=>({id:'re_1'} as never));
    const endpoint=new RefundEndpoint(gateway,{available:true,createRefund});
    await expect(endpoint.post(session,{requestId:'request-1',idempotencyKey:'refund-key-1'})).resolves.toMatchObject({status:202,body:{status:'refund_processing'}});
    expect(createRefund).toHaveBeenCalledWith({paymentIntentId:'pi_1',amount:5000,idempotencyKey:'refund-key-1'});
    expect(markProcessing).toHaveBeenCalledWith(expect.objectContaining({refundId:'re_1',accountId:'ops-1'}));
  });
});
