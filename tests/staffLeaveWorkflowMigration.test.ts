import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202609080075_staff_leave_workflow.sql",
  "utf8",
);

describe("司导请假与派单联动", () => {
  it("只允许工作人员提交自己的未来请假并阻止重叠申请", () => {
    expect(sql).toContain("role in ('driver','guide')");
    expect(sql).toContain("account_id=auth.uid()");
    expect(sql).toContain("overlapping leave request");
  });

  it("只有运营人员能够批准或拒绝请假", () => {
    expect(sql).toContain("if not public.is_operations()");
    expect(sql).toContain("p_decision not in ('approved','rejected')");
    expect(sql).toContain("reviewed_by=auth.uid()");
  });

  it("批准后的请假会阻止重叠派单并向后台暴露既有冲突数", () => {
    expect(sql).toContain("dispatch_respects_approved_leave");
    expect(sql).toContain("driver has approved leave during task");
    expect(sql).toContain("conflicting_tasks bigint");
    expect(sql).toContain("status='approved'");
  });
});
