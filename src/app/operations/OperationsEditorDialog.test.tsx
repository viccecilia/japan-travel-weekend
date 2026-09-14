import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationsEditorDialog } from "./OperationsEditorDialog";

describe("运营后台共用大弹窗", () => {
  it("显示固定结构并允许保存按钮关联正文表单", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    render(
      <OperationsEditorDialog title="编辑车辆" onClose={vi.fn()} footer={<button form="vehicle-form">保存</button>}>
        <form id="vehicle-form"><input aria-label="车牌" /></form>
      </OperationsEditorDialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-size", "resource");
    expect(screen.getByRole("button", { name: "保存" })).toHaveAttribute("form", "vehicle-form");
  });

  it("有未保存修改时阻止直接关闭", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    const close = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <OperationsEditorDialog title="编辑人员" dirty onClose={close} footer={null}>
        <input aria-label="姓名" />
      </OperationsEditorDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭编辑人员" }));
    expect(close).not.toHaveBeenCalled();
  });
});
