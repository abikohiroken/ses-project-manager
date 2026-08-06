import { loadEnvFile } from "node:process";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function loadLocalEnv(): void {
  try {
    loadEnvFile();
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  const rawEmail = process.env.INITIAL_ADMIN_EMAIL;
  const rawName = process.env.INITIAL_ADMIN_NAME;
  if (!rawEmail?.trim() || !rawName?.trim()) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required to seed the database.");

  const email = rawEmail.trim().toLowerCase();
  const name = rawName.trim();
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.user.upsert({
      where: { email },
      create: { email, name, role: "ADMIN" },
      update: { name },
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Failed to seed the initial administrator.");
  process.exitCode = 1;
});
