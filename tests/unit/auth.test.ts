import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepository = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: userRepository },
}));

import { authorizeUser } from "@/auth";

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
