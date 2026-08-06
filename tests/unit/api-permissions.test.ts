import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireWriteRole: vi.fn(),
  listIntakes: vi.fn(),
  updateIntake: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/lib/api/guard", () => ({
  requireRole: mocks.requireRole,
  requireWriteRole: mocks.requireWriteRole,
}));
vi.mock("@/lib/services/intake-service", () => ({
  listIntakes: mocks.listIntakes,
  updateIntake: mocks.updateIntake,
  getIntake: vi.fn(),
}));
vi.mock("@/lib/services/user-service", () => ({
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
}));

import { ApiError } from "@/lib/api/errors";
import { GET as getIntakes } from "@/app/api/project-intakes/route";
import { PATCH as patchIntake } from "@/app/api/project-intakes/[id]/route";
import { GET as getUsers } from "@/app/api/users/route";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F. API permissions", () => {
  it("allows VIEWER to use a reference API", async () => {
    mocks.requireRole.mockResolvedValue({ id: "viewer-id", role: "VIEWER" });
    mocks.listIntakes.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    });

    const response = await getIntakes(new Request("http://localhost/api/project-intakes"));

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith("ADMIN", "OPERATOR", "VIEWER");
  });

  it("returns 403 when VIEWER calls a write API", async () => {
    mocks.requireWriteRole.mockRejectedValue(new ApiError("FORBIDDEN"));
    const request = new Request(`http://localhost/api/project-intakes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ updatedAt: "2026-08-06T00:00:00.000Z" }),
    });

    const response = await patchIntake(request, { params: Promise.resolve({ id }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("returns 403 when OPERATOR calls the users API", async () => {
    mocks.requireWriteRole.mockRejectedValue(new ApiError("FORBIDDEN"));

    const response = await getUsers(new Request("http://localhost/api/users"));

    expect(response.status).toBe(403);
    expect(mocks.requireWriteRole).toHaveBeenCalledWith("ADMIN");
  });
});
