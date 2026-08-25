import { readFile } from "node:fs/promises";

const path = new URL("../docs/launch-gate-status.json", import.meta.url);
const report = JSON.parse(await readFile(path, "utf8"));
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

console.log(JSON.stringify({ ok: true, environment: report.environment, productionReady: ready, passed: report.gates.length - pending.length, pending: pending.length, noindex: report.noindex }));
