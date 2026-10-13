// Disposable Test-project verification. The migration and every fixture are
// executed inside one transaction and always rolled back before disconnecting.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    "rollback-test": { type: "boolean", default: false },
  },
});
assert.ok(values["env-file"], "--env-file is required");
assert.ok(values["rollback-test"], "--rollback-test is required");
const env = parseEnv(readFileSync(values["env-file"], "utf8"));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF, "hzxoofvodpqpdomtmzlf");
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE, "yes-delete-test-data");

const stripTransaction = (sql) =>
  sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
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
  await db.query("set local lock_timeout='3s'; set local statement_timeout='60s'");
  await db.query(
    stripTransaction(
      readFileSync(
        "supabase/migrations/20261013071140_route_referral_growth_convergence.sql",
        "utf8",
      ),
    ),
  );
  await db.query(
    readFileSync(
      "supabase/verification/route_referral_growth_regression.sql",
      "utf8",
    ),
  );
  const checks = await db.query(`
    select
      to_regclass('public.referral_qualified_seats') is not null as seats,
      to_regclass('public.referral_learning_eligibilities') is not null as learning,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='resolve_public_referral_invitation') as invitation,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='refresh_ambassador_activity') as activity
  `);
  assert.deepEqual(checks.rows[0], {
    seats: true,
    learning: true,
    invitation: true,
    activity: true,
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      scope: "test-transaction-rollback",
      checks: checks.rows[0],
    }),
  );
} finally {
  try {
    await db.query("rollback");
  } finally {
    await db.end();
  }
}
