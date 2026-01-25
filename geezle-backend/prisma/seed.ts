import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.aiAutomationLog.deleteMany({});
  await prisma.ltvPrediction.deleteMany({});
  await prisma.demandForecast.deleteMany({});
  await prisma.opportunityRadarSnapshot.deleteMany({});
  await prisma.marketInsightSnapshot.deleteMany({});
  // Delete escrow records first to avoid FK constraint violations
  await prisma.escrow.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.gig.deleteMany({});
  // Community & payments cleanup to avoid FK constraint errors
  await prisma.adMetricsDaily.deleteMany({});
  await prisma.adPayment.deleteMany({});
  await prisma.communityAd.deleteMany({});
  await prisma.adPayment.deleteMany({});
  await prisma.adMetricsDaily.deleteMany({});
  await prisma.gcoinEarningEvent.deleteMany({});
  await prisma.gcoinTransaction.deleteMany({});
  await prisma.gcoinConversionRequest.deleteMany({});
  await prisma.gcoinWallet.deleteMany({});
  await prisma.communityPost.deleteMany({});
  await prisma.wallet.deleteMany({});
  // Remove generic transaction ledger entries to allow user cleanup
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});

  // Create a test user
  const user = await prisma.user.create({
    data: {
      email: 'freelancer@example.com',
      name: 'Alex Johnson',
      role: 'FREELANCER',
      avatar: 'https://i.pravatar.cc/150?img=1'
    }
  });

  // Create categories
  const graphicsCategory = await prisma.category.create({
    data: {
      name: 'Graphics & Design',
      slug: 'graphics-design',
      type: 'GIG',
      icon: '🎨',
      description: 'Design services including logos, branding, and graphics',
      order: 1,
      children: {
        create: [
          {
            name: 'Logo Design',
            slug: 'logo-design',
            type: 'GIG',
            icon: 'https://cdn-icons-png.flaticon.com/512/732/732004.png',
            order: 1
          },
          {
            name: 'Brand Style Guides',
            slug: 'brand-style-guides',
            type: 'GIG',
            icon: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png',
            order: 2
          }
        ]
      }
    }
  });

  const programmingCategory = await prisma.category.create({
    data: {
      name: 'Programming & Tech',
      slug: 'programming-tech',
      type: 'BOTH',
      icon: '💻',
      description: 'Programming and technical services',
      order: 2,
      children: {
        create: [
          {
            name: 'Web Development',
            slug: 'web-development',
            type: 'BOTH',
            icon: '🌐',
            order: 1
          },
          {
            name: 'Mobile App Development',
            slug: 'mobile-app-development',
            type: 'BOTH',
            icon: '📱',
            order: 2
          }
        ]
      }
    }
  });

  // Create sample gigs with different statuses
  const gigs = [
    {
      title: 'I will design a modern logo for your brand',
      slug: 'design-modern-logo-for-your-brand',
      description: 'I will create a unique and professional logo design for your business. Specializing in modern, minimalistic designs.',
      price: 50.00,
      deliveryTime: 3,
      revisions: 2,
      userId: user.id,
      categoryId: graphicsCategory.id,
      status: 'ACTIVE',
      isActive: true,
      isFeatured: true,
      rating: 4.9,
      reviewCount: 127
    },
    {
      title: 'Build a responsive website with React',
      slug: 'build-responsive-website-with-react',
      description: 'I will build a modern, responsive website using React, TypeScript, and Tailwind CSS.',
      price: 500.00,
      deliveryTime: 14,
      revisions: 3,
      userId: user.id,
      categoryId: programmingCategory.id,
      status: 'PENDING',
      isActive: false,
      isFeatured: false,
      rating: 0,
      reviewCount: 0
    },
    {
      title: 'Custom WordPress theme development',
      slug: 'custom-wordpress-theme-development',
      description: 'I will create a custom WordPress theme tailored to your business needs.',
      price: 300.00,
      deliveryTime: 10,
      revisions: 2,
      userId: user.id,
      categoryId: programmingCategory.id,
      status: 'REJECTED',
      isActive: false,
      isFeatured: false,
      rating: 0,
      reviewCount: 0
    },
    {
      title: 'Social media graphics package',
      slug: 'social-media-graphics-package',
      description: 'Complete set of social media graphics for your brand.',
      price: 100.00,
      deliveryTime: 7,
      revisions: 1,
      userId: user.id,
      categoryId: graphicsCategory.id,
      status: 'PAUSED',
      isActive: false,
      isFeatured: false,
      rating: 4.7,
      reviewCount: 45
    }
  ];

  for (const gigData of gigs) {
    await prisma.gig.create({
      data: gigData as any
    });
  }

  const client = await prisma.user.create({
    data: {
      email: 'client@example.com',
      name: 'Beta Corp',
      role: 'EMPLOYER',
      avatar: 'https://i.pravatar.cc/150?img=5'
    }
  });

  const allGigs = await prisma.gig.findMany();
  const logoGig = allGigs.find((g) => g.slug === 'design-modern-logo-for-your-brand');
  const webGig = allGigs.find((g) => g.slug === 'build-responsive-website-with-react');
  const wpGig = allGigs.find((g) => g.slug === 'custom-wordpress-theme-development');

  if (logoGig && webGig && wpGig) {
    const orders = await Promise.all([
      prisma.order.create({
        data: {
          gigId: logoGig.id,
          clientId: client.id,
          freelancerId: user.id,
          amount: 250.0,
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10)
        }
      }),
      prisma.order.create({
        data: {
          gigId: webGig.id,
          clientId: client.id,
          freelancerId: user.id,
          amount: 780.0,
          status: 'PAID',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)
        }
      }),
      prisma.order.create({
        data: {
          gigId: wpGig.id,
          clientId: client.id,
          freelancerId: user.id,
          amount: 420.0,
          status: 'DISPUTED',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2)
        }
      })
    ]);

    for (const order of orders) {
      await prisma.escrow.create({
        data: {
          orderId: order.id,
          clientId: client.id,
          freelancerId: user.id,
          amount: order.amount,
          commission: Math.round(order.amount * 0.15),
          status: order.status === 'DISPUTED' ? 'DISPUTED' : 'RELEASED'
        }
      });
    }
  }

  await prisma.aiAutomationLog.createMany({
    data: [
      { eventType: 'auto-moderation', handledByAI: true },
      { eventType: 'auto-categorization', handledByAI: true },
      { eventType: 'manual-review', handledByAI: false },
      { eventType: 'auto-dispute-triage', handledByAI: true },
      { eventType: 'auto-matching', handledByAI: true },
      { eventType: 'manual-routing', handledByAI: false }
    ]
  });

  await prisma.ltvPrediction.createMany({
    data: [
      {
        userId: user.id,
        name: 'Alex Johnson',
        role: 'freelancer',
        predictedLtv: 150000,
        velocity: 'high',
        churnRiskPercent: 5,
        recommendation: 'Offer Pro Plan',
        confidence: 'High'
      },
      {
        userId: user.id,
        name: 'Pixel Partners',
        role: 'freelancer',
        predictedLtv: 92000,
        velocity: 'medium',
        churnRiskPercent: 12,
        recommendation: 'Nurture with Upsells',
        confidence: 'Medium'
      },
      {
        userId: user.id,
        name: 'Elevate Studios',
        role: 'freelancer',
        predictedLtv: 185000,
        velocity: 'high',
        churnRiskPercent: 4,
        recommendation: 'Invite to Enterprise Pilot',
        confidence: 'High'
      }
    ]
  });

  await prisma.demandForecast.createMany({
    data: [
      {
        domain: 'AI',
        skill: 'AI Agent Dev',
        horizon: '30d',
        growthPct: 145,
        suggestedRateMin: 80,
        suggestedRateMax: 150,
        suggestedRateUnit: 'hour',
        confidencePct: 95
      },
      {
        domain: 'Backend',
        skill: 'Rust',
        horizon: '90d',
        growthPct: 78,
        suggestedRateMin: 65,
        suggestedRateMax: 120,
        suggestedRateUnit: 'hour',
        confidencePct: 88
      },
      {
        domain: 'Marketing',
        skill: 'Video UGC',
        horizon: '30d',
        growthPct: 102,
        suggestedRateMin: 50,
        suggestedRateMax: 90,
        suggestedRateUnit: 'project',
        confidencePct: 91
      }
    ]
  });

  await prisma.opportunityRadarSnapshot.create({
    data: {
      signalsScanned: 50000,
      summary: 'AI signals point to surging demand for automation experts.',
      reportRoute: '/admin/market-intelligence/report'
    }
  });

  console.log('✅ Database seeded successfully!');
  console.log(`👤 Created user: ${user.email}`);
  console.log(`🏷️ Created categories: ${graphicsCategory.name}, ${programmingCategory.name}`);
  console.log(`💼 Created gigs: ${gigs.length} total with various statuses`);

  // --- Additional Community & Gcoin/Ads seed data ---
  console.log('Seeding community Gcoin and Ads sample data...');

  const alice = await prisma.user.upsert({
    where: { email: 'alice+seed@local.dev' },
    update: {},
    create: { email: 'alice+seed@local.dev', name: 'Alice Seed', role: 'USER' }
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob+seed@local.dev' },
    update: {},
    create: { email: 'bob+seed@local.dev', name: 'Bob Seed', role: 'USER' }
  });

  // Ensure Gcoin wallets exist
  await prisma.gcoinWallet.upsert({
    where: { userId: alice.id },
    update: {},
    create: { userId: alice.id, recipientId: `GC-${Date.now().toString().slice(-8)}` }
  });

  await prisma.gcoinWallet.upsert({
    where: { userId: bob.id },
    update: {},
    create: { userId: bob.id, recipientId: `GC-${(Date.now()+1).toString().slice(-8)}` }
  });

  // Create a community post by Alice
  const communityPost = await prisma.communityPost.create({
    data: {
      authorId: alice.id,
      title: 'Seed: Welcome to the community',
      content: 'This seeded post demonstrates Gcoin earning mechanics.',
      viewsCount: 10050,
      likesCount: 25,
      sharesCount: 5,
      repostsCount: 2
    }
  });

  // Create a couple of earning events (idempotent keys)
  await prisma.gcoinEarningEvent.createMany({
    data: [
      { postId: communityPost.id, actorId: bob.id, eventType: 'view', eventKey: `seed_view_${bob.id}`, credited: false },
      { postId: communityPost.id, actorId: bob.id, eventType: 'like', eventKey: `seed_like_${bob.id}`, credited: false }
    ]
  });

  // Create an ad (paid) and payment + metrics
  const seededAd = await prisma.communityAd.create({
    data: {
      creatorId: alice.id,
      title: 'Seeded Promo',
      body: 'Promote your post with this seeded ad',
      placement: 'feed',
      targeting: {},
      mediaFileIds: [],
      status: 'PAID',
      currency: 'USD',
      budget: 50,
      remainingBudget: 50,
      cpm: 5,
      impressionsBought: 10000,
      impressionsLeft: 10000
    }
  });

  await prisma.adPayment.create({
    data: {
      adId: seededAd.id,
      transactionId: 'seed_txn_ad_1',
      amount: 50,
      currency: 'USD',
      status: 'completed'
    }
  });

  await prisma.adMetricsDaily.create({
    data: {
      adId: seededAd.id,
      date: new Date(),
      impressions: 1200,
      clicks: 45,
      spend: 30
    }
  });

  console.log('✅ Community Gcoin & Ads seeded: users, post, events, ad, metrics.');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
