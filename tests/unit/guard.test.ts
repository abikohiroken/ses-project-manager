import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: dependencies.getServerSession,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: dependencies.findUnique } },
}));

import {
  requireRole,
  requireSession,
  requireWriteRole,
} from "@/lib/api/guard";

function expectApiError(
  promise: Promise<unknown>,
  code: "AUTH_REQUIRED" | "FORBIDDEN",
) {
  return expect(promise).rejects.toMatchObject({
    name: "ApiError",
    code,
  });
}

const jwtAdmin = {
  id: "session-user-id",
  name: "JWT Admin",
  email: "jwt-admin@example.com",
  role: "ADMIN",
};

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["no session", null],
    ["missing user id", { user: { role: "ADMIN" } }],
    ["missing user role", { user: { id: "session-user-id" } }],
  ])("throws AUTH_REQUIRED for %s", async (_label, session) => {
    dependencies.getServerSession.mockResolvedValue(session);

    await expectApiError(requireSession(), "AUTH_REQUIRED");
  });

  it("returns the complete session user", async () => {
    dependencies.getServerSession.mockResolvedValue({ user: jwtAdmin });

    await expect(requireSession()).resolves.toEqual(jwtAdmin);
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getServerSession.mockResolvedValue({ user: jwtAdmin });
  });

  it("throws FORBIDDEN when the session role is not allowed", async () => {
    await expectApiError(requireRole("OPERATOR"), "FORBIDDEN");
  });

  it("returns the session user when the role is allowed", async () => {
    await expect(requireRole("ADMIN", "OPERATOR")).resolves.toEqual(jwtAdmin);
  });
});

describe("requireWriteRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getServerSession.mockResolvedValue({ user: jwtAdmin });
  });

  it("throws FORBIDDEN when JWT is ADMIN but the database user is inactive", async () => {
    dependencies.findUnique.mockResolvedValue({
      id: jwtAdmin.id,
      name: "Inactive Admin",
      email: "inactive@example.com",
      role: "ADMIN",
      isActive: false,
    });

    await expectApiError(
      requireWriteRole("ADMIN", "OPERATOR"),
      "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when JWT is ADMIN but the database role was downgraded", async () => {
    dependencies.findUnique.mockResolvedValue({
      id: jwtAdmin.id,
      name: "Downgraded User",
      email: "downgraded@example.com",
      role: "VIEWER",
      isActive: true,
    });

    await expectApiError(
      requireWriteRole("ADMIN", "OPERATOR"),
      "FORBIDDEN",
    );
  });

  it("throws AUTH_REQUIRED when the database user no longer exists", async () => {
    dependencies.findUnique.mockResolvedValue(null);

    await expectApiError(
      requireWriteRole("ADMIN", "OPERATOR"),
      "AUTH_REQUIRED",
    );
  });

  it("returns database values instead of stale JWT values", async () => {
    dependencies.getServerSession.mockResolvedValue({
      user: { ...jwtAdmin, role: "VIEWER" },
    });
    dependencies.findUnique.mockResolvedValue({
      id: jwtAdmin.id,
      name: "Current DB Admin",
      email: "current-admin@example.com",
      role: "ADMIN",
      isActive: true,
    });

    await expect(requireWriteRole("ADMIN", "OPERATOR")).resolves.toEqual({
      id: jwtAdmin.id,
      name: "Current DB Admin",
      email: "current-admin@example.com",
      role: "ADMIN",
    });
    expect(dependencies.findUnique).toHaveBeenCalledWith({
      where: { id: jwtAdmin.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  });
});
