import { readFile } from "node:fs/promises";

const path = new URL("../docs/launch-gate-status.json", import.meta.url);
const report = JSON.parse(await readFile(path, "utf8"));
const source=async relative=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const [legal,business,payment,html,robots]=await Promise.all([source('src/shared/config/legalOperations.ts'),source('src/shared/config/businessRules.ts'),source('src/app/App.tsx'),source('index.html'),source('public/robots.txt')]);
const allowed = new Set(["pass", "test_pending", "external_pending"]);
const required = new Set([
  "passenger_needs",
  "accounts_and_access",
  "inventory_orders_payments",
  "vehicle_allocation_trip_room",
  "maps_boarding_notifications",
  "monitoring_and_alerting",
  "backup_restore_drill",
  "capacity_and_security_review",
  "legal_and_operations_approval",
  "production_payment_authorization",
  "real_device_acceptance",
  "remove_noindex_approval",
]);

if (report.environment !== "test") throw new Error("launch report must remain test-only before production approval");
if (!Array.isArray(report.gates)) throw new Error("launch report gates must be an array");
const names = new Set();
for (const gate of report.gates) {
  if (!required.has(gate.id)) throw new Error(`unknown launch gate: ${gate.id}`);
  if (names.has(gate.id)) throw new Error(`duplicate launch gate: ${gate.id}`);
  if (!allowed.has(gate.status)) throw new Error(`invalid status for ${gate.id}`);
  if (!gate.evidence || !gate.owner || !gate.nextAction) throw new Error(`incomplete evidence for ${gate.id}`);
  names.add(gate.id);
}
for (const id of required) if (!names.has(id)) throw new Error(`missing launch gate: ${id}`);

const pending = report.gates.filter(({ status }) => status !== "pass");
const ready = pending.length === 0 && report.noindex === false;
if (report.productionReady !== ready) throw new Error("productionReady contradicts gate statuses or noindex state");
if (!report.productionReady && report.noindex !== true) throw new Error("noindex must remain enabled while launch is blocked");
const sourceNoindex=html.includes('noindex,nofollow')&&robots.includes('Disallow: /');
if(sourceNoindex!==report.noindex)throw new Error('源码 noindex/robots 与 launch report 不一致');
if(!report.productionReady){
  if(!legal.includes("realBookingAllowed:false")||!legal.includes("status:'professional-review-required'"))throw new Error('未就绪状态必须锁定真实预订并保留法律审核标记');
  if(!payment.includes('支付功能尚未开放'))throw new Error('未就绪状态必须在支付页明确关闭支付');
}
if(report.productionReady){
  const blockers=[];
  if(!legal.includes("realBookingAllowed:true")||!legal.includes("status:'approved'"))blockers.push('法律批准或真实预订授权');
  if(/effectiveAt:null/.test(legal))blockers.push('法律生效日期');
  if(/seatPrice:null/.test(business)||/priceStatus:'待/.test(business))blockers.push('正式价格');
  if(/authentication:false/.test(business)||/payment:false/.test(business)||/inventory:false/.test(business))blockers.push('认证、支付或库存能力');
  if(sourceNoindex)blockers.push('搜索引擎封锁');
  if(blockers.length)throw new Error(`禁止生产上线，仍缺少：${blockers.join('、')}`);
}

console.log(JSON.stringify({ ok: true, environment: report.environment, productionReady: ready, passed: report.gates.length - pending.length, pending: pending.length, noindex: report.noindex,transactionGate:report.productionReady?'open':'locked' }));
