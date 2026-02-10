const prisma = require('./src/utils/prismaClient').default;
(async () => {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true, role: true, isActive: true, passwordHash: true } });
  console.log(admins.map(a => ({ ...a, passwordHash: a.passwordHash ? 'set' : null })));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
