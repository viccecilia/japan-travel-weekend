import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROTECTED_PROJECT_REFS = new Set([
  "olfucqcznulrtumytjak", // Active Japan Travel Weekend test project.
  "udhvgshimnbtdgypbtie", // Paused legacy project; still contains recoverable data.
]);

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const MIGRATION_PATTERN = /^(\d{8})(\d{4})_.+\.sql$/;
export const EXPECTED_MIGRATION_COUNT = 123;

export function validateRestoreTarget({ projectRef, projectUrl, disposableConfirmation }) {
  if (!PROJECT_REF_PATTERN.test(projectRef ?? "")) {
    throw new Error("RESTORE_SUPABASE_PROJECT_REF must be a 20-character lowercase project ref.");
  }
  if (PROTECTED_PROJECT_REFS.has(projectRef)) {
    throw new Error(`Refusing protected Supabase project ${projectRef}.`);
  }
  if (projectUrl !== `https://${projectRef}.supabase.co`) {
    throw new Error("RESTORE_SUPABASE_URL must exactly match the supplied project ref.");
  }
  if (disposableConfirmation !== "yes-delete-test-data") {
    throw new Error("Set RESTORE_TARGET_IS_DISPOSABLE=yes-delete-test-data for the isolated restore project.");
  }
  return { projectRef, projectUrl };
}

export function inspectMigrations(migrationsDirectory) {
  const names = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (names.length !== EXPECTED_MIGRATION_COUNT) {
    throw new Error(`Expected ${EXPECTED_MIGRATION_COUNT} migrations, found ${names.length}.`);
  }

  const serials = names.map((name) => {
    const match = name.match(MIGRATION_PATTERN);
    if (!match) throw new Error(`Unexpected migration filename: ${name}`);
    if (readFileSync(resolve(migrationsDirectory, name), "utf8").trim().length === 0) {
      throw new Error(`Migration is empty: ${name}`);
    }
    return Number(match[2]);
  });
  const expected = Array.from({ length: EXPECTED_MIGRATION_COUNT }, (_, index) => index + 1);
  if (serials.some((serial, index) => serial !== expected[index])) {
    throw new Error(`Migration serials must be contiguous 0001-${String(EXPECTED_MIGRATION_COUNT).padStart(4,"0")}; found ${serials.join(",")}.`);
  }
  return names;
}

export function runRestorePreflight(environment = process.env, cwd = process.cwd()) {
  const target = validateRestoreTarget({
    projectRef: environment.RESTORE_SUPABASE_PROJECT_REF,
    projectUrl: environment.RESTORE_SUPABASE_URL,
    disposableConfirmation: environment.RESTORE_TARGET_IS_DISPOSABLE,
  });
  const migrations = inspectMigrations(resolve(cwd, "supabase", "migrations"));
  return { ...target, migrationCount: migrations.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runRestorePreflight();
  console.log(`Restore preflight passed for isolated project ${result.projectRef}; ${result.migrationCount} migrations verified.`);
}
