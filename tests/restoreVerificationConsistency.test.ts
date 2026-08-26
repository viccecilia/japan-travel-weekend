import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration019 = readFileSync(
  "supabase/migrations/202608250019_persistent_chat_attendance.sql",
  "utf8",
);
const remoteStructure = readFileSync(
  "supabase/verification/remote_structure_acceptance.sql",
  "utf8",
);
const realtimeAcceptance = readFileSync(
  "supabase/verification/realtime_vehicle_group_policy_acceptance.sql",
  "utf8",
);

describe("restore verification follows the final migration state", () => {
  it("expects the final durable-chat boundary after migration 019", () => {
    expect(migration019).toContain("drop policy if exists vehicle_group_private_send");
    expect(migration019).toContain("send_trip_room_message");
    expect(remoteStructure).toContain("expected >=1");
    expect(remoteStructure).not.toContain("expected >=2");
    expect(realtimeAcceptance).toContain("send_count <> 0");
    expect(realtimeAcceptance).toContain("durable_send_count <> 1");
    expect(realtimeAcceptance).not.toContain("if send_count <> 1");
  });
});
