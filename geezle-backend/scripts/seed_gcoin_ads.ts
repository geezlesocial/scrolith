import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function randId(len = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function main() {
  console.log('Seeding Gcoin + Ads sample data...');

  // Create or find two users
  const alice =
    (await prisma.user.findUnique({ where: { email: 'alice+seed@local.dev' } })) ||
    (await prisma.user.create({ data: { email: 'alice+seed@local.dev', name: 'Alice Seed' } }));

  const bob =
    (await prisma.user.findUnique({ where: { email: 'bob+seed@local.dev' } })) ||
    (await prisma.user.create({ data: { email: 'bob+seed@local.dev', name: 'Bob Seed' } }));

  // Ensure Gcoin wallets
  const aliceG =
    (await prisma.gcoinWallet.findUnique({ where: { userId: alice.id } })) ||
    (await prisma.gcoinWallet.create({
      data: {
        userId: alice.id,
        recipientId: `G${randId(11)}`,
        balance: 0,
        lifetimeEarned: 0
      }
    }));

  const bobG =
    (await prisma.gcoinWallet.findUnique({ where: { userId: bob.id } })) ||
    (await prisma.gcoinWallet.create({
      data: {
        userId: bob.id,
        recipientId: `G${randId(11)}`,
        balance: 0,
        lifetimeEarned: 0
      }
    }));

  // Create a community post by Alice
  const post =
    (await prisma.communityPost.findFirst({ where: { authorId: alice.id } })) ||
    (await prisma.communityPost.create({
      data: {
        authorId: alice.id,
        title: 'Seeded Post for Gcoin earnings',
        content: 'This post was created by seed script to demonstrate Gcoin economic flows.'
      }
    }));

  // Simulate metrics: create a few GcoinEarningEvent entries and a GcoinTransaction awarding coins
  // Award Alice 5 Gcoin (example)
  const awardAmount = 5;

  await prisma.gcoinEarningEvent.createMany({
    data: [
      { postId: post.id, actorId: bob.id, eventType: 'view', eventKey: `seed-view-${Date.now()}-1`, value: 0, credited: true },
      { postId: post.id, actorId: bob.id, eventType: 'like', eventKey: `seed-like-${Date.now()}-1`, value: 0, credited: true }
    ]
  });

  const tx = await prisma.gcoinTransaction.create({
    data: {
      userId: alice.id,
      amount: awardAmount,
      type: 'reward',
      source: 'seed',
      reason: 'seed-award',
      referenceId: post.id,
      status: 'completed',
      createdBy: 'seed-script'
    }
  });

  // update wallet balances
  await prisma.gcoinWallet.update({ where: { userId: alice.id }, data: { balance: { increment: awardAmount }, lifetimeEarned: { increment: awardAmount } } as any });

  // Also create a corresponding Transaction ledger entry for funds system (keeps core ledger intact)
  const fundTx = await prisma.transaction.create({
    data: {
      userId: alice.id,
      type: 'REWARD',
      amount: 0,
      status: 'COMPLETED',
      description: `Gcoin reward awarded: ${awardAmount} Gcoin (seed)`
    }
  });

  // Create an Ad draft and mark it as paid + submitted_for_review
  const ad = await prisma.communityAd.create({
    data: {
      creatorId: bob.id,
      title: 'Seeded Promo Ad',
      body: 'Promote your services on Scrolith - seeded ad',
      placement: 'community_home',
      currency: 'USD',
      budget: 50,
      remainingBudget: 50,
      cpm: 10,
      impressionsBought: 5000,
      impressionsLeft: 5000,
      status: 'SUBMITTED_FOR_REVIEW'
    }
  });

  // Create a payment Transaction and AdPayment
  const adPaymentTx = await prisma.transaction.create({
    data: {
      userId: bob.id,
      type: 'PAYMENT',
      amount: 50,
      status: 'COMPLETED',
      description: `Prepay for ad ${ad.id}`
    }
  });

  await prisma.adPayment.create({
    data: {
      adId: ad.id,
      transactionId: adPaymentTx.id,
      amount: 50,
      currency: 'USD',
      status: 'completed'
    }
  });

  // Link ad payment transaction id to ad.paymentTransactionId
  await prisma.communityAd.update({ where: { id: ad.id }, data: { paymentTransactionId: adPaymentTx.id } });

  console.log('Seed complete.');
  console.log('Users:', { alice: alice.email, bob: bob.email });
  console.log('Post id:', post.id);
  console.log('Gcoin tx id:', tx.id);
  console.log('Ad id:', ad.id);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

