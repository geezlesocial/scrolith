import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding community data...');

  // Create two users
  const alice = await prisma.user.upsert({ where: { email: 'alice@example.com' }, update: {}, create: { email: 'alice@example.com', name: 'Alice', role: 'USER', passwordHash: 'seed' } });
  const bob = await prisma.user.upsert({ where: { email: 'bob@example.com' }, update: {}, create: { email: 'bob@example.com', name: 'Bob', role: 'USER', passwordHash: 'seed' } });

  // Ensure gcoin wallets
  await prisma.gcoinWallet.upsert({ where: { userId: alice.id }, update: {}, create: { userId: alice.id, recipientId: `GC-${Math.random().toString(36).slice(2,12)}`, balance: 0, lifetimeEarned: 0 } });
  await prisma.gcoinWallet.upsert({ where: { userId: bob.id }, update: {}, create: { userId: bob.id, recipientId: `GC-${Math.random().toString(36).slice(2,12)}`, balance: 0, lifetimeEarned: 0 } });

  // Create one community post by Alice
  const post = await prisma.communityPost.create({ data: { authorId: alice.id, title: 'Seed Post', content: 'This is a seeded post for testing Gcoin awards', viewsCount: 0, likesCount: 0, sharesCount: 0, repostsCount: 0 } });

  // Simulate events to cross thresholds (use GcoinSettings defaults: viewsUnit=10000 etc)
  // We'll create many view events using the GcoinEarningEvent table to simulate earned coins
  const events = [];
  for (let i = 0; i < 10050; i++) {
    events.push({ postId: post.id, actorId: bob.id, eventType: 'view', eventKey: `${post.id}:view:actor:${i}-${new Date().toISOString()}`, value: 0, credited: false });
    if (events.length >= 500) {
      await prisma.gcoinEarningEvent.createMany({ data: events });
      events.length = 0;
    }
  }
  if (events.length) await prisma.gcoinEarningEvent.createMany({ data: events });

  // Update post view counters to reflect created events
  await prisma.communityPost.update({ where: { id: post.id }, data: { viewsCount: 10050 } });

  // Create one ad draft by Bob and create a fake paid ad payment and submitted
  const ad = await prisma.communityAd.create({ data: { creatorId: bob.id, title: 'Seed Ad', body: 'Buy my product', placement: 'feed', budget: 50, remainingBudget: 50, cpm: 10, status: 'PAID', currency: 'USD' } });
  await prisma.adPayment.create({ data: { adId: ad.id, transactionId: 'seed-tx-1', amount: 50, currency: 'USD', status: 'completed' } });
  await prisma.communityAd.update({ where: { id: ad.id }, data: { status: 'SUBMITTED_FOR_REVIEW' } });

  console.log('Seeding complete.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
