import prisma from '../src/utils/prismaClient';

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

async function seed() {
  try {
    const scope = 'system';
    const upserted = await prisma.appSetting.upsert({
      where: { scope },
      create: { scope, data: DEFAULT_SYSTEM },
      update: { data: DEFAULT_SYSTEM }
    });
    console.log('Seeded AppSetting for scope="system"');
  } catch (err) {
    console.error('Failed to seed AppSetting:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
