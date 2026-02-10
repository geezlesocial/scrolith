const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  const u = await prisma.user.findUnique({ where: { email: 'admin@local' } });
  console.log('keys:', Object.keys(u || {}));
  console.log(u);
  await prisma.$disconnect();
})();
