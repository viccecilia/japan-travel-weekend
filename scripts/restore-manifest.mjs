import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMigrations } from "./restore-preflight.mjs";

export const STRUCTURE_CHECKS = [
  "remote_structure_acceptance.sql",
  "realtime_vehicle_group_policy_acceptance.sql",
  "persistent_chat_attendance_acceptance.sql",
];

export const FICTIONAL_ACCOUNT_CHECKS = [
  "reserve_inventory_regression.sql",
  "payment_and_compensation_regression.sql",
  "boarding_credential_regression.sql",
  "operations_fleet_dispatch_acceptance.sql",
  "booking_draft_conversion_regression.sql",
];

function describeFile(path, name) {
  const content = readFileSync(path);
  if (content.toString("utf8").trim().length === 0) throw new Error(`Restore evidence file is empty: ${name}`);
  return {
    name,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

export function buildRestoreManifest(cwd = process.cwd()) {
  const migrationDirectory = resolve(cwd, "supabase", "migrations");
  const verificationDirectory = resolve(cwd, "supabase", "verification");
  const migrationNames = inspectMigrations(migrationDirectory);
  const verificationNames = [...STRUCTURE_CHECKS, ...FICTIONAL_ACCOUNT_CHECKS];
  return {
    schemaVersion: 1,
    safety: {
      targetMustBeDisposable: true,
      existingProjectsProtected: true,
      realUserDataAllowed: false,
    },
    phases: [
      {
        id: "migrations",
        requiresFictionalAccounts: false,
        files: migrationNames.map((name) => describeFile(resolve(migrationDirectory, name), name)),
      },
      {
        id: "structure_checks",
        requiresFictionalAccounts: false,
        files: STRUCTURE_CHECKS.map((name) => describeFile(resolve(verificationDirectory, name), name)),
      },
      {
        id: "fictional_account_checks",
        requiresFictionalAccounts: true,
        files: FICTIONAL_ACCOUNT_CHECKS.map((name) => describeFile(resolve(verificationDirectory, name), name)),
      },
    ],
    verificationCount: verificationNames.length,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) console.log(JSON.stringify(buildRestoreManifest(), null, 2));
