import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { pageOffset, pagination, type PageInput } from "@/lib/api/pagination";
import { prisma } from "@/lib/prisma";
import type { UserCreateInput, UserQuery, UserUpdateInput } from "@/lib/schemas/user";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userSort = {
  "email:asc": { email: "asc" },
  "email:desc": { email: "desc" },
  "name:asc": { name: "asc" },
  "name:desc": { name: "desc" },
  "createdAt:desc": { createdAt: "desc" },
  "createdAt:asc": { createdAt: "asc" },
  "lastLoginAt:desc": { lastLoginAt: "desc" },
} as const satisfies Record<UserQuery["sort"], Prisma.UserOrderByWithRelationInput>;

function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function listUsers(query: UserQuery, page: PageInput) {
  const where: Prisma.UserWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: userSort[query.sort],
      skip: pageOffset(page),
      take: page.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { data: users, pagination: pagination(page, total) };
}

export async function createUser(input: UserCreateInput) {
  try {
    return await prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        role: input.role,
      },
      select: userSelect,
    });
  } catch (error) {
    if (isP2002(error)) throw new ApiError("DUPLICATE_USER_EMAIL");
    throw error;
  }
}

export async function updateUser(id: string, input: UserUpdateInput) {
  return prisma.$transaction(
    async (tx) => {
      const result = await tx.user.updateMany({
        where: { id, updatedAt: new Date(input.updatedAt) },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (result.count === 0) {
        const current = await tx.user.findUnique({ where: { id }, select: { id: true } });
        if (!current) throw new ApiError("NOT_FOUND");
        throw new ApiError("OPTIMISTIC_LOCK_CONFLICT", [
          { field: "updatedAt", reason: "他の利用者により更新されています。" },
        ]);
      }

      const activeAdminCount = await tx.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdminCount === 0) {
        throw new ApiError("INVALID_STATE_TRANSITION", [
          { field: "role", reason: "最後の有効なADMINは降格・無効化できません。" },
        ]);
      }

      const user = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!user) throw new ApiError("NOT_FOUND");
      return user;
    },
    { isolationLevel: "Serializable" },
  );
}
