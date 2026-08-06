import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  projectIntake: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  project: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  projectSource: { updateMany: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectIntake: database.projectIntake,
    project: database.project,
    projectSource: database.projectSource,
    $transaction: database.transaction,
  },
}));

import {
  createProjectFromIntake,
  mergeIntake,
  nextProjectCode,
  updateIntake,
} from "@/lib/services/intake-service";
import {
  isTransitionAllowed,
  updateProject,
  type ProjectAction,
} from "@/lib/services/project-service";
import { mergeIntakeSchema } from "@/lib/schemas/intake";

const transactionClient = {
  projectIntake: database.projectIntake,
  project: database.project,
  projectSource: database.projectSource,
};

const pendingIntake = {
  id: "11111111-1111-4111-8111-111111111111",
  projectName: "Test Project",
  location: "Tokyo",
  reviewStatus: "PENDING",
};

function expectApiError(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ name: "ApiError", code });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.transaction.mockImplementation(
    (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
});

describe("C. optimistic locking", () => {
  it("returns NOT_FOUND when an intake update target does not exist", async () => {
    database.projectIntake.updateMany.mockResolvedValue({ count: 0 });
    database.projectIntake.findUnique.mockResolvedValue(null);

    await expectApiError(
      updateIntake(pendingIntake.id, { updatedAt: "2026-08-06T00:00:00.000Z" }),
      "NOT_FOUND",
    );
  });

  it("returns INTAKE_ALREADY_PROCESSED when the intake is no longer pending", async () => {
    database.projectIntake.updateMany.mockResolvedValue({ count: 0 });
    database.projectIntake.findUnique.mockResolvedValue({ reviewStatus: "REVIEWED" });

    await expectApiError(
      updateIntake(pendingIntake.id, { updatedAt: "2026-08-06T00:00:00.000Z" }),
      "INTAKE_ALREADY_PROCESSED",
    );
  });

  it("returns OPTIMISTIC_LOCK_CONFLICT for a stale pending intake", async () => {
    database.projectIntake.updateMany.mockResolvedValue({ count: 0 });
    database.projectIntake.findUnique.mockResolvedValue({ reviewStatus: "PENDING" });

    await expectApiError(
      updateIntake(pendingIntake.id, { updatedAt: "2026-08-06T00:00:00.000Z" }),
      "OPTIMISTIC_LOCK_CONFLICT",
    );
  });

  it("rejects PATCH for an archived project", async () => {
    database.project.updateMany.mockResolvedValue({ count: 0 });
    database.project.findUnique.mockResolvedValue({ projectStatus: "ARCHIVED" });

    await expectApiError(
      updateProject(
        "22222222-2222-4222-8222-222222222222",
        { updatedAt: "2026-08-06T00:00:00.000Z", location: "Osaka" },
        "user-id",
      ),
      "INVALID_STATE_TRANSITION",
    );
  });

  const expected: Record<ProjectAction, readonly string[]> = {
    open: ["ON_HOLD", "CLOSED"],
    hold: ["OPEN"],
    close: ["OPEN"],
    archive: ["OPEN", "ON_HOLD", "CLOSED"],
  };
  const actions: ProjectAction[] = ["open", "hold", "close", "archive"];
  const states = ["OPEN", "ON_HOLD", "CLOSED", "ARCHIVED"] as const;

  it.each(actions.flatMap((action) => states.map((state) => [action, state] as const)))(
    "%s transition from %s follows the matrix",
    (action, state) => {
      expect(isTransitionAllowed(action, state)).toBe(expected[action].includes(state));
    },
  );
});

describe("D. project_code allocation", () => {
  it("starts at 0001 when there is no record for the JST day", () => {
    expect(nextProjectCode(new Date("2026-08-05T15:30:00.000Z"), null)).toBe(
      "PRJ-20260806-0001",
    );
  });

  it("increments the latest sequence", () => {
    expect(
      nextProjectCode(
        new Date("2026-08-06T00:00:00.000Z"),
        "PRJ-20260806-0007",
      ),
    ).toBe("PRJ-20260806-0008");
  });

  it("uses the JST date even when UTC is still the previous day", () => {
    expect(nextProjectCode(new Date("2026-08-05T15:00:00.000Z"), null)).toContain(
      "PRJ-20260806-",
    );
  });

  it("returns PROJECT_CODE_EXHAUSTED after 9999", () => {
    expect(() =>
      nextProjectCode(
        new Date("2026-08-06T00:00:00.000Z"),
        "PRJ-20260806-9999",
      ),
    ).toThrowError(expect.objectContaining({ code: "PROJECT_CODE_EXHAUSTED" }));
  });

  it("retries a P2002 and succeeds on the next allocation", async () => {
    database.transaction
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "project-id", startMonth: null, endMonth: null });

    await expect(
      createProjectFromIntake(
        pendingIntake.id,
        { updatedAt: "2026-08-06T00:00:00.000Z", projectStatus: "OPEN" },
        "user-id",
      ),
    ).resolves.toMatchObject({ id: "project-id" });
    expect(database.transaction).toHaveBeenCalledTimes(2);
  });

  it("returns INTERNAL_ERROR after three P2002 failures", async () => {
    database.transaction.mockRejectedValue({ code: "P2002" });

    await expectApiError(
      createProjectFromIntake(
        pendingIntake.id,
        { updatedAt: "2026-08-06T00:00:00.000Z", projectStatus: "OPEN" },
        "user-id",
      ),
      "INTERNAL_ERROR",
    );
    expect(database.transaction).toHaveBeenCalledTimes(3);
  });
});

describe("E. merge", () => {
  const input = {
    updatedAt: "2026-08-06T00:00:00.000Z",
    targetProjectId: "22222222-2222-4222-8222-222222222222",
    targetProjectUpdatedAt: "2026-08-06T00:00:00.000Z",
    applyFields: ["location"] as const,
  };

  it("reports targetProjectUpdatedAt on a target project lock conflict", async () => {
    database.projectIntake.findFirst.mockResolvedValue(pendingIntake);
    database.project.updateMany.mockResolvedValue({ count: 0 });
    database.project.findUnique.mockResolvedValue({ projectStatus: "OPEN" });

    await expect(mergeIntake(pendingIntake.id, { ...input, applyFields: ["location"] }, "user-id"))
      .rejects.toMatchObject({
        code: "OPTIMISTIC_LOCK_CONFLICT",
        details: [{ field: "targetProjectUpdatedAt" }],
      });
  });

  it("rejects an archived target project", async () => {
    database.projectIntake.findFirst.mockResolvedValue(pendingIntake);
    database.project.updateMany.mockResolvedValue({ count: 0 });
    database.project.findUnique.mockResolvedValue({ projectStatus: "ARCHIVED" });

    await expectApiError(
      mergeIntake(pendingIntake.id, { ...input, applyFields: ["location"] }, "user-id"),
      "INVALID_STATE_TRANSITION",
    );
  });

  it("updates the source and marks the intake MERGED when applyFields is empty", async () => {
    database.projectIntake.findFirst.mockResolvedValue(pendingIntake);
    database.project.findFirst.mockResolvedValue({ id: input.targetProjectId });
    database.projectSource.updateMany.mockResolvedValue({ count: 1 });
    database.projectIntake.updateMany.mockResolvedValue({ count: 1 });
    database.projectIntake.findUnique.mockResolvedValue({
      id: pendingIntake.id,
      startMonth: null,
      endMonth: null,
      source: null,
      linkedProject: null,
    });

    await mergeIntake(pendingIntake.id, { ...input, applyFields: [] }, "user-id");

    expect(database.project.updateMany).not.toHaveBeenCalled();
    expect(database.projectSource.updateMany).toHaveBeenCalledWith({
      where: { projectIntakeId: pendingIntake.id },
      data: { projectId: input.targetProjectId },
    });
    expect(database.projectIntake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewStatus: "MERGED" }) }),
    );
  });

  it("rejects an applyFields value outside the allowlist", () => {
    expect(() =>
      mergeIntakeSchema.parse({ ...input, applyFields: ["rawText"] }),
    ).toThrowError(expect.objectContaining({ name: "ZodError" }));
  });
});
