import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function main() {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
  // Try common admin emails first
  const candidates = ['admin@local', 'admin@Scrolith.com', 'admin@Scrolith.local'];
  let adminUser = null;
  for (const email of candidates) {
    adminUser = await prisma.user.findUnique({ where: { email } });
    if (adminUser) break;
  }
  if (!adminUser) {
    // fallback to first user with role ADMIN
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } as any });
  }
  if (!adminUser) {
    console.error('No admin user found in DB.');
    process.exit(2);
  }
  const token = jwt.sign({ id: adminUser.id, email: adminUser.email, role: adminUser.role }, JWT_SECRET, { expiresIn: '30d' });
  console.log(token);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

