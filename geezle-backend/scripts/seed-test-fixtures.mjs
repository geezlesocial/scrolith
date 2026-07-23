import { PrismaClient } from '@prisma/client';

await import('./test-db-guard.mjs');

const prisma = new PrismaClient();

const ensureUser = async (data) =>
  prisma.user.upsert({
    where: { id: data.id },
    update: {
      email: data.email,
      name: data.name,
      role: data.role,
      isActive: true
    },
    create: {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      isActive: true,
      isVerified: true
    }
  });

const ensureWallet = async (userId, recipientId, balance = 100) =>
  prisma.gcoinWallet.upsert({
    where: { userId },
    update: { recipientId, balance, lifetimeEarned: { increment: 0 }, status: 'active' },
    create: { userId, recipientId, balance, lifetimeEarned: balance, status: 'active' }
  });

try {
  const dev = await ensureUser({
    id: 'dev-user-id-123',
    email: 'dev@example.com',
    name: 'Dev Test User',
    role: 'FREELANCER'
  });
  const alice = await prisma.user.upsert({
    where: { email: 'alice+seed@local.dev' },
    update: { name: 'Alice Seed', role: 'USER', isActive: true },
    create: {
      email: 'alice+seed@local.dev',
      name: 'Alice Seed',
      role: 'USER',
      isActive: true,
      isVerified: true
    }
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob+seed@local.dev' },
    update: { name: 'Bob Seed', role: 'USER', isActive: true },
    create: {
      email: 'bob+seed@local.dev',
      name: 'Bob Seed',
      role: 'USER',
      isActive: true,
      isVerified: true
    }
  });

  await ensureWallet(dev.id, 'GC-DEV', 1000);
  await ensureWallet(alice.id, 'GC-ALICE', 100);
  await ensureWallet(bob.id, 'GC-BOB', 100);

  const gcoinSettings = {
    conversionRate: 1,
    minWithdrawal: 0,
    conversionEnabled: true,
    autoApproveConversions: false,
    userTransfersEnabled: true,
    transferFeeType: 'percentage',
    transferFeeValue: 0,
    viewsUnit: 200,
    likesUnit: 30,
    repostsUnit: 40,
    sharesUnit: 50,
    coinPerViewsUnit: 1,
    coinPerLikesUnit: 1,
    coinPerRepostsUnit: 1,
    coinPerSharesUnit: 1,
    adminFeePercent: 0.1
  };
  const existingSettings = await prisma.gcoinSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (existingSettings) {
    await prisma.gcoinSettings.update({ where: { id: existingSettings.id }, data: gcoinSettings });
    await prisma.gcoinSettings.updateMany({
      where: { id: { not: existingSettings.id } },
      data: gcoinSettings
    });
  } else {
    await prisma.gcoinSettings.create({ data: gcoinSettings });
  }
  await prisma.appSetting.upsert({
    where: { scope: 'gcoin_settings' },
    update: { data: gcoinSettings },
    create: { scope: 'gcoin_settings', data: gcoinSettings }
  });

  const existingPost = await prisma.communityPost.findFirst({ where: { authorId: alice.id } });
  if (!existingPost) {
    await prisma.communityPost.create({
      data: {
        authorId: alice.id,
        title: 'Seeded Post for Gcoin earnings',
        content: 'This post was created by test fixtures to validate Gcoin flows.',
        viewsCount: 10050,
        likesCount: 25,
        sharesCount: 5
      }
    });
  }

  console.log('Test fixtures seeded.');
} finally {
  await prisma.$disconnect();
}
