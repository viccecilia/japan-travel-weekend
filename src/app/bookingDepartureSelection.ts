import type { Departure } from "../shared/types";

export type DepartureDay = { key: string; departures: Departure[] };
export type DepartureMonth = { key: string; label: string; days: DepartureDay[] };

const tokyoDateKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export function groupDeparturesByMonth(
  departures: Departure[],
  locale: string,
): DepartureMonth[] {
  const months = new Map<string, Map<string, Departure[]>>();
  for (const departure of departures) {
    if (!departure.departureTime) continue;
    const dayKey = tokyoDateKey(departure.departureTime);
    const monthKey = dayKey.slice(0, 7);
    const days = months.get(monthKey) ?? new Map<string, Departure[]>();
    days.set(dayKey, [...(days.get(dayKey) ?? []), departure]);
    months.set(monthKey, days);
  }
  return [...months.entries()].map(([key, days]) => ({
    key,
    label: new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
    }).format(new Date(`${key}-15T12:00:00+09:00`)),
    days: [...days.entries()].map(([dayKey, values]) => ({
      key: dayKey,
      departures: values.sort(
        (a, b) =>
          new Date(a.departureTime!).getTime() - new Date(b.departureTime!).getTime(),
      ),
    })),
  }));
}

export function resolveDepartureSelection(input: {
  requestedId: string | null;
  selectedId: string;
  departures: Departure[];
  resolved: boolean;
}) {
  if (!input.resolved) return { selectedId: input.selectedId, invalidRequested: false };
  const available = (id: string | null) =>
    Boolean(id && input.departures.some((item) => item.id === id));
  if (available(input.selectedId)) {
    return { selectedId: input.selectedId, invalidRequested: false };
  }
  if (input.requestedId) {
    return available(input.requestedId)
      ? { selectedId: input.requestedId, invalidRequested: false }
      : { selectedId: "", invalidRequested: true };
  }
  const first = input.departures.find(
    (item) => item.price != null && item.availableSeats !== 0,
  );
  return { selectedId: first?.id ?? "", invalidRequested: false };
}
