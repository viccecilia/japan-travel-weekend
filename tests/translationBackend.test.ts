import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GoogleCloudTranslationProvider, translateVehicleMessage, type TranslationProvider } from "../server/translation";

const migration=readFileSync('supabase/migrations/202608260020_chat_translation_preferences.sql','utf8');

describe("本车聊天翻译后端",()=>{
  it("数据库按本人偏好和本车成员资格隔离译文",()=>{
    expect(migration).toContain('own_chat_translation_preference');
    expect(migration).toContain('public.can_receive_vehicle_group(r.vehicle_group_id)');
    expect(migration).toMatch(/revoke all on function public\.get_message_translation_context[\s\S]*from public,anon,authenticated/);
    expect(migration).toMatch(/current_user not in \('service_role','postgres'\)/);
    expect(migration).toContain("target_language in ('zh-CN','ja','en','vi','ne')");
  });

  it("未明确启用或没有服务器密钥时不调用外部翻译",async()=>{
    const fetcher=vi.fn();
    const provider=new GoogleCloudTranslationProvider('test-key',false,fetcher);
    expect(provider.available).toBe(false);
    await expect(provider.translate({text:'hello',sourceLanguage:'en',targetLanguage:'ja'})).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("非本车请求被拒，缓存命中不重复计费",async()=>{
    const denied={context:vi.fn(async()=>null),store:vi.fn()};
    const provider={available:true,name:'test',translate:vi.fn()} satisfies TranslationProvider;
    await expect(translateVehicleMessage({accountId:'a',messageId:'m',targetLanguage:'ja'},denied as never,provider)).resolves.toMatchObject({status:403});
    const cached={context:vi.fn(async()=>({message_id:'m',source_content:'你好',source_language:'zh-CN',cached_translation:'こんにちは'})),store:vi.fn()};
    await expect(translateVehicleMessage({accountId:'a',messageId:'m',targetLanguage:'ja'},cached as never,provider)).resolves.toEqual({status:200,body:{translated:true,cached:true}});
    expect(provider.translate).not.toHaveBeenCalled();
  });
});
