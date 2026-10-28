import { PrismaClient } from '@prisma/client';

// Standard Next.js-safe singleton: avoids exhausting MySQL connections from
// hot-reloaded dev server instances.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
