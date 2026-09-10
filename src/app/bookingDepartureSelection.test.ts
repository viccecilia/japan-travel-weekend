import { describe, expect, it } from "vitest";
import type { Departure } from "../shared/types";
import { groupDeparturesByMonth, resolveDepartureSelection } from "./bookingDepartureSelection";

const departure = (id: string, departureTime: string): Departure => ({
  id,
  tripSlug: "kyoto-nara-classic",
  dateLabel: departureTime,
  weekend: "稍后",
  status: "可预订",
  departureTime,
  expectedEndTime: null,
  price: 7000,
  availableSeats: 5,
  meetingPointName: "Osaka",
  meetingAddress: null,
  meetingCoordinates: null,
  arrivalInstructions: { transit: null, walking: null, driving: null },
  meetingPhoto: null,
  meetingPhotoStatus: "待确认",
  mapStatus: "未连接",
  inventoryStatus: "权威库存",
  isSeed: false,
});

describe("departure selection", () => {
  it("waits for async inventory before judging a deep link", () => {
    expect(resolveDepartureSelection({ requestedId: "second", selectedId: "", departures: [], resolved: false })).toEqual({ selectedId: "", invalidRequested: false });
    expect(resolveDepartureSelection({ requestedId: "second", selectedId: "", departures: [departure("first", "2026-09-11T00:00:00Z"), departure("second", "2026-09-12T00:00:00Z")], resolved: true })).toEqual({ selectedId: "second", invalidRequested: false });
  });

  it("allows a manual selection after an invalid deep link", () => {
    expect(resolveDepartureSelection({ requestedId: "missing", selectedId: "valid", departures: [departure("valid", "2026-09-12T00:00:00Z")], resolved: true })).toEqual({ selectedId: "valid", invalidRequested: false });
  });

  it("groups multiple departures on one day and labels cross-month inventory", () => {
    const grouped = groupDeparturesByMonth([
      departure("a", "2026-09-30T00:00:00Z"),
      departure("b", "2026-09-30T03:00:00Z"),
      departure("c", "2026-10-01T00:00:00Z"),
    ], "zh-CN");
    expect(grouped).toHaveLength(2);
    expect(grouped[0].days.find((day) => day.key === "2026-09-30")?.departures.map((item) => item.id)).toEqual(["a", "b"]);
    expect(grouped.map((item) => item.label)).toEqual(["2026年9月", "2026年10月"]);
  });
});
