import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_SYSTEM = {
  maintenanceMode: false,
  registrationsEnabled: true,
  kycEnforced: false,
  admin2FA: false,
  currency: {
    autoExchangeRate: true,
    baseCurrency: 'USD',
    provider: 'openexchangerates'
  },
  currencies: []
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@scrolith.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Scrolith Admin';

async function upsertSystemSettings() {
  await prisma.appSetting.upsert({
    where: { scope: 'system' },
    create: { scope: 'system', data: DEFAULT_SYSTEM },
    update: { data: DEFAULT_SYSTEM }
  });
  console.log('Seeded AppSetting scope="system"');
}

async function upsertAdminUser() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    const user = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        passwordHash: hash,
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('Created admin user:', user.email);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: existing.name || ADMIN_NAME,
      passwordHash: hash,
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('Updated admin user:', existing.email);
}

async function main() {
  await upsertSystemSettings();
  await upsertAdminUser();
  console.log('Seed complete.');
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
