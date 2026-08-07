import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

function matchesProxy(pathname: string): boolean {
  const source = config.matcher[0];
  return new RegExp(`^${source}$`).test(pathname);
}

describe("proxy matcher", () => {
  it.each([
    "/api/internal/google-drive-import",
    "/api/internal/drive-move-retry",
    "/api/internal/import-reconcile",
  ])("excludes the Cron internal API %s", (pathname) => {
    expect(matchesProxy(pathname)).toBe(false);
  });

  it("excludes the LINE webhook", () => {
    expect(matchesProxy("/api/webhooks/line")).toBe(false);
  });

  it.each(["/api/projects", "/project-intakes"])(
    "keeps the authenticated route %s behind proxy",
    (pathname) => {
      expect(matchesProxy(pathname)).toBe(true);
    },
  );
});
