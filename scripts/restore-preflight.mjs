import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import migrationLock from '../supabase/migration-lock.json' with {type:'json'};

export const PROTECTED_PROJECT_REFS = new Set([
  "olfucqcznulrtumytjak", // Active Japan Travel Weekend test project.
  "udhvgshimnbtdgypbtie", // Paused legacy project; still contains recoverable data.
]);

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const MIGRATION_PATTERN = /^(\d{8})(\d{4})_.+\.sql$/;
export const LEGACY_MIGRATION_COUNT = 147;
// CLI-generated additions follow the frozen 0001-0147 legacy chain.
// Raw 0920/0970/0980 drafts are archived, never replayed as migrations.
export const ADDITIONAL_MIGRATIONS = [
  '20260919100111_operations_read_authorization_closure.sql',
  '20260919100132_travelers_boost_explicit_consent.sql',
  '20260919100755_staff_assignment_capability_boundary.sql',
  '20260919101135_restore_korean_translation_context.sql',
  '20260920054451_discover_video_heroes.sql',
  '20260920070417_delete_discover_hero.sql',
  '20260921011836_account_profile_consent_once.sql',
  '20260921011919_chat_spanish_language.sql',
  '20260921013345_resume_existing_order_payment.sql',
  '20260921014034_round1_contact_window.sql',
  '20260921014412_passenger_location_coordinates.sql',
  '20260921014907_private_trip_chat_photos.sql',
];
export const EXPECTED_MIGRATION_COUNT = LEGACY_MIGRATION_COUNT + ADDITIONAL_MIGRATIONS.length;

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

  const legacy = names.filter(name=>!ADDITIONAL_MIGRATIONS.includes(name));
  const serials = legacy.map((name) => {
    const match = name.match(MIGRATION_PATTERN);
    if (!match) throw new Error(`Unexpected migration filename: ${name}`);
    if (readFileSync(resolve(migrationsDirectory, name), "utf8").trim().length === 0) {
      throw new Error(`Migration is empty: ${name}`);
    }
    return Number(match[2]);
  });
  const expected = Array.from({ length: LEGACY_MIGRATION_COUNT }, (_, index) => index + 1);
  if (serials.length!==expected.length||serials.some((serial, index) => serial !== expected[index])) {
    throw new Error(`Migration serials must be contiguous 0001-${String(LEGACY_MIGRATION_COUNT).padStart(4,"0")}; found ${serials.join(",")}.`);
  }
  if(ADDITIONAL_MIGRATIONS.some((name,index)=>names[LEGACY_MIGRATION_COUNT+index]!==name))throw new Error('Unregistered or reordered appended migration');
  for(const name of ADDITIONAL_MIGRATIONS)if(!readFileSync(resolve(migrationsDirectory,name),'utf8').trim())throw new Error(`Migration is empty: ${name}`);
  const lock=migrationLock;
  if(lock.files.length!==names.length)throw new Error('Migration lock count mismatch');
  for(const [index,name] of names.entries()){
    const hash=createHash('sha256').update(readFileSync(resolve(migrationsDirectory,name),'utf8').replace(/\r\n/g,'\n')).digest('hex');
    if(lock.files[index].name!==name||lock.files[index].sha256!==hash)throw new Error(`Migration lock mismatch: ${name}`);
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
