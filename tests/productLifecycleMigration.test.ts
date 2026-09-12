import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/202609100113_product_lifecycle.sql","utf8");
const ui=readFileSync("src/app/operations/ProductCenter.tsx","utf8");

describe("产品全生命周期",()=>{
  it("新建、复制、下架和历史恢复均通过运营权限 RPC",()=>{
    expect(sql).toContain("operations_create_product");
    expect(sql).toContain("operations_copy_product");
    expect(sql).toContain("operations_set_product_status");
    expect((sql.match(/public\.is_operations\(\)/g)??[]).length).toBeGreaterThanOrEqual(3);
  });
  it("历史恢复生成新草稿而不篡改原版本",()=>{
    expect(sql).toMatch(/p_action='restore'[\s\S]*insert into public\.product_revisions/);
    expect(sql).toContain("current_draft_revision_id=v_new_id");
  });
  it("运营界面提供真实生命周期动作",()=>{
    const edit=readFileSync("src/app/operations/ProductEditPage.tsx","utf8");
    for(const label of ["新建产品草稿","复制","下架产品","恢复为新草稿","发布草稿"])expect(ui+edit).toContain(label);
  });
});
