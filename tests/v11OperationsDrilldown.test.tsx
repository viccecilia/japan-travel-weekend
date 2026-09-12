import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsCenter,
  tokyoPeriodRange,
} from "../src/app/operations/AnalyticsCenter";
import { OrdersCenter } from "../src/app/operations/OrdersCenter";
import { AppProvider } from "../src/app/store";

const snapshot = {
  vehicleTypes: [],
  vehicles: [],
  drivers: [],
  departures: [],
  bookingDrafts: [],
  fulfilmentWorkItems: [],
  notificationDeliveryIssues: [],
  staffApplications: [],
  staffLeaveRequests: [],
  dispatchTasks: [],
  dispatchDrafts: 0,
  cancellationRequests: [],
  loadedAt: "2026-09-12T00:00:00Z",
};

function services(overrides: Record<string, unknown>) {
  return {
    operations: {
      loadSnapshot: vi.fn().mockResolvedValue({ data: snapshot, error: null }),
      loadReferralSummary: vi.fn().mockResolvedValue({
        active: true,
        discountPercent: 10,
        validityDays: 0,
        successfulInvites: 0,
        paidInvitees: 0,
        qualifiedInvites: 0,
        couponCounts: {},
        discountAmountJpy: 0,
        integrity: {
          relationships: 0,
          expectedCoupons: 0,
          actualCoupons: 0,
          missingPairs: 0,
          orphanCoupons: 0,
        },
        alerts: [],
        relations: [],
        unavailableSignals: [],
      }),
      listOrders: vi.fn().mockResolvedValue({ data: [], error: null }),
      ...overrides,
    },
    loadSellableDepartures: vi
      .fn()
      .mockResolvedValue({ data: [], error: null }),
    onAuthStateChange: () => () => undefined,
    currentUser: vi.fn().mockResolvedValue(null),
  } as never;
}

describe("V11 统计日期与订单真实下钻", () => {
  it("经营周期把东京日期范围传给后端快照查询", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValue({ data: snapshot, error: null });
    const appServices = services({ loadSnapshot });
    render(
      <MemoryRouter initialEntries={["/app/operations/analytics?period=year"]}>
        <AppProvider services={appServices}>
          <AnalyticsCenter />
        </AppProvider>
      </MemoryRouter>,
    );
    const range = tokyoPeriodRange("year");
    await waitFor(() =>
      expect(loadSnapshot).toHaveBeenCalledWith(range.from, range.to),
    );
  });

  it("订单深链把日期、状态和订单ID用于查询并显示对应订单", async () => {
    const order = {
      orderId: "ord-20260912",
      createdAt: "2026-09-12T00:00:00Z",
      departureId: "dep-1",
      status: "paid",
      tripTitle: "京都测试路线",
      departsAt: "2026-09-20T00:00:00Z",
      passengerCount: 2,
      seatCount: 2,
      amountJpy: 16000,
      grossAmountJpy: 16000,
      discountAmountJpy: 0,
      refundedAmountJpy: 0,
      referralCode: null,
      vehicleGroupId: "group-1",
      vehicleLabel: "大阪 123",
      driverName: "测试司机",
      refundStatus: null,
    };
    const listOrders = vi
      .fn()
      .mockResolvedValue({ data: [order], error: null });
    const appServices = services({ listOrders });
    render(
      <MemoryRouter
        initialEntries={[
          "/app/operations/orders?from=2026-09-01&to=2026-09-30&status=paid&order=ord-20260912",
        ]}
      >
        <AppProvider services={appServices}>
          <OrdersCenter />
        </AppProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(listOrders).toHaveBeenCalledWith({
        from: "2026-09-01",
        to: "2026-09-30",
        status: "paid",
        orderId: "ord-20260912",
      }),
    );
    await waitFor(() =>
      expect(document.body.textContent).toContain("京都测试路线"),
    );
    expect(document.body.textContent).toContain("大阪 123");
    expect(document.body.textContent).toContain("测试司机");
  });
});
