import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@local';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const hash = await bcrypt.hash(password, 10);
    admin = await prisma.user.create({ data: { email, name: 'Administrator', role: 'ADMIN', passwordHash: hash, isActive: true } as any });
    console.log('Created admin user:', admin.email, admin.id);
  } else {
    // ensure password exists
    if (!admin.passwordHash) {
      const hash = await bcrypt.hash(password, 10);
      admin = await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: hash } as any });
      console.log('Updated admin password for:', admin.email);
    } else {
      console.log('Admin already exists:', admin.email);
    }
  }

  const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '30d' });
  console.log('\nDEV_ADMIN_TOKEN=' + token + '\n');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
