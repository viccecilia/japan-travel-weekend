// Disposable TEST-project verification. It installs no migration history and
// rolls back every schema/data change before disconnecting.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import pg from "pg";

const env = parseEnv(readFileSync(".env.supabase.restore.local", "utf8"));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF, "hzxoofvodpqpdomtmzlf");
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE, "yes-delete-test-data");
assert.ok(process.argv.includes("--rollback-test"), "Explicit --rollback-test required");

const stripTransaction = (sql) => sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
const db = new pg.Client({
  host: "aws-0-ap-northeast-1.pooler.supabase.com",
  port: 6543,
  user: `postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,
  password: env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

try {
  await db.connect();
  await db.query("begin");
  await db.query("set local lock_timeout='3s'; set local statement_timeout='30s'");
  await db.query(stripTransaction(readFileSync("supabase/migrations/20260926043656_growth_operations_phase1.sql", "utf8")));
  await db.query(stripTransaction(readFileSync("supabase/verification/growth_operations_phase1_regression.sql", "utf8")));
  const checks = await db.query(`
    select
      to_regclass('public.referral_sources') is not null as sources,
      to_regclass('public.referral_lifecycles') is not null as lifecycles,
      to_regclass('public.referral_source_ambassador_grants') is not null as source_grants,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='refresh_referral_lifecycle_for_order') as lifecycle_fn,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='request_own_commission_payout') as monthly_payout_fn
  `);
  assert.deepEqual(checks.rows[0], { sources: true, lifecycles: true, source_grants: true, lifecycle_fn: true, monthly_payout_fn: true });
  console.log(JSON.stringify({ status: "PASS", scope: "rollback-only-test-project", checks: checks.rows[0] }));
} finally {
  try { await db.query("rollback"); } finally { await db.end(); }
}
