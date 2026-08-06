import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: database.user, $transaction: database.transaction },
}));

import { createUser, listUsers, updateUser } from "@/lib/services/user-service";

beforeEach(() => {
  vi.clearAllMocks();
  database.transaction.mockImplementation(
    (callback: (tx: { user: typeof database.user }) => Promise<unknown>) =>
      callback({ user: database.user }),
  );
});

describe("F. user management", () => {
  it("rejects disabling or downgrading the last active ADMIN", async () => {
    database.user.updateMany.mockResolvedValue({ count: 1 });
    database.user.count.mockResolvedValue(0);

    await expect(
      updateUser("admin-id", {
        updatedAt: "2026-08-06T00:00:00.000Z",
        role: "VIEWER",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("maps duplicate email creation to DUPLICATE_USER_EMAIL", async () => {
    database.user.create.mockRejectedValue({ code: "P2002", meta: { target: ["email"] } });

    await expect(
      createUser({ email: " duplicate@example.com ", name: "Duplicate", role: "VIEWER" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_USER_EMAIL", status: 409 });
  });

  it("returns okList-ready pagination, email ascending, and inactive users by default", async () => {
    const users = [
      { id: "a", email: "a@example.com", isActive: true },
      { id: "b", email: "b@example.com", isActive: false },
    ];
    database.user.findMany.mockResolvedValue(users);
    database.user.count.mockResolvedValue(2);

    const result = await listUsers(
      { sort: "email:asc" },
      { page: 1, pageSize: 50 },
    );

    expect(result).toEqual({
      data: users,
      pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    });
    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { email: "asc" } }),
    );
    expect(result.data.some((user) => user.isActive === false)).toBe(true);
  });
});
