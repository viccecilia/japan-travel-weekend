import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA API navigation boundary", () => {
  it("keeps API routes out of the SPA navigation fallback", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain("navigateFallbackDenylist");
    expect(config).toContain("/^\\/api(?:\\/|$)/");
    expect(config).toContain("/^\\/api-test(?:\\/|$)/");
  });
});
