export type StaffLeave = {
  starts_at: string;
  ends_at: string;
  status: string;
};

export type LeaveCoverage = "none" | "partial" | "full";
export type TaskLeaveConflict = "none" | "conflict" | "unknown";

const instant = (value: string) => new Date(value).getTime();

export function intervalsOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return instant(firstStart) < instant(secondEnd) && instant(firstEnd) > instant(secondStart);
}

export function tokyoDayBounds(day: string) {
  const start = new Date(`${day}T00:00:00+09:00`);
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

export function leaveCoverageForDay(day: string, leaves: StaffLeave[]): LeaveCoverage {
  const { startsAt, endsAt } = tokyoDayBounds(day);
  const approved = leaves.filter(
    (leave) =>
      leave.status === "approved" &&
      intervalsOverlap(startsAt, endsAt, leave.starts_at, leave.ends_at),
  );
  if (!approved.length) return "none";
  const ranges = approved
    .map((leave) => ({
      start: Math.max(instant(startsAt), instant(leave.starts_at)),
      end: Math.min(instant(endsAt), instant(leave.ends_at)),
    }))
    .sort((a, b) => a.start - b.start);
  let coveredUntil = instant(startsAt);
  for (const range of ranges) {
    if (range.start > coveredUntil) return "partial";
    coveredUntil = Math.max(coveredUntil, range.end);
    if (coveredUntil >= instant(endsAt)) return "full";
  }
  return "partial";
}

export function taskLeaveConflict(
  startsAt: string | null,
  endsAt: string | null | undefined,
  leaves: StaffLeave[],
): TaskLeaveConflict {
  if (!startsAt) return "unknown";
  const relevant = leaves.filter(
    (leave) => leave.status === "approved" && instant(leave.ends_at) > instant(startsAt),
  );
  if (!endsAt) return relevant.length ? "unknown" : "none";
  return relevant.some((leave) =>
    intervalsOverlap(startsAt, endsAt, leave.starts_at, leave.ends_at),
  )
    ? "conflict"
    : "none";
}
