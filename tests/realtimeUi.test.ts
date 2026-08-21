import { describe, expect, it } from "vitest";
import { remoteChatAvailability } from "../src/shared/services/realtimeAccess";

describe("Trip Room 实时消息状态门", () => {
  it("冻结或关闭房间始终禁止发送", () => {
    expect(remoteChatAvailability("frozen", "connected")).toEqual({
      enabled: false,
      reason: "群组尚未开放",
    });
    expect(remoteChatAvailability("closed", "connected")).toEqual({
      enabled: false,
      reason: "群组已关闭",
    });
  });

  it("开放房间仅在实时连接正常时允许发送", () => {
    expect(remoteChatAvailability("open", "connecting")).toEqual({
      enabled: false,
      reason: "实时连接中",
    });
    expect(remoteChatAvailability("open", "disconnected")).toEqual({
      enabled: false,
      reason: "实时连接中断",
    });
    expect(remoteChatAvailability("open", "connected")).toEqual({
      enabled: true,
      reason: "可以发送",
    });
  });
});
