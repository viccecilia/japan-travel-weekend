import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261016094500_staff_meeting_start_and_legacy_access_recovery.sql",
  "utf8",
);

describe("shared meeting start and audited legacy staff recovery", () => {
  it("lets any active assigned driver or guide start the meeting", () => {
    expect(migration).toContain(
      "staff_assignment_allows(p_vehicle_group,'shared',auth.uid())",
    );
    expect(migration).not.toContain(
      "p_event_type='meeting_started' then 'guiding'",
    );
    expect(migration).toContain("if p_event_type='meeting_started' then");
  });

  it("keeps the legacy recovery Operations-only, narrow, and audited", () => {
    expect(migration).toContain(
      "create function public.operations_recover_legacy_staff_access",
    );
    expect(migration).toContain("not coalesce(public.is_operations(),false)");
    expect(migration).toContain(
      "existing staff application must use normal review",
    );
    expect(migration).toContain("v_resource.status<>'available'");
    expect(migration).toContain("'staff_application_approved'");
    expect(migration).toContain("'legacy_staff_access_recovery'");
    expect(migration).not.toMatch(
      /jtw\.restore\.guide|4d4e6285|682af97f|c5d87ad1/i,
    );
  });
});
