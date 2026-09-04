import { describe, expect, it } from "vitest";
import { preferredChatLanguage, staffTemplateTranslations, templateTranslation } from "../src/shared/services/chatTranslation";

describe("聊天翻译语言与重要模板", () => {
  it("按手机首选语言选择目标，并对不支持语言回退英文", () => {
    expect(preferredChatLanguage(["ja-JP", "en-US"])).toBe("ja");
    expect(preferredChatLanguage(["zh-Hant-TW"])).toBe("zh-TW");
    expect(preferredChatLanguage(["vi-VN"])).toBe("vi");
    expect(preferredChatLanguage(["ne-NP"])).toBe("ne");
    expect(preferredChatLanguage(["fr-FR"])).toBe("en");
  });

  it("八种重要模板都有五语非空内容，中文不重复显示译文", () => {
    expect(Object.keys(staffTemplateTranslations)).toHaveLength(8);
    for (const translations of Object.values(staffTemplateTranslations)) {
      expect(Object.keys(translations)).toEqual(expect.arrayContaining(["zh-CN", "zh-TW", "ja", "en", "vi", "ne"]));
      expect(Object.values(translations).every(value => value.trim().length > 0)).toBe(true);
    }
    expect(templateTranslation("vehicle_arrived", "ja")).toContain("車両");
    expect(templateTranslation("vehicle_arrived", "zh-CN")).toBeNull();
  });
});
