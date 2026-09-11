import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("班次参数打开真实运行详情而不是只高亮列表行", async () => {
    const loadRunBoard = vi.fn(async () => ({ data: [{
      departureId:"dep-11",tripTitle:"京都红叶一日游",departsAt:"2026-09-11T08:30:00+09:00",
      departureStatus:"published",vehicleGroupId:"vehicle-1",vehicleLabel:"大阪 500 あ 12-34",
      driverName:"测试司导",capacity:9,bookedSeats:6,arrived:5,boarded:4,journeyStatus:"boarding",
      currentStop:"京都站八条口",openIncidents:1,lastEventAt:"2026-09-11T08:20:00+09:00",
    }], error: null }));
    const services = {
      operations: { loadRunBoard, loadDriverStatistics:vi.fn(async()=>({data:[],error:null})) },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {}, currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(<MemoryRouter initialEntries={["/app/operations/run?date=2026-09-11&departure=dep-11"]}><AppProvider services={services}><RunCenter /></AppProvider></MemoryRouter>);

    expect(await screen.findByRole("heading",{name:"班次运行详情"})).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"京都红叶一日游"})).toBeInTheDocument();
    expect(screen.getByText("6 / 9")).toBeInTheDocument();
    expect(screen.getByText("5 / 4")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"编辑班次安排"})).toHaveAttribute("href","/app/operations/departures?date=2026-09-11&departure=dep-11");
    expect(screen.queryByText("本月司导运载统计")).not.toBeInTheDocument();
  });
});
