import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest';
const page=readFileSync('src/app/OperationsDashboard.tsx','utf8');
describe('运营工作台数字下钻',()=>{it('主要数字链接到真实管理页或关联队列',()=>{for(const target of ['/app/operations/departures','#orders-overview','#booking-drafts','#resource-registry','#dispatch-control','#notification-issues','#referral-monitor'])expect(page).toContain(`href="${target}"`)});it('佣金审核有独立真实页面',()=>{expect(page).toContain('/app/operations/commissions')})});
