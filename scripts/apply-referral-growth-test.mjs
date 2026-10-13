// Explicit Test-only migration application. This refuses any project other
// than the approved JTW disposable Test Supabase project.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    "apply-test": { type: "boolean", default: false },
  },
});
assert.ok(values["env-file"], "--env-file is required");
assert.ok(values["apply-test"], "--apply-test is required");
const env = parseEnv(readFileSync(values["env-file"], "utf8"));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF, "hzxoofvodpqpdomtmzlf");
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE, "yes-delete-test-data");

const version = "20261013071140";
const name = "route_referral_growth_convergence";
const source = readFileSync(
  `supabase/migrations/${version}_${name}.sql`,
  "utf8",
);
const statement = source
  .replace(/^\s*begin;\s*/i, "")
  .replace(/\s*commit;\s*$/i, "");
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
  await db.query("set local lock_timeout='5s'; set local statement_timeout='90s'");
  const existing = await db.query(
    "select version,name from supabase_migrations.schema_migrations where version=$1",
    [version],
  );
  if (existing.rowCount) {
    await db.query("rollback");
    console.log(
      JSON.stringify({
        status: "PASS",
        project: env.RESTORE_SUPABASE_PROJECT_REF,
        migration: existing.rows[0],
        result: "already_applied",
      }),
    );
  } else {
    await db.query(statement);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) values($1,$2,$3,$4,$5,$6)",
      [
        version,
        [source],
        name,
        "jtw-referral-growth-test-release",
        `jtw-${version}`,
        [],
      ],
    );
    const checks = await db.query(`
      select
        to_regclass('public.referral_qualified_seats') is not null as seats,
        to_regclass('public.referral_learning_eligibilities') is not null as learning,
        to_regprocedure('public.resolve_public_referral_invitation(text)') is not null as invitation,
        to_regprocedure('public.refresh_ambassador_activity(uuid)') is not null as activity
    `);
    assert.deepEqual(checks.rows[0], {
      seats: true,
      learning: true,
      invitation: true,
      activity: true,
    });
    await db.query("commit");
    console.log(
      JSON.stringify({
        status: "PASS",
        project: env.RESTORE_SUPABASE_PROJECT_REF,
        migration: { version, name },
        result: "applied",
        checks: checks.rows[0],
      }),
    );
  }
} catch (error) {
  try {
    await db.query("rollback");
  } catch {
    // Preserve the original migration error if rollback also fails.
  }
  throw error;
} finally {
  await db.end();
}
