import { Prisma, type ProjectStatus } from "@prisma/client";

import { dbDateToMonth, monthToDbDate } from "@/lib/api/datetime";
import { ApiError } from "@/lib/api/errors";
import { pageOffset, pagination, type PageInput } from "@/lib/api/pagination";
import { prisma } from "@/lib/prisma";
import type { ProjectQuery, ProjectUpdateInput } from "@/lib/schemas/project";

const projectListSelect = {
  id: true,
  projectCode: true,
  projectName: true,
  projectStatus: true,
  requiredSkills: true,
  unitPriceMinMan: true,
  unitPriceMaxMan: true,
  startMonth: true,
  location: true,
  remoteStyle: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

const projectDetailInclude = {
  sources: { orderBy: { receivedAt: "desc" as const } },
  linkedIntakes: {
    select: {
      id: true,
      receptionId: true,
      projectName: true,
      reviewStatus: true,
      receivedAt: true,
      reviewedAt: true,
      updatedAt: true,
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ProjectInclude;

function presentProject<T extends { startMonth: Date | null; endMonth?: Date | null }>(record: T) {
  return {
    ...record,
    startMonth: dbDateToMonth(record.startMonth),
    ...(Object.hasOwn(record, "endMonth")
      ? { endMonth: dbDateToMonth(record.endMonth ?? null) }
      : {}),
  };
}

const projectSort = {
  "updatedAt:desc": { updatedAt: "desc" },
  "updatedAt:asc": { updatedAt: "asc" },
  "projectName:asc": { projectName: "asc" },
  "projectName:desc": { projectName: "desc" },
  "startMonth:asc": { startMonth: "asc" },
  "startMonth:desc": { startMonth: "desc" },
  "projectCode:asc": { projectCode: "asc" },
  "projectCode:desc": { projectCode: "desc" },
} as const satisfies Record<ProjectQuery["sort"], Prisma.ProjectOrderByWithRelationInput>;

function projectWhere(query: ProjectQuery): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  if (query.q) where.projectName = { contains: query.q, mode: "insensitive" };
  if (query.projectStatus) where.projectStatus = query.projectStatus;
  if (query.startMonth) where.startMonth = monthToDbDate(query.startMonth);
  if (query.location) where.location = { contains: query.location, mode: "insensitive" };
  if (query.requiredSkill) where.requiredSkills = { array_contains: [query.requiredSkill] };
  if (query.preferredSkill) where.preferredSkills = { array_contains: [query.preferredSkill] };
  return where;
}

export async function listProjects(query: ProjectQuery, page: PageInput) {
  const where = projectWhere(query);
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: projectListSelect,
      orderBy: projectSort[query.sort],
      skip: pageOffset(page),
      take: page.pageSize,
    }),
    prisma.project.count({ where }),
  ]);
  return { data: rows.map(presentProject), pagination: pagination(page, total) };
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  if (!project) throw new ApiError("NOT_FOUND");
  return presentProject(project);
}

function projectUpdateData(
  input: ProjectUpdateInput,
  userId: string,
): Prisma.ProjectUncheckedUpdateManyInput {
  const { updatedAt: _updatedAt, startMonth, endMonth, ...fields } = input;
  void _updatedAt;
  return {
    ...fields,
    updatedById: userId,
    ...(startMonth !== undefined
      ? { startMonth: startMonth === null ? null : monthToDbDate(startMonth) }
      : {}),
    ...(endMonth !== undefined
      ? { endMonth: endMonth === null ? null : monthToDbDate(endMonth) }
      : {}),
  };
}

async function throwProjectConflict(id: string, allowed?: ProjectStatus[]): Promise<never> {
  const current = await prisma.project.findUnique({
    where: { id },
    select: { projectStatus: true },
  });
  if (!current) throw new ApiError("NOT_FOUND");
  if (current.projectStatus === "ARCHIVED" || (allowed && !allowed.includes(current.projectStatus))) {
    throw new ApiError("INVALID_STATE_TRANSITION");
  }
  throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
    { field: "updatedAt", reason: "他の利用者により更新されています。" },
  ]);
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
  userId: string,
) {
  const result = await prisma.project.updateMany({
    where: {
      id,
      projectStatus: { not: "ARCHIVED" },
      updatedAt: new Date(input.updatedAt),
    },
    data: projectUpdateData(input, userId),
  });
  if (result.count === 0) await throwProjectConflict(id);
  return getProject(id);
}

export type ProjectAction = "open" | "hold" | "close" | "archive";

export const allowedFromStates: Record<ProjectAction, readonly ProjectStatus[]> = {
  open: ["ON_HOLD", "CLOSED"],
  hold: ["OPEN"],
  close: ["OPEN"],
  archive: ["OPEN", "ON_HOLD", "CLOSED"],
};

const targetState: Record<ProjectAction, ProjectStatus> = {
  open: "OPEN",
  hold: "ON_HOLD",
  close: "CLOSED",
  archive: "ARCHIVED",
};

export function isTransitionAllowed(action: ProjectAction, from: ProjectStatus): boolean {
  return allowedFromStates[action].includes(from);
}

export async function transitionProject(
  id: string,
  action: ProjectAction,
  updatedAt: string,
  userId: string,
  now = new Date(),
) {
  const allowed = [...allowedFromStates[action]];
  const result = await prisma.project.updateMany({
    where: { id, projectStatus: { in: allowed }, updatedAt: new Date(updatedAt) },
    data: {
      projectStatus: targetState[action],
      updatedById: userId,
      ...(action === "archive" ? { archivedAt: now } : {}),
      ...(action === "open" ? { archivedAt: null } : {}),
    },
  });
  if (result.count === 0) await throwProjectConflict(id, allowed);
  return getProject(id);
}
