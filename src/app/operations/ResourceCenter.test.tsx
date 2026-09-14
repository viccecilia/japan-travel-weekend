import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceCenter } from "./ResourceCenter";

const mocks = vi.hoisted(() => {
  const operations = {
    loadSnapshot: vi.fn(),
    updateDriverResource: vi.fn(),
    updateFleetVehicle: vi.fn(),
    createDriver: vi.fn(),
    createVehicle: vi.fn(),
  };
  return { ...operations, services: { operations } };
});

vi.mock("../store", () => ({
  useApp: () => ({ services: mocks.services }),
}));

const snapshot = {
  drivers: [
    {
      id: "driver-1",
      account_id: "account-1",
      display_name: "测试司机",
      status: "available",
      service_role: "driver",
      public_phone: "",
      private_phone: "090-0000-0000",
      operations_note: "",
      employee_code: "D-01",
      employment_base: "大阪",
      languages: ["zh-CN"],
      external_dispatch_id: null,
      driver_vehicle_qualifications: [{ vehicle_type_key: "H" }],
      driver_availability_windows: [],
    },
  ],
  vehicles: [
    {
      id: "vehicle-1",
      registration_identifier: "大阪 100 あ 1234",
      vehicle_type_key: "H",
      status: "available",
      sellable_capacity: 9,
      model_name: "Hiace",
      public_color: "白",
      public_photo_url: null,
      inspection_required: false,
      operations_note: "",
    },
  ],
  vehicleTypes: [{ type_key: "H", label: "海狮", sellable_capacity: 9 }],
  staffApplications: [],
  staffLeaveRequests: [],
};

describe("人员与车辆大弹窗", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
    mocks.loadSnapshot.mockResolvedValue({ data: snapshot, error: null });
    mocks.updateDriverResource.mockResolvedValue({ ok: true, error: null });
  });

  it("从原列表打开人员弹窗，保存成功后重新读取列表", async () => {
    render(<ResourceCenter kind="staff" />);
    fireEvent.click(await screen.findByRole("button", { name: "编辑司导资料" }));
    const name = screen.getByLabelText("显示名");
    fireEvent.change(name, { target: { value: "新显示名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(mocks.updateDriverResource).toHaveBeenCalledWith(expect.objectContaining({ id: "driver-1", displayName: "新显示名" })));
    await waitFor(() => expect(mocks.loadSnapshot).toHaveBeenCalledTimes(2));
  });

  it("保存失败时保留弹窗和已输入内容", async () => {
    mocks.updateDriverResource.mockResolvedValueOnce({ ok: false, error: "版本冲突" });
    render(<ResourceCenter kind="staff" />);
    fireEvent.click(await screen.findByRole("button", { name: "编辑司导资料" }));
    fireEvent.change(screen.getByLabelText("显示名"), { target: { value: "未保存姓名" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(await screen.findByText("保存失败：版本冲突")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("显示名")).toHaveValue("未保存姓名");
  });
});
