import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_SECRET: "test-auth-secret",
  AUTH_GOOGLE_ID: "test-google-id",
  AUTH_GOOGLE_SECRET: "test-google-secret",
  APP_URL: "https://ses.example.jp",
  NEXTAUTH_URL: "https://ses.example.jp",
};

describe("environment validation", () => {
  it("accepts the Phase 1 required variables", () => {
    expect(parseEnv(validEnv)).toMatchObject(validEnv);
  });

  it.each(Object.keys(validEnv))(
    "rejects a missing required variable: %s",
    (key) => {
      const input = { ...validEnv } as Record<string, string | undefined>;
      delete input[key];
      expect(() => parseEnv(input)).toThrow();
    },
  );

  it("requires NEXTAUTH_URL to match APP_URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXTAUTH_URL: "https://other.example.jp" }),
    ).toThrow();
  });
});
