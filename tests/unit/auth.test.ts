import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

const userRepository = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: userRepository },
}));

import { authOptions, authorizeUser } from "@/auth";

const jwtCallback = authOptions.callbacks?.jwt;
const sessionCallback = authOptions.callbacks?.session;
if (!jwtCallback || !sessionCallback) {
  throw new Error("Auth callbacks are not configured.");
}
const configuredSessionCallback = sessionCallback;

async function invokeSessionCallback(session: Session, token: JWT) {
  return configuredSessionCallback({
    session,
    token,
    user: {
      id: "adapter-user-id",
      name: null,
      email: "adapter@example.com",
      emailVerified: null,
    },
    newSession: null,
    trigger: "update",
  });
}

describe("authorizeUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a profile without an email address", async () => {
    await expect(authorizeUser(undefined)).resolves.toBe(false);
    expect(userRepository.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unregistered email address", async () => {
    userRepository.findUnique.mockResolvedValue(null);

    await expect(authorizeUser(" New.User@Example.COM ")).resolves.toBe(
      "/login?error=NOT_REGISTERED",
    );
    expect(userRepository.findUnique).toHaveBeenCalledWith({
      where: { email: "new.user@example.com" },
    });
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("rejects an inactive user", async () => {
    userRepository.findUnique.mockResolvedValue({
      id: "inactive-user-id",
      isActive: false,
    });

    await expect(authorizeUser("inactive@example.com")).resolves.toBe(
      "/login?error=INACTIVE",
    );
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("updates lastLoginAt and accepts an active user", async () => {
    userRepository.findUnique.mockResolvedValue({
      id: "active-user-id",
      isActive: true,
    });
    userRepository.update.mockResolvedValue({});

    await expect(authorizeUser("active@example.com")).resolves.toBe(true);
    expect(userRepository.update).toHaveBeenCalledWith({
      where: { id: "active-user-id" },
      data: { lastLoginAt: expect.any(Date) },
    });
  });
});

describe("jwt callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the active database user id and role on initial sign-in", async () => {
    userRepository.findUnique.mockResolvedValue({
      id: "database-user-id",
      email: "registered@example.com",
      name: "Database User",
      role: "OPERATOR",
      isActive: true,
    });

    const token = await jwtCallback({
      token: {},
      user: {
        id: "oauth-user-id",
        name: "OAuth User",
        email: "OAuth.User@Example.COM",
        image: null,
      },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "google-account-id",
      },
      profile: { email: " OAuth.User@Example.COM " },
      trigger: "signIn",
      isNewUser: false,
    });

    expect(userRepository.findUnique).toHaveBeenCalledWith({
      where: { email: "oauth.user@example.com" },
    });
    expect(token).toMatchObject({
      userId: "database-user-id",
      role: "OPERATOR",
      name: "Database User",
      email: "registered@example.com",
    });
  });
});

describe("session callback", () => {
  it("publishes the user id and role stored in the token", async () => {
    const session = {
      user: {
        id: "old-session-user-id",
        role: "VIEWER",
        name: "Session User",
        email: "session@example.com",
        image: null,
      },
      expires: "2099-01-01T00:00:00.000Z",
    } satisfies Session;

    const result = await invokeSessionCallback(session, {
      userId: "token-user-id",
      role: "ADMIN",
    });

    expect(result).toMatchObject({
      user: { id: "token-user-id", role: "ADMIN" },
    });
  });

  it("does not add id or role when token.userId is missing", async () => {
    const session = {
      user: {
        name: "Session User",
        email: "session@example.com",
        image: null,
      },
      expires: "2099-01-01T00:00:00.000Z",
    } as Session;

    const result = await invokeSessionCallback(session, { role: "ADMIN" });

    expect(result.user ?? {}).not.toHaveProperty("id");
    expect(result.user ?? {}).not.toHaveProperty("role");
  });
});
