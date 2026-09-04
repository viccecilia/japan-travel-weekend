export const MINIMUM_AUTOMATIC_DISPATCH_PASSENGERS = 4;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type DepartureLifecycle = {
  bookingClosesAt: string;
  chatOpensAt: string;
  requiresManualReview: boolean;
};

/**
 * Sales close exactly 24 hours before departure. The team room opens at
 * 12:00 Japan time on the calendar day before departure.
 */
export function getDepartureLifecycle(
  departsAt: string | Date,
  bookedPassengers = 0,
): DepartureLifecycle {
  const departure = departsAt instanceof Date ? departsAt : new Date(departsAt);
  if (Number.isNaN(departure.getTime())) throw new RangeError("出发时间无效");
  if (!Number.isInteger(bookedPassengers) || bookedPassengers < 0)
    throw new RangeError("报名人数必须为非负整数");

  const bookingClosesAt = new Date(
    departure.getTime() - 24 * 60 * 60 * 1000,
  );
  const japanClock = new Date(departure.getTime() + JST_OFFSET_MS);
  const chatOpensAt = new Date(
    Date.UTC(
      japanClock.getUTCFullYear(),
      japanClock.getUTCMonth(),
      japanClock.getUTCDate() - 1,
      3,
    ),
  );
  return {
    bookingClosesAt: bookingClosesAt.toISOString(),
    chatOpensAt: chatOpensAt.toISOString(),
    requiresManualReview:
      bookedPassengers < MINIMUM_AUTOMATIC_DISPATCH_PASSENGERS,
  };
}

export function lifecycleStatus(
  now: string | Date,
  lifecycle: Pick<DepartureLifecycle, "bookingClosesAt" | "chatOpensAt">,
) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new RangeError("当前时间无效");
  return {
    salesClosed: current.getTime() >= new Date(lifecycle.bookingClosesAt).getTime(),
    chatOpen: current.getTime() >= new Date(lifecycle.chatOpensAt).getTime(),
  };
}
