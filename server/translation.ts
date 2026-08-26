import type { SupabaseClient } from "@supabase/supabase-js";

export const translationTargets = ["zh-CN", "ja", "en", "vi", "ne"] as const;
export type TranslationTarget = (typeof translationTargets)[number];
export const isTranslationTarget = (value: unknown): value is TranslationTarget => typeof value === "string" && translationTargets.includes(value as TranslationTarget);

export interface TranslationProvider {
  readonly available: boolean;
  readonly name: string;
  translate(input: { text: string; sourceLanguage: string; targetLanguage: TranslationTarget }): Promise<string | null>;
}

export class GoogleCloudTranslationProvider implements TranslationProvider {
  readonly name = "google-cloud-translation-v2";
  readonly available: boolean;
  constructor(private readonly apiKey: string | undefined,enabled: boolean,private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.available = enabled && Boolean(apiKey?.trim());
  }
  async translate(input: { text: string; sourceLanguage: string; targetLanguage: TranslationTarget }) {
    if (!this.available || !input.text.trim() || input.text.length > 2000) return null;
    const response = await this.fetcher(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.apiKey!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: input.text, target: input.targetLanguage, format: "text", ...(input.sourceLanguage !== "und" ? { source: input.sourceLanguage } : {}) }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
    return body.data?.translations?.[0]?.translatedText?.trim() || null;
  }
}

type TranslationContext={message_id:string;source_content:string;source_language:string;cached_translation:string|null};
export class SupabaseMessageTranslationGateway {
  constructor(private readonly client: SupabaseClient | null) {}
  async context(accountId:string,messageId:string,targetLanguage:TranslationTarget):Promise<TranslationContext|null>{if(!this.client)return null;const {data,error}=await this.client.rpc('get_message_translation_context',{p_account:accountId,p_message:messageId,p_target_language:targetLanguage}).maybeSingle();return error?null:data as TranslationContext|null}
  async store(messageId:string,targetLanguage:TranslationTarget,content:string,provider:string){if(!this.client)return false;const {error}=await this.client.rpc('store_message_translation',{p_message:messageId,p_target_language:targetLanguage,p_content:content,p_provider:provider});return !error}
}

export async function translateVehicleMessage(input:{accountId:string;messageId:string;targetLanguage:TranslationTarget},gateway:SupabaseMessageTranslationGateway,provider:TranslationProvider){const context=await gateway.context(input.accountId,input.messageId,input.targetLanguage);if(!context)return {status:403 as const,body:{error:'translation_not_allowed'}};if(context.cached_translation)return {status:200 as const,body:{translated:true,cached:true}};if(!provider.available)return {status:503 as const,body:{error:'translation_unavailable'}};const translated=await provider.translate({text:context.source_content,sourceLanguage:context.source_language,targetLanguage:input.targetLanguage});if(!translated)return {status:502 as const,body:{error:'translation_failed'}};if(!await gateway.store(context.message_id,input.targetLanguage,translated,provider.name))return {status:500 as const,body:{error:'translation_store_failed'}};return {status:200 as const,body:{translated:true,cached:false}}}
