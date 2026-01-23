// Lightweight DB helper: tries to initialize Prisma client if available.
let prisma: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  // optional: connect immediately in dev
  if (typeof prisma.$connect === 'function') prisma.$connect().catch(() => {});
} catch (e) {
  prisma = null;
}

export { prisma };
