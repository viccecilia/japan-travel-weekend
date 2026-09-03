import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('payment UI safety gate',()=>{
  const source=readFileSync('src/app/App.tsx','utf8');
  const stripe=readFileSync('src/shared/integrations/stripeClient.ts','utf8');
  it('only mounts checkout after a saved draft in non-production test mode',()=>{expect(source).toContain('!production&&services?.checkoutAvailable&&stripeTestClient&&state.booking?.draftId');expect(source).toContain('draftId:state.booking.draftId')});
  it('accepts only Stripe test publishable keys',()=>{expect(stripe).toContain("startsWith('pk_test_')")});
  it('keeps production unavailable copy',()=>{expect(source).toContain('支付功能尚未开放。本页只安全保存订单草稿')});
  it('shows explicit payment review, refund and cancelled outcomes',()=>{for(const copy of ['付款需要人工确认','退款已发起','订单未完成','请勿重复付款'])expect(source).toContain(copy)});
  it('persists and displays the bank-transfer deadline in Japan time',()=>{expect(source).toContain('manual_payment_due_at');expect(source).toContain('转账付款期限（日本时间）');expect(source).toContain('timeZone:"Asia/Tokyo"')});
  it('links converted drafts to their authoritative order',()=>{expect(source).toContain('已进入付款流程');expect(source).toContain('draft.converted_order_id')});
  it('shows assistance review and gates boarding until payment and allocation',()=>{for(const copy of ['特殊需求审核','履约需求摘要','付款确认并完成车辆分配后开放登车凭证','不会在确认前收取相关附加费用'])expect(source).toContain(copy);expect(source).toContain("['paid','confirmed'].includes(remoteOrder.status)&&remoteFulfilment?.boarding_ready===true")});
});
