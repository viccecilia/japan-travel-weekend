export interface RestoreTargetInput {
  projectRef?: string;
  projectUrl?: string;
  disposableConfirmation?: string;
}

export interface RestoreEnvironment {
  RESTORE_SUPABASE_PROJECT_REF?: string;
  RESTORE_SUPABASE_URL?: string;
  RESTORE_TARGET_IS_DISPOSABLE?: string;
}

export const PROTECTED_PROJECT_REFS: Set<string>;
export const EXPECTED_MIGRATION_COUNT: number;

export function validateRestoreTarget(input: RestoreTargetInput): {
  projectRef: string;
  projectUrl: string;
};

export function inspectMigrations(migrationsDirectory: string): string[];

export function runRestorePreflight(environment?: RestoreEnvironment, cwd?: string): {
  projectRef: string;
  projectUrl: string;
  migrationCount: number;
};
