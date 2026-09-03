import { describe, expect, it } from "vitest";
import {
  buildRestoreManifest,
  FICTIONAL_ACCOUNT_CHECKS,
  STRUCTURE_CHECKS,
} from "../scripts/restore-manifest.mjs";
import {EXPECTED_MIGRATION_COUNT} from '../scripts/restore-preflight.mjs';

describe("restore evidence manifest", () => {
  it("locks the migration and verification sequence to hashed repository files", () => {
    const manifest = buildRestoreManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.safety).toEqual({
      targetMustBeDisposable: true,
      existingProjectsProtected: true,
      realUserDataAllowed: false,
    });
    expect(manifest.phases.map((phase) => phase.id)).toEqual([
      "migrations",
      "structure_checks",
      "fictional_account_checks",
    ]);
    expect(manifest.phases[0].files).toHaveLength(EXPECTED_MIGRATION_COUNT);
    expect(manifest.phases[1].files.map((file) => file.name)).toEqual(STRUCTURE_CHECKS);
    expect(manifest.phases[2].files.map((file) => file.name)).toEqual(FICTIONAL_ACCOUNT_CHECKS);
    expect(manifest.verificationCount).toBe(9);
    for (const phase of manifest.phases) {
      for (const file of phase.files) {
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("does not require fictional accounts for read-only structure checks", () => {
    const phases = buildRestoreManifest().phases;
    expect(phases[0].requiresFictionalAccounts).toBe(false);
    expect(phases[1].requiresFictionalAccounts).toBe(false);
    expect(phases[2].requiresFictionalAccounts).toBe(true);
  });
});
