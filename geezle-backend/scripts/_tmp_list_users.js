const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.user.findMany({ select: { id: true, email: true, isActive: true, passwordHash: true, role: true } });
  console.log(rows);
  await p.$disconnect();
})();
