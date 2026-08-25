import { describe, expect, it } from "vitest";
import { GoogleMapsAdapter } from "../src/shared/integrations/googleMaps";
import { driverLocationNavigationUrl } from "../src/shared/capabilities/locationLinks";
import { LocalBoardingService } from "../src/shared/capabilities/boarding";
import {
  NotificationDispatcher,
  notificationTemplates,
  type NotificationDeliveryProvider,
} from "../src/shared/capabilities/notifications";
import { verifyBoardingRequest } from "../server/api/boarding";

describe("地图正式降级能力", () => {
  it("无需 API key 即可为已确认坐标生成步行导航 URL", () => {
    const adapter = new GoogleMapsAdapter(undefined);
    expect(adapter.connected).toBe(false);
    expect(adapter.navigationUrl({ lat: 34.6937, lng: 135.5023 })).toContain(
      "travelmode=walking",
    );
    expect(adapter.navigationUrl(null)).toBeNull();
    expect(adapter.navigationUrl({ lat: 999, lng: 135 })).toBeNull();
  });
  it("司机位置必须同时满足真实坐标、有效行程和本车权限", () => {
    const valid = {
      coordinates: { lat: 34.6, lng: 135.5 },
      tripActive: true,
      sameVehicleGroup: true,
      viewerRole: "passenger" as const,
    };
    expect(driverLocationNavigationUrl(valid)).toContain("google.com/maps/dir");
    expect(
      driverLocationNavigationUrl({ ...valid, coordinates: null }),
    ).toBeNull();
    expect(
      driverLocationNavigationUrl({ ...valid, tripActive: false }),
    ).toBeNull();
    expect(
      driverLocationNavigationUrl({ ...valid, sameVehicleGroup: false }),
    ).toBeNull();
  });
});

describe("安全登车核验", () => {
  it("凭证不包含订单或个人字段，并支持一次性、幂等和车辆隔离", async () => {
    const service = new LocalBoardingService();
    const credential = await service.issue({
      boardingId: "boarding-internal-1",
      vehicleGroupId: "vehicle-1",
      expiresAt: Date.now() + 60000,
    });
    expect(credential.token).not.toContain("boarding-internal-1");
    expect(credential.token).not.toMatch(/@|phone|order/i);
    const first = await service.verify({
      token: credential.token,
      vehicleGroupId: "vehicle-1",
      idempotencyKey: "scan-1",
    });
    expect(first.status).toBe("valid");
    expect(
      await service.verify({
        token: credential.token,
        vehicleGroupId: "vehicle-1",
        idempotencyKey: "scan-1",
      }),
    ).toEqual(first);
    expect(
      (
        await service.verify({
          token: credential.token,
          vehicleGroupId: "vehicle-1",
          idempotencyKey: "scan-2",
        })
      ).status,
    ).toBe("used");
    await expect(
      service.verify({
        token: credential.token,
        vehicleGroupId: "vehicle-2",
        idempotencyKey: "scan-1",
      }),
    ).rejects.toThrow("幂等键参数不一致");
  });
  it("只存 SHA-256 摘要，原始令牌具备 256 位随机量且不会被结果或错误回显", async () => {
    const service = new LocalBoardingService();
    const issued = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.issue({
          boardingId: `internal-${index}`,
          vehicleGroupId: "private-group",
          expiresAt: Date.now() + 60000,
        }),
      ),
    );
    const tokens = issued.map((item) => item.token);
    expect(new Set(tokens).size).toBe(20);
    for (const token of tokens) {
      expect(token).toMatch(/^bp_[0-9a-f]{64}$/);
      expect(token).not.toMatch(/internal|private-group|order|email|phone|@/i);
    }
    const maps = Object.values(
      service as unknown as Record<string, unknown>,
    ).filter((value): value is Map<unknown, unknown> => value instanceof Map);
    const serializedInternalState = JSON.stringify(
      maps.map((map) => [...map.entries()]),
    );
    for (const token of tokens) expect(serializedInternalState).not.toContain(token);
    const result = await service.verify({
      token: tokens[0],
      vehicleGroupId: "private-group",
      idempotencyKey: "secure-scan",
    });
    expect(JSON.stringify(result)).not.toContain(tokens[0]);
    let message = "";
    try {
      await service.verify({
        token: tokens[1],
        vehicleGroupId: "private-group",
        idempotencyKey: "secure-scan",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("登车幂等键参数不一致");
    for (const token of tokens) expect(message).not.toContain(token);
  });
  it("覆盖过期、撤销、错误车辆和工作人员授权边界", async () => {
    const service = new LocalBoardingService();
    const wrong = await service.issue({
      boardingId: "b1",
      vehicleGroupId: "v1",
      expiresAt: Date.now() + 60000,
    });
    expect(
      (
        await service.verify({
          token: wrong.token,
          vehicleGroupId: "v2",
          idempotencyKey: "wrong",
        })
      ).status,
    ).toBe("wrong-vehicle");
    const revoked = await service.issue({
      boardingId: "b2",
      vehicleGroupId: "v1",
      expiresAt: Date.now() + 60000,
    });
    await service.revoke(revoked.token);
    expect(
      (
        await service.verify({
          token: revoked.token,
          vehicleGroupId: "v1",
          idempotencyKey: "revoked",
        })
      ).status,
    ).toBe("revoked");
    const expired = await service.issue({
      boardingId: "b3",
      vehicleGroupId: "v1",
      expiresAt: Date.now() + 10,
    });
    expect(
      (
        await service.verify({
          token: expired.token,
          vehicleGroupId: "v1",
          idempotencyKey: "expired",
          now: Date.now() + 20,
        })
      ).status,
    ).toBe("expired");
    await expect(
      verifyBoardingRequest(
        {
          accessToken: "session",
          token: wrong.token,
          vehicleGroupId: "v1",
          idempotencyKey: "api",
        },
        { authorizer: { canScan: async () => false }, endpoint: service },
      ),
    ).rejects.toThrow("无权核验");
  });
});

describe("通知契约", () => {
  it("覆盖全部履约事件模板", () => {
    expect(Object.keys(notificationTemplates)).toEqual([
      "order-confirmed",
      "bank-transfer-pending",
      "meeting-updated",
      "trip-room-opened",
      "departure-reminder",
      "departure-delayed",
      "boarding-completed",
      "checkin-reminder",
      "passenger-contact-escalation",
    ]);
  });
  it("provider 缺失 fail closed、尊重偏好且成功投递幂等", async () => {
    const input = {
      eventId: "event-1",
      event: "order-confirmed" as const,
      recipientId: "account-1",
      data: { orderNumber: "JT-1" },
      necessaryForFulfilment: true,
      preference: { marketing: false, channels: [] },
    };
    expect(
      await new NotificationDispatcher(null).dispatch(input),
    ).toMatchObject({ accepted: false, reason: "provider-unavailable" });
    const optional = {
      ...input,
      eventId: "event-optional",
      necessaryForFulfilment: false,
    };
    expect(
      await new NotificationDispatcher(null).dispatch(optional),
    ).toMatchObject({ accepted: false, reason: "preference-disabled" });
    const records: string[] = [];
    const provider: NotificationDeliveryProvider = {
      available: true,
      deliver: async (request) => {
        records.push(request.eventId);
        return { externalId: "local-only" };
      },
    };
    const dispatcher = new NotificationDispatcher(provider);
    expect((await dispatcher.dispatch(input)).accepted).toBe(true);
    expect((await dispatcher.dispatch(input)).reason).toBe("duplicate");
    expect(records).toEqual(["event-1"]);
  });
});
