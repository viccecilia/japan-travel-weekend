import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useApp } from "../store";
import type {
  OperationsDriver,
  OperationsSnapshot,
  OperationsVehicle,
} from "../../shared/integrations/supabaseOperations";
import { OperationsEditorDialog } from "./OperationsEditorDialog";

type ResourceKind = "staff" | "vehicles" | "requests";
const statusText = (value: string) =>
  ({
    available: "可用",
    unavailable: "暂不可用",
    suspended: "已停用",
    assigned: "已安排",
    in_service: "运行中",
    maintenance: "维修中",
    inactive: "已停用",
    pending: "待审核",
    approved: "已批准",
    rejected: "已拒绝",
    needs_information: "待补资料",
    cancelled: "已取消",
  })[value] ?? value;

export function ResourceCenter({ kind }: { kind: ResourceKind }) {
  const { services } = useApp();
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [editingDriver, setEditingDriver] = useState<OperationsDriver | null>(
    null,
  );
  const [editingVehicle, setEditingVehicle] =
    useState<OperationsVehicle | null>(null);
  const [creatingDriver, setCreatingDriver] = useState(false);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const load = useCallback(async () => {
    if (!services) {
      setError("运营数据服务未配置");
      return;
    }
    setError("");
    const result = await services.operations.loadSnapshot();
    setSnapshot(result.data);
    setError(result.error ?? "");
  }, [services]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!services) {
        if (active) setError("运营数据服务未配置");
        return;
      }
      const result = await services.operations.loadSnapshot();
      if (!active) return;
      setSnapshot(result.data);
      setError(result.error ?? "");
    });
    return () => {
      active = false;
    };
  }, [services]);
  const drivers = useMemo(
    () =>
      snapshot?.drivers.filter((item) =>
        `${item.display_name} ${item.employee_code ?? ""} ${item.private_phone ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ) ?? [],
    [snapshot, query],
  );
  const vehicles = useMemo(
    () =>
      snapshot?.vehicles.filter((item) =>
        `${item.registration_identifier} ${item.model_name ?? ""} ${item.vehicle_type_key}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ) ?? [],
    [snapshot, query],
  );
  const saveDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !editingDriver) return;
    const form = new FormData(event.currentTarget);
    setBusy(editingDriver.id);
    const result = await services.operations.updateDriverResource({
      id: editingDriver.id,
      displayName: String(form.get("displayName")),
      status: String(form.get("status")),
      serviceRole: String(form.get("serviceRole")),
      publicPhone: String(form.get("publicPhone")),
      internalPhone: String(form.get("internalPhone")),
      operationsNote: String(form.get("operationsNote")),
    });
    setBusy("");
    setNotice(
      result.ok ? "司导资料已保存并记录审计。" : `保存失败：${result.error}`,
    );
    if (result.ok) {
      setEditingDriver(null);
      await load();
    }
  };
  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services || !editingVehicle) return;
    const form = new FormData(event.currentTarget);
    setBusy(editingVehicle.id);
    const result = await services.operations.updateFleetVehicle({
      id: editingVehicle.id,
      status: String(form.get("status")),
      color: String(form.get("color")),
      photoUrl: String(form.get("photoUrl")),
      modelName: String(form.get("modelName")),
      inspectionRequired: Boolean(form.get("inspectionRequired")),
      operationsNote: String(form.get("operationsNote")),
      sellableCapacity: Number(form.get("sellableCapacity")),
    });
    setBusy("");
    setNotice(
      result.ok ? "车辆资料已保存并记录审计。" : `保存失败：${result.error}`,
    );
    if (result.ok) {
      setEditingVehicle(null);
      await load();
    }
  };
  const createDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const form = new FormData(event.currentTarget);
    setBusy("create-driver");
    const ok = await services.operations.createDriver({
      displayName: String(form.get("displayName") ?? "").trim(),
      externalDispatchId: String(form.get("externalDispatchId") ?? "").trim(),
      vehicleTypes: form.getAll("vehicleTypes").map(String),
      languages: String(form.get("languages") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      availableFrom: new Date(String(form.get("availableFrom"))).toISOString(),
      availableUntil: new Date(String(form.get("availableUntil"))).toISOString(),
      serviceRole: String(form.get("serviceRole")) as
        | "driver"
        | "guide"
        | "driver_guide",
      publicPhone: String(form.get("publicPhone") ?? "").trim(),
    });
    setBusy("");
    setNotice(ok ? "司导档案已新增并记录审计。" : "新增失败，请检查时间、车型资格、重复档案和运营权限。");
    if (ok) {
      setCreatingDriver(false);
      setEditorDirty(false);
      await load();
    }
  };
  const createVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!services) return;
    const form = new FormData(event.currentTarget);
    setBusy("create-vehicle");
    const ok = await services.operations.createVehicle({
      registration: String(form.get("registration") ?? "").trim(),
      vehicleType: String(form.get("vehicleType") ?? ""),
      externalDispatchId: String(form.get("externalDispatchId") ?? "").trim(),
      publicColor: String(form.get("color") ?? "").trim(),
      publicPhotoUrl: String(form.get("photoUrl") ?? "").trim(),
    });
    setBusy("");
    setNotice(ok ? "车辆档案已新增并记录审计。" : "新增失败，请检查车牌、车型和运营权限。");
    if (ok) {
      setCreatingVehicle(false);
      setEditorDirty(false);
      await load();
    }
  };
  const reviewApplication = async (
    id: string,
    decision: "approved" | "rejected" | "needs_information" | "suspended",
  ) => {
    if (!services) return;
    setBusy(id);
    const result = await services.operations.reviewStaffApplication(
      id,
      decision,
      "由司导与车辆模块处理",
    );
    setBusy("");
    setNotice(result.ok ? "申请状态已更新。" : `处理失败：${result.error}`);
    if (result.ok) await load();
  };
  const reviewLeave = async (id: string, decision: "approved" | "rejected") => {
    if (!services) return;
    setBusy(id);
    const result = await services.operations.reviewStaffLeave(
      id,
      decision,
      "由司导与车辆模块处理",
    );
    setBusy("");
    setNotice(result.ok ? "请假状态已更新。" : `处理失败：${result.error}`);
    if (result.ok) await load();
  };
  const title =
    kind === "staff"
      ? "司导档案"
      : kind === "vehicles"
        ? "车辆档案"
        : "申请审批与出勤请假";
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>STAFF & FLEET</span>
          <h1>{title}</h1>
          <p>
            读取现有正式档案与权限接口；停用记录保留历史，但不进入新的自动安排。
          </p>
        </div>
      </header>
      {notice && (
        <p className="operations-notice" role="status">
          {notice}
        </p>
      )}
      {error ? (
        <div className="operations-error" role="alert">
          <b>读取失败</b>
          <p>{error}</p>
          <button onClick={() => void load()}>重试</button>
        </div>
      ) : !snapshot ? (
        <p role="status">正在读取真实档案…</p>
      ) : (
        <>
          {kind !== "requests" && (
            <section className="operations-section">
              <label>
                搜索姓名、编号、电话、车牌或车型
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <small>
                当前筛选：{kind === "staff" ? drivers.length : vehicles.length}{" "}
                条
              </small>
            </section>
          )}
          {kind === "staff" && (
            <section className="operations-section">
              <header><div><span>人员档案</span><h2>司导列表</h2></div><button type="button" onClick={() => { setEditorDirty(false); setCreatingDriver(true); }}>新增人员</button></header>
              <div className="operations-dispatch-list">
                {drivers.map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>{item.display_name}</b>
                      <span>{statusText(item.status)}</span>
                    </div>
                    <span>
                      {item.employee_code ?? "编号待补"} ·{" "}
                      {item.service_role ?? "职责待补"} ·{" "}
                      {(item.languages ?? []).join(" / ") || "语言待补"}
                    </span>
                    <small>
                      {item.private_phone ?? "内部联系方式待补"} ·{" "}
                      {item.employment_base ?? "营业所待补"}
                    </small>
                    <button onClick={() => { setEditorDirty(false); setEditingDriver(item); }}>
                      编辑司导资料
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {kind === "vehicles" && (
            <section className="operations-section">
              <header><div><span>车辆档案</span><h2>车辆列表</h2></div><button type="button" onClick={() => { setEditorDirty(false); setCreatingVehicle(true); }}>新增车辆</button></header>
              <div className="operations-dispatch-list">
                {vehicles.map((item) => (
                  <article key={item.id}>
                    <div>
                      <b>{item.registration_identifier}</b>
                      <span>{statusText(item.status)}</span>
                    </div>
                    <span>
                      {item.vehicle_type_key} ·{" "}
                      {item.model_name ?? "具体车型待补"} · 实车可售{" "}
                      {item.sellable_capacity} 席
                    </span>
                    <small>
                      {item.inspection_required
                        ? "需要车检，不进入可用车辆"
                        : "车检状态无阻塞"}
                      {item.operations_note ? ` · ${item.operations_note}` : ""}
                    </small>
                    <button onClick={() => { setEditorDirty(false); setEditingVehicle(item); }}>
                      编辑车辆资料
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {kind === "requests" && (
            <>
              <section className="operations-section">
                <header>
                  <div>
                    <span>账号申请</span>
                    <h2>司导资格审批</h2>
                  </div>
                </header>
                <div className="operations-dispatch-list">
                  {(snapshot.staffApplications ?? []).map((item) => (
                    <article key={item.id}>
                      <div>
                        <b>{item.applicantName || "未填写姓名"}</b>
                        <span>{statusText(item.status)}</span>
                      </div>
                      <span>
                        {item.email} · {item.requestedRole}
                      </span>
                      {["pending", "needs_information"].includes(
                        item.status,
                      ) && (
                        <div className="operations-task-actions">
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              void reviewApplication(item.id, "approved")
                            }
                          >
                            批准
                          </button>
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              void reviewApplication(
                                item.id,
                                "needs_information",
                              )
                            }
                          >
                            补充资料
                          </button>
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              void reviewApplication(item.id, "rejected")
                            }
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              <section className="operations-section">
                <header>
                  <div>
                    <span>出勤请假</span>
                    <h2>请假审批</h2>
                  </div>
                </header>
                <div className="operations-dispatch-list">
                  {(snapshot.staffLeaveRequests ?? []).map((item) => (
                    <article key={item.id}>
                      <div>
                        <b>{item.displayName || item.email}</b>
                        <span>{statusText(item.status)}</span>
                      </div>
                      <span>
                        {new Date(item.startsAt).toLocaleString("zh-CN", {
                          timeZone: "Asia/Tokyo",
                        })}{" "}
                        —{" "}
                        {new Date(item.endsAt).toLocaleString("zh-CN", {
                          timeZone: "Asia/Tokyo",
                        })}
                      </span>
                      <small>
                        {item.reason}
                        {item.conflictingTasks
                          ? ` · 冲突任务 ${item.conflictingTasks} 个`
                          : ""}
                      </small>
                      {item.status === "pending" && (
                        <div className="operations-task-actions">
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              void reviewLeave(item.id, "approved")
                            }
                          >
                            批准
                          </button>
                          <button
                            disabled={busy === item.id}
                            onClick={() =>
                              void reviewLeave(item.id, "rejected")
                            }
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
      {editingDriver && (
        <OperationsEditorDialog title="编辑司导资料" eyebrow="STAFF PROFILE" description="公开称呼与联系方式、内部资料分区保存；停用状态不会被自动启用。" dirty={editorDirty} busy={busy === editingDriver.id} onClose={() => { setEditingDriver(null); setEditorDirty(false); }} footer={<div className="operations-task-actions"><button type="button" onClick={() => { setEditingDriver(null); setEditorDirty(false); }}>取消</button><button form="edit-driver-form" disabled={busy === editingDriver.id}>{busy === editingDriver.id ? "正在保存…" : "保存修改"}</button></div>}>
        <form id="edit-driver-form" className="operations-dialog-fields" onChange={() => setEditorDirty(true)} onSubmit={saveDriver}>
          <div className="operations-dialog-section"><h3>档案标识</h3><p>{editingDriver.employee_code ?? "编号待补"} · {editingDriver.employment_base ?? "营业所待补"} · {(editingDriver.languages ?? []).join(" / ") || "语言待补"}</p></div>
          <label>
            显示名
            <input
              name="displayName"
              required
              defaultValue={editingDriver.display_name}
            />
          </label>
          <label>
            状态
            <select name="status" defaultValue={editingDriver.status}>
              <option value="available">可用</option>
              <option value="unavailable">暂不可用</option>
              <option value="suspended">停用</option>
            </select>
          </label>
          <label>
            职责
            <select
              name="serviceRole"
              defaultValue={editingDriver.service_role ?? "driver"}
            >
              <option value="driver">司机</option>
              <option value="guide">导游</option>
              <option value="driver_guide">司兼导</option>
            </select>
          </label>
          <label>
            游客可见电话
            <input
              name="publicPhone"
              defaultValue={editingDriver.public_phone ?? ""}
            />
          </label>
          <label>
            内部电话
            <input
              name="internalPhone"
              defaultValue={editingDriver.private_phone ?? ""}
            />
          </label>
          <label>
            内部备注
            <textarea
              name="operationsNote"
              maxLength={500}
              defaultValue={editingDriver.operations_note ?? ""}
            />
          </label>
        </form>
        </OperationsEditorDialog>
      )}
      {editingVehicle && (
        <OperationsEditorDialog title="编辑车辆资料" eyebrow="FLEET PROFILE" description={`${editingVehicle.registration_identifier} · 实车容量独立于车型默认值保存。`} dirty={editorDirty} busy={busy === editingVehicle.id} onClose={() => { setEditingVehicle(null); setEditorDirty(false); }} footer={<div className="operations-task-actions"><button type="button" onClick={() => { setEditingVehicle(null); setEditorDirty(false); }}>取消</button><button form="edit-vehicle-form" disabled={busy === editingVehicle.id}>{busy === editingVehicle.id ? "正在保存…" : "保存修改"}</button></div>}>
        <form id="edit-vehicle-form" className="operations-dialog-fields" onChange={() => setEditorDirty(true)} onSubmit={saveVehicle}>
          <div className="operations-dialog-section"><h3>车辆标识</h3><p>{editingVehicle.registration_identifier} · 车型代码 {editingVehicle.vehicle_type_key}</p></div>
          <label>
            状态
            <select name="status" defaultValue={editingVehicle.status}>
              <option value="available">可用</option>
              <option value="assigned">已安排</option>
              <option value="in_service">运行中</option>
              <option value="maintenance">维修中</option>
              <option value="inactive">停用</option>
            </select>
          </label>
          <label>
            实车可售座位
            <input
              name="sellableCapacity"
              type="number"
              min="1"
              max="100"
              required
              defaultValue={editingVehicle.sellable_capacity}
            />
          </label>
          <label>
            具体车型
            <input
              name="modelName"
              defaultValue={editingVehicle.model_name ?? ""}
            />
          </label>
          <label>
            公开颜色
            <input
              name="color"
              defaultValue={editingVehicle.public_color ?? ""}
            />
          </label>
          <label>
            公开照片地址
            <input
              name="photoUrl"
              type="url"
              defaultValue={editingVehicle.public_photo_url ?? ""}
            />
          </label>
          <label className="check">
            <input
              name="inspectionRequired"
              type="checkbox"
              defaultChecked={editingVehicle.inspection_required}
            />
            <span>需要车检（保存为可用时服务端应拒绝）</span>
          </label>
          <label>
            内部备注
            <textarea
              name="operationsNote"
              maxLength={500}
              defaultValue={editingVehicle.operations_note ?? ""}
            />
          </label>
        </form>
        </OperationsEditorDialog>
      )}
      {creatingDriver && snapshot && (
        <OperationsEditorDialog title="新增人员档案" eyebrow="NEW STAFF" description="使用现有人员接口建立档案；不会自动创建登录账号或启用推广资格。" dirty={editorDirty} busy={busy === "create-driver"} onClose={() => { setCreatingDriver(false); setEditorDirty(false); }} footer={<div className="operations-task-actions"><button type="button" onClick={() => { setCreatingDriver(false); setEditorDirty(false); }}>取消</button><button form="create-driver-form" disabled={busy === "create-driver"}>{busy === "create-driver" ? "正在保存…" : "新增人员"}</button></div>}>
          <form id="create-driver-form" className="operations-dialog-fields" onChange={() => setEditorDirty(true)} onSubmit={createDriver}>
            <label>显示名<input name="displayName" required /></label>
            <label>外部调度编号<input name="externalDispatchId" /></label>
            <label>职责<select name="serviceRole" defaultValue="driver"><option value="driver">司机</option><option value="guide">导游</option><option value="driver_guide">司兼导</option></select></label>
            <label>游客可见电话<input name="publicPhone" /></label>
            <label>可用开始时间<input name="availableFrom" type="datetime-local" required /></label>
            <label>可用结束时间<input name="availableUntil" type="datetime-local" required /></label>
            <label className="full">服务语言（逗号分隔）<input name="languages" placeholder="zh-CN, ja-JP" /></label>
            <fieldset className="operations-dialog-section"><legend>准驾车型</legend>{snapshot.vehicleTypes.map((type) => <label className="check" key={type.type_key}><input name="vehicleTypes" type="checkbox" value={type.type_key} /><span>{type.label} · 默认 {type.sellable_capacity} 席</span></label>)}</fieldset>
          </form>
        </OperationsEditorDialog>
      )}
      {creatingVehicle && snapshot && (
        <OperationsEditorDialog title="新增车辆档案" eyebrow="NEW VEHICLE" description="新增后保持接口定义的初始状态；实际可售容量可在编辑弹窗中按实车资料调整。" dirty={editorDirty} busy={busy === "create-vehicle"} onClose={() => { setCreatingVehicle(false); setEditorDirty(false); }} footer={<div className="operations-task-actions"><button type="button" onClick={() => { setCreatingVehicle(false); setEditorDirty(false); }}>取消</button><button form="create-vehicle-form" disabled={busy === "create-vehicle"}>{busy === "create-vehicle" ? "正在保存…" : "新增车辆"}</button></div>}>
          <form id="create-vehicle-form" className="operations-dialog-fields" onChange={() => setEditorDirty(true)} onSubmit={createVehicle}>
            <label>完整车牌<input name="registration" required /></label>
            <label>车型<select name="vehicleType" required defaultValue=""><option value="" disabled>选择车型</option>{snapshot.vehicleTypes.map((type) => <option key={type.type_key} value={type.type_key}>{type.label} · 默认 {type.sellable_capacity} 席</option>)}</select></label>
            <label>外部调度编号<input name="externalDispatchId" /></label>
            <label>公开颜色<input name="color" /></label>
            <label className="full">公开照片地址<input name="photoUrl" type="url" /></label>
          </form>
        </OperationsEditorDialog>
      )}
    </main>
  );
}
