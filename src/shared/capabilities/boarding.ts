export type BoardingStatus =
  | "valid"
  | "used"
  | "expired"
  | "revoked"
  | "wrong-vehicle";
export type BoardingCredential = { token: string; expiresAt: string };
export type BoardingVerification = {
  status: BoardingStatus;
  boardingId: string | null;
  verifiedAt: string;
};
type StoredCredential = {
  boardingId: string;
  vehicleGroupId: string;
  expiresAt: number;
  revoked: boolean;
  usedAt: number | null;
};

export interface BoardingTokenProtector {
  generate(): string;
  digest(token: string): Promise<string>;
}
export class WebCryptoBoardingTokenProtector implements BoardingTokenProtector {
  generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return `bp_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  async digest(token: string) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
}

export interface BoardingVerificationEndpoint {
  verify(input: {
    token: string;
    vehicleGroupId: string;
    idempotencyKey: string;
    now?: number;
  }): Promise<BoardingVerification>;
}

export class LocalBoardingService implements BoardingVerificationEndpoint {
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly attempts = new Map<
    string,
    { fingerprint: string; result: BoardingVerification }
  >();
  constructor(
    private readonly tokenProtector: BoardingTokenProtector = new WebCryptoBoardingTokenProtector(),
  ) {}
  async issue(input: {
    boardingId: string;
    vehicleGroupId: string;
    expiresAt: number;
  }): Promise<BoardingCredential> {
    if (input.expiresAt <= Date.now()) throw new Error("登车凭证有效期无效");
    const token = this.tokenProtector.generate();
    const digest = await this.tokenProtector.digest(token);
    this.credentials.set(digest, { ...input, revoked: false, usedAt: null });
    return { token, expiresAt: new Date(input.expiresAt).toISOString() };
  }
  async revoke(token: string) {
    const item = this.credentials.get(await this.tokenProtector.digest(token));
    if (item) item.revoked = true;
  }
  async verify(input: {
    token: string;
    vehicleGroupId: string;
    idempotencyKey: string;
    now?: number;
  }) {
    const digest = await this.tokenProtector.digest(input.token);
    const fingerprint = `${digest}:${input.vehicleGroupId}`;
    const prior = this.attempts.get(input.idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("登车幂等键参数不一致");
      return prior.result;
    }
    const now = input.now ?? Date.now();
    const item = this.credentials.get(digest);
    let status: BoardingStatus;
    if (!item || item.revoked) status = "revoked";
    else if (item.expiresAt <= now) status = "expired";
    else if (item.vehicleGroupId !== input.vehicleGroupId)
      status = "wrong-vehicle";
    else if (item.usedAt !== null) status = "used";
    else {
      status = "valid";
      item.usedAt = now;
    }
    const result = {
      status,
      boardingId:
        status === "valid" || status === "used"
          ? (item?.boardingId ?? null)
          : null,
      verifiedAt: new Date(now).toISOString(),
    };
    this.attempts.set(input.idempotencyKey, { fingerprint, result });
    return result;
  }
}

export class UnavailableBoardingEndpoint
  implements BoardingVerificationEndpoint
{
  async verify() {
    return {
      status: "revoked" as const,
      boardingId: null,
      verifiedAt: new Date().toISOString(),
    };
  }
}
