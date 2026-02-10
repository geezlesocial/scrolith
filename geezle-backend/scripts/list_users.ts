import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({ take: 50 });
  console.log(users.map(u => ({ id: u.id, email: u.email, role: u.role })));
  await prisma.$disconnect();
})();
