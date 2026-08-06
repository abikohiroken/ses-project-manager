import { Prisma, type ProjectIntake } from "@prisma/client";

import {
  dbDateToMonth,
  jstDateKey,
  monthToDbDate,
  rangeEnd,
  rangeStart,
} from "@/lib/api/datetime";
import { ApiError } from "@/lib/api/errors";
import { pageOffset, pagination, type PageInput } from "@/lib/api/pagination";
import { prisma } from "@/lib/prisma";
import type {
  CreateProjectInput,
  IntakeQuery,
  IntakeUpdateInput,
  MergeIntakeInput,
} from "@/lib/schemas/intake";

const intakeListSelect = {
  id: true,
  receptionId: true,
  projectName: true,
  unitPriceMinMan: true,
  unitPriceMaxMan: true,
  startMonth: true,
  location: true,
  warningCodes: true,
  reviewStatus: true,
  receivedAt: true,
  updatedAt: true,
  source: { select: { sourceCompany: true } },
} satisfies Prisma.ProjectIntakeSelect;

const intakeDetailInclude = {
  source: true,
  linkedProject: {
    select: { id: true, projectCode: true, projectName: true, projectStatus: true, updatedAt: true },
  },
} satisfies Prisma.ProjectIntakeInclude;

type IntakeListRecord = Prisma.ProjectIntakeGetPayload<{ select: typeof intakeListSelect }>;
type IntakeDetailRecord = Prisma.ProjectIntakeGetPayload<{ include: typeof intakeDetailInclude }>;

function presentIntake<T extends { startMonth: Date | null; endMonth?: Date | null }>(record: T) {
  return {
    ...record,
    startMonth: dbDateToMonth(record.startMonth),
    ...(Object.hasOwn(record, "endMonth")
      ? { endMonth: dbDateToMonth(record.endMonth ?? null) }
      : {}),
  };
}

function presentIntakeList(record: IntakeListRecord) {
  const { source, ...item } = record;
  return {
    ...presentIntake(item),
    sourceCompany: source?.sourceCompany ?? null,
  };
}

function presentIntakeDetail(record: IntakeDetailRecord) {
  return presentIntake(record);
}

const intakeSort = {
  "receivedAt:desc": { receivedAt: "desc" },
  "receivedAt:asc": { receivedAt: "asc" },
  "updatedAt:desc": { updatedAt: "desc" },
  "updatedAt:asc": { updatedAt: "asc" },
  "projectName:asc": { projectName: "asc" },
  "projectName:desc": { projectName: "desc" },
  "startMonth:asc": { startMonth: "asc" },
  "startMonth:desc": { startMonth: "desc" },
} as const satisfies Record<IntakeQuery["sort"], Prisma.ProjectIntakeOrderByWithRelationInput>;

function intakeWhere(query: IntakeQuery): Prisma.ProjectIntakeWhereInput {
  const where: Prisma.ProjectIntakeWhereInput = { reviewStatus: query.reviewStatus };
  if (query.q) where.projectName = { contains: query.q, mode: "insensitive" };
  if (query.hasWarning !== undefined) {
    where.warningCodes = query.hasWarning ? { not: [] } : { equals: [] };
  }
  if (query.sourceCompany) {
    where.source = {
      is: { sourceCompany: { contains: query.sourceCompany, mode: "insensitive" } },
    };
  }
  if (query.receivedFrom || query.receivedTo) {
    where.receivedAt = {
      ...(query.receivedFrom ? { gte: rangeStart(query.receivedFrom) } : {}),
      ...(query.receivedTo ? { lte: rangeEnd(query.receivedTo) } : {}),
    };
  }
  if (query.startMonth) where.startMonth = monthToDbDate(query.startMonth);
  return where;
}

export async function listIntakes(query: IntakeQuery, page: PageInput) {
  const where = intakeWhere(query);
  const [rows, total] = await Promise.all([
    prisma.projectIntake.findMany({
      where,
      select: intakeListSelect,
      orderBy: intakeSort[query.sort],
      skip: pageOffset(page),
      take: page.pageSize,
    }),
    prisma.projectIntake.count({ where }),
  ]);
  return { data: rows.map(presentIntakeList), pagination: pagination(page, total) };
}

export async function getIntake(id: string) {
  const intake = await prisma.projectIntake.findUnique({
    where: { id },
    include: intakeDetailInclude,
  });
  if (!intake) throw new ApiError("NOT_FOUND");
  return presentIntakeDetail(intake);
}

function intakeUpdateData(input: IntakeUpdateInput): Prisma.ProjectIntakeUpdateManyMutationInput {
  const { updatedAt: _updatedAt, startMonth, endMonth, ...fields } = input;
  void _updatedAt;
  return {
    ...fields,
    ...(startMonth !== undefined
      ? { startMonth: startMonth === null ? null : monthToDbDate(startMonth) }
      : {}),
    ...(endMonth !== undefined
      ? { endMonth: endMonth === null ? null : monthToDbDate(endMonth) }
      : {}),
  };
}

async function throwIntakeConflict(id: string): Promise<never> {
  const current = await prisma.projectIntake.findUnique({
    where: { id },
    select: { reviewStatus: true },
  });
  if (!current) throw new ApiError("NOT_FOUND");
  if (current.reviewStatus !== "PENDING") {
    throw new ApiError("INTAKE_ALREADY_PROCESSED");
  }
  throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
    { field: "updatedAt", reason: "他の利用者により更新されています。" },
  ]);
}

export async function updateIntake(id: string, input: IntakeUpdateInput) {
  const result = await prisma.projectIntake.updateMany({
    where: { id, reviewStatus: "PENDING", updatedAt: new Date(input.updatedAt) },
    data: intakeUpdateData(input),
  });
  if (result.count === 0) await throwIntakeConflict(id);
  return getIntake(id);
}

export function nextProjectCode(now: Date, latestCode: string | null): string {
  const dateKey = jstDateKey(now);
  const prefix = `PRJ-${dateKey}-`;
  const latestNumber = latestCode?.startsWith(prefix)
    ? Number(latestCode.slice(prefix.length))
    : 0;
  if (latestNumber >= 9999) throw new ApiError("PROJECT_CODE_EXHAUSTED");
  return `${prefix}${String(latestNumber + 1).padStart(4, "0")}`;
}

function isPrismaCode(error: unknown, codes: string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

function projectDataFromIntake(
  intake: ProjectIntake,
  projectCode: string,
  userId: string,
): Prisma.ProjectUncheckedCreateInput {
  const projectName = intake.projectName?.trim();
  if (!projectName) {
    throw new ApiError("VALIDATION_ERROR", [
      { field: "projectName", reason: "案件名を入力してください。" },
    ]);
  }
  return {
    projectCode,
    projectName,
    projectSummary: intake.projectSummary,
    requiredSkills: intake.requiredSkills as Prisma.InputJsonValue,
    preferredSkills: intake.preferredSkills as Prisma.InputJsonValue,
    role: intake.role,
    process: intake.process,
    projectStatus: "OPEN",
    unitPriceMinMan: intake.unitPriceMinMan,
    unitPriceMaxMan: intake.unitPriceMaxMan,
    settlementRange: intake.settlementRange,
    startMonth: intake.startMonth,
    endMonth: intake.endMonth,
    workDaysPerWeek: intake.workDaysPerWeek,
    location: intake.location,
    nearestStation: intake.nearestStation,
    remoteStyle: intake.remoteStyle,
    remoteNote: intake.remoteNote,
    recruitmentCount: intake.recruitmentCount,
    commercialFlow: intake.commercialFlow,
    interviewCount: intake.interviewCount,
    foreignerAllowed: intake.foreignerAllowed,
    ageLimit: intake.ageLimit,
    nationalityNote: intake.nationalityNote,
    employmentCondition: intake.employmentCondition,
    createdById: userId,
    updatedById: userId,
  };
}

export async function createProjectFromIntake(
  id: string,
  input: CreateProjectInput,
  userId: string,
  now = new Date(),
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const project = await prisma.$transaction(
        async (tx) => {
          const updatedAt = new Date(input.updatedAt);
          const intake = await tx.projectIntake.findFirst({
            where: { id, reviewStatus: "PENDING", updatedAt },
          });
          if (!intake) {
            const current = await tx.projectIntake.findUnique({
              where: { id },
              select: { reviewStatus: true },
            });
            if (!current) throw new ApiError("NOT_FOUND");
            if (current.reviewStatus !== "PENDING") {
              throw new ApiError("INTAKE_ALREADY_PROCESSED");
            }
            throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
              { field: "updatedAt", reason: "他の利用者により更新されています。" },
            ]);
          }

          const prefix = `PRJ-${jstDateKey(now)}-`;
          const latest = await tx.project.findFirst({
            where: { projectCode: { startsWith: prefix } },
            orderBy: { projectCode: "desc" },
            select: { projectCode: true },
          });
          const projectCode = nextProjectCode(now, latest?.projectCode ?? null);
          const created = await tx.project.create({
            data: projectDataFromIntake(intake, projectCode, userId),
          });
          await tx.projectSource.updateMany({
            where: { projectIntakeId: id },
            data: { projectId: created.id },
          });
          const completed = await tx.projectIntake.updateMany({
            where: { id, reviewStatus: "PENDING", updatedAt },
            data: {
              reviewStatus: "REVIEWED",
              linkedProjectId: created.id,
              reviewedAt: now,
              reviewedById: userId,
            },
          });
          if (completed.count === 0) {
            throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
              { field: "updatedAt", reason: "他の利用者により更新されています。" },
            ]);
          }
          return created;
        },
        { isolationLevel: "Serializable" },
      );
      return presentIntake(project);
    } catch (error) {
      if (isPrismaCode(error, ["P2002", "P2034"]) && attempt < 3) continue;
      if (isPrismaCode(error, ["P2002", "P2034"])) {
        throw new ApiError("INTERNAL_ERROR");
      }
      throw error;
    }
  }
  throw new ApiError("INTERNAL_ERROR");
}

function mergeProjectData(
  intake: ProjectIntake,
  input: MergeIntakeInput,
  userId: string,
): Prisma.ProjectUncheckedUpdateManyInput {
  const data: Prisma.ProjectUncheckedUpdateManyInput = { updatedById: userId };
  for (const field of input.applyFields) {
    switch (field) {
      case "projectName":
        if (intake.projectName !== null) data.projectName = intake.projectName;
        break;
      case "projectSummary":
        data.projectSummary = intake.projectSummary;
        break;
      case "requiredSkills":
        data.requiredSkills = intake.requiredSkills as Prisma.InputJsonValue;
        break;
      case "preferredSkills":
        data.preferredSkills = intake.preferredSkills as Prisma.InputJsonValue;
        break;
      case "role":
        data.role = intake.role;
        break;
      case "process":
        data.process = intake.process;
        break;
      case "unitPriceMinMan":
        data.unitPriceMinMan = intake.unitPriceMinMan;
        break;
      case "unitPriceMaxMan":
        data.unitPriceMaxMan = intake.unitPriceMaxMan;
        break;
      case "settlementRange":
        data.settlementRange = intake.settlementRange;
        break;
      case "startMonth":
        data.startMonth = intake.startMonth;
        break;
      case "endMonth":
        data.endMonth = intake.endMonth;
        break;
      case "workDaysPerWeek":
        data.workDaysPerWeek = intake.workDaysPerWeek;
        break;
      case "location":
        data.location = intake.location;
        break;
      case "nearestStation":
        data.nearestStation = intake.nearestStation;
        break;
      case "remoteStyle":
        data.remoteStyle = intake.remoteStyle;
        break;
      case "remoteNote":
        data.remoteNote = intake.remoteNote;
        break;
      case "recruitmentCount":
        data.recruitmentCount = intake.recruitmentCount;
        break;
      case "commercialFlow":
        data.commercialFlow = intake.commercialFlow;
        break;
      case "interviewCount":
        data.interviewCount = intake.interviewCount;
        break;
      case "foreignerAllowed":
        data.foreignerAllowed = intake.foreignerAllowed;
        break;
      case "ageLimit":
        data.ageLimit = intake.ageLimit;
        break;
      case "nationalityNote":
        data.nationalityNote = intake.nationalityNote;
        break;
      case "employmentCondition":
        data.employmentCondition = intake.employmentCondition;
        break;
    }
  }
  return data;
}

async function throwTargetProjectConflict(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<never> {
  const current = await tx.project.findUnique({
    where: { id },
    select: { projectStatus: true },
  });
  if (!current) throw new ApiError("NOT_FOUND");
  if (current.projectStatus === "ARCHIVED") {
    throw new ApiError("INVALID_STATE_TRANSITION");
  }
  throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
    { field: "targetProjectUpdatedAt", reason: "他の利用者により更新されています。" },
  ]);
}

export async function mergeIntake(
  id: string,
  input: MergeIntakeInput,
  userId: string,
  now = new Date(),
) {
  await prisma.$transaction(async (tx) => {
    const intakeUpdatedAt = new Date(input.updatedAt);
    const intake = await tx.projectIntake.findFirst({
      where: { id, reviewStatus: "PENDING", updatedAt: intakeUpdatedAt },
    });
    if (!intake) {
      const current = await tx.projectIntake.findUnique({
        where: { id },
        select: { reviewStatus: true },
      });
      if (!current) throw new ApiError("NOT_FOUND");
      if (current.reviewStatus !== "PENDING") {
        throw new ApiError("INTAKE_ALREADY_PROCESSED");
      }
      throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
        { field: "updatedAt", reason: "他の利用者により更新されています。" },
      ]);
    }

    const targetWhere = {
      id: input.targetProjectId,
      updatedAt: new Date(input.targetProjectUpdatedAt),
      projectStatus: { not: "ARCHIVED" as const },
    };
    if (input.applyFields.length > 0) {
      const result = await tx.project.updateMany({
        where: targetWhere,
        data: mergeProjectData(intake, input, userId),
      });
      if (result.count === 0) {
        await throwTargetProjectConflict(tx, input.targetProjectId);
      }
    } else {
      const target = await tx.project.findFirst({ where: targetWhere, select: { id: true } });
      if (!target) await throwTargetProjectConflict(tx, input.targetProjectId);
    }

    await tx.projectSource.updateMany({
      where: { projectIntakeId: id },
      data: { projectId: input.targetProjectId },
    });
    const completed = await tx.projectIntake.updateMany({
      where: { id, reviewStatus: "PENDING", updatedAt: intakeUpdatedAt },
      data: {
        reviewStatus: "MERGED",
        linkedProjectId: input.targetProjectId,
        reviewedAt: now,
        reviewedById: userId,
      },
    });
    if (completed.count === 0) {
      throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
        { field: "updatedAt", reason: "他の利用者により更新されています。" },
      ]);
    }
  });
  return getIntake(id);
}

export async function rejectIntake(
  id: string,
  updatedAt: string,
  userId: string,
  now = new Date(),
) {
  const result = await prisma.projectIntake.updateMany({
    where: { id, reviewStatus: "PENDING", updatedAt: new Date(updatedAt) },
    data: {
      reviewStatus: "REJECTED",
      linkedProjectId: null,
      reviewedAt: now,
      reviewedById: userId,
    },
  });
  if (result.count === 0) await throwIntakeConflict(id);
  return getIntake(id);
}
