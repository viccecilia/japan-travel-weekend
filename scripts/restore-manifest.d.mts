export interface RestoreManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface RestoreManifestPhase {
  id: "migrations" | "structure_checks" | "fictional_account_checks";
  requiresFictionalAccounts: boolean;
  files: RestoreManifestFile[];
}

export const STRUCTURE_CHECKS: string[];
export const FICTIONAL_ACCOUNT_CHECKS: string[];
export function buildRestoreManifest(cwd?: string): {
  schemaVersion: number;
  safety: {
    targetMustBeDisposable: boolean;
    existingProjectsProtected: boolean;
    realUserDataAllowed: boolean;
  };
  phases: RestoreManifestPhase[];
  verificationCount: number;
};
