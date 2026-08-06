import type { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { ApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
};

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !user.role) throw new ApiError("AUTH_REQUIRED");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new ApiError("FORBIDDEN");
  return user;
}

export async function requireWriteRole(
  ...roles: UserRole[]
): Promise<SessionUser> {
  const sessionUser = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user) throw new ApiError("AUTH_REQUIRED");
  if (!user.isActive || !roles.includes(user.role)) {
    throw new ApiError("FORBIDDEN");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
