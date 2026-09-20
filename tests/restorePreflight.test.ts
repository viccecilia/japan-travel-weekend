import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspectMigrations,
  EXPECTED_MIGRATION_COUNT,
  LEGACY_MIGRATION_COUNT,
  ADDITIONAL_MIGRATIONS,
  runRestorePreflight,
  validateRestoreTarget,
} from "../scripts/restore-preflight.mjs";

const safeTarget = {
  projectRef: "abcdefghijklmnopqrst",
  projectUrl: "https://abcdefghijklmnopqrst.supabase.co",
  disposableConfirmation: "yes-delete-test-data",
};

describe("restore target preflight", () => {
  it('accepts Windows line endings but refuses changed SQL and stray raw patches',()=>{
    const directory=mkdtempSync(join(tmpdir(),'jtw-restore-lock-'));
    const source=join(process.cwd(),'supabase/migrations');
    for(const name of readdirSync(source).filter(n=>n.endsWith('.sql')))copyFileSync(join(source,name),join(directory,name));
    const name=ADDITIONAL_MIGRATIONS[0];
    const content=readFileSync(join(directory,name),'utf8').replace(/\r?\n/g,'\r\n');
    writeFileSync(join(directory,name),content);
    expect(inspectMigrations(directory)).toHaveLength(EXPECTED_MIGRATION_COUNT);
    writeFileSync(join(directory,name),content+'\nselect 1;\n');
    expect(()=>inspectMigrations(directory)).toThrow('Migration lock mismatch');
    writeFileSync(join(directory,name),content);
    writeFileSync(join(directory,'202609150920_unreviewed.sql'),'select 1;');
    expect(()=>inspectMigrations(directory)).toThrow(`Expected ${EXPECTED_MIGRATION_COUNT} migrations, found ${EXPECTED_MIGRATION_COUNT+1}`);
  });
  it("accepts an explicitly disposable isolated target", () => {
    expect(validateRestoreTarget(safeTarget)).toEqual({
      projectRef: safeTarget.projectRef,
      projectUrl: safeTarget.projectUrl,
    });
  });

  it.each(["olfucqcznulrtumytjak", "udhvgshimnbtdgypbtie"])(
    "refuses protected project %s",
    (projectRef) => {
      expect(() => validateRestoreTarget({
        ...safeTarget,
        projectRef,
        projectUrl: `https://${projectRef}.supabase.co`,
      })).toThrow("Refusing protected Supabase project");
    },
  );

  it("requires an exact URL and explicit disposable confirmation", () => {
    expect(() => validateRestoreTarget({ ...safeTarget, projectUrl: "https://example.com" }))
      .toThrow("must exactly match");
    expect(() => validateRestoreTarget({ ...safeTarget, disposableConfirmation: "yes" }))
      .toThrow("yes-delete-test-data");
  });

  it("verifies the repository migration chain", () => {
    const result = runRestorePreflight({
      RESTORE_SUPABASE_PROJECT_REF: safeTarget.projectRef,
      RESTORE_SUPABASE_URL: safeTarget.projectUrl,
      RESTORE_TARGET_IS_DISPOSABLE: safeTarget.disposableConfirmation,
    }, process.cwd());
    expect(result.migrationCount).toBe(EXPECTED_MIGRATION_COUNT);
  });

  it("rejects a migration chain with a gap", () => {
    const directory = mkdtempSync(join(tmpdir(), "jtw-restore-"));
    mkdirSync(join(directory, "migrations"));
    for (let index = 1; index <= LEGACY_MIGRATION_COUNT; index += 1) {
      const serial = index === 10 ? EXPECTED_MIGRATION_COUNT+1 : index;
      writeFileSync(
        join(directory, "migrations", `20260826${String(serial).padStart(4, "0")}_test.sql`),
        "select 1;",
      );
    }
    for(const name of ADDITIONAL_MIGRATIONS)copyFileSync(join(process.cwd(),'supabase/migrations',name),join(directory,'migrations',name));
    expect(() => inspectMigrations(join(directory, "migrations"))).toThrow(`contiguous 0001-${String(LEGACY_MIGRATION_COUNT).padStart(4,"0")}`);
  });
});
