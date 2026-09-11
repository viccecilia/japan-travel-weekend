import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DepartureCenter } from "../src/app/operations/DepartureCenter";
import { RunCenter } from "../src/app/operations/RunCenter";
import { AppProvider } from "../src/app/store";
import type { ProductionBrowserServices } from "../src/shared/backend/productionServices";

afterEach(() => cleanup());

describe("运营筛选参数行为", () => {
  it("班次页把 URL 中的日本服务日期传给数据库查询", async () => {
    const listEditableDepartures = vi.fn(async () => ({ data: [], error: null }));
    const services = {
      operations: {
        listProducts: vi.fn(async () => ({ data: [], error: null })),
        listEditableDepartures,
      },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(
      <MemoryRouter initialEntries={["/app/operations/departures?date=2026-09-11"]}>
        <AppProvider services={services}><DepartureCenter /></AppProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(listEditableDepartures).toHaveBeenCalled());
    expect(listEditableDepartures).toHaveBeenLastCalledWith(
      "2026-09-11T00:00:00+09:00",
      "2026-09-11T23:59:59+09:00",
    );
  });

  it("每日运行台使用 URL 日期加载班次和司导统计", async () => {
    const loadRunBoard = vi.fn(async () => ({ data: [], error: null }));
    const loadDriverStatistics = vi.fn(async () => ({ data: [], error: null }));
    const services = {
      operations: { loadRunBoard, loadDriverStatistics },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(
      <MemoryRouter initialEntries={["/app/operations/run?date=2026-09-11"]}>
        <AppProvider services={services}><RunCenter /></AppProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadRunBoard).toHaveBeenCalledWith("2026-09-11"));
    expect(loadDriverStatistics).toHaveBeenCalledWith("2026-09-01", "2026-09-11");
  });
});
