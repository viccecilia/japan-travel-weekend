/** Informational only: does not create a checklist, status or execution prerequisite. */
export function VehicleInspectionPlaceholder(){
  return <section className="staff-profile-card" aria-labelledby="vehicle-inspection-heading">
    <h2 id="vehicle-inspection-heading">车辆 / 出库检查</h2>
    <p>此功能尚未接入，当前仅为入口占位，不影响查看任务、集合或行程操作。</p>
    <p>请继续按现有线下检查规范执行；这里不记录或表示“检查已通过”。</p>
  </section>;
}
