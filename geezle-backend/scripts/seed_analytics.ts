import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAYS = 30;

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  console.log('Seeding analytics sample data...');

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));

  // If there are already recent orders/messages, skip to avoid duplicates
  const existingOrders = await prisma.order.count({ where: { createdAt: { gte: since } } });
  const existingMessages = await prisma.communityMessage.count({ where: { createdAt: { gte: since } } });
  const existingTx = await prisma.transaction.count({ where: { createdAt: { gte: since } } });

  if (existingOrders + existingMessages + existingTx > 20) {
    console.log('Recent analytics data already exists, skipping seed. Remove existing rows to reseed.');
    return;
  }

  // Create or ensure a few users across the date range
  const users: any[] = [];
  for (let i = 0; i < 10; i++) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - rand(0, DAYS - 1));

    const user = await prisma.user.create({
      data: {
        email: `seed.user${i}@example.com`,
        name: `Seed User ${i}`,
        role: 'USER',
        // passwordHash is used in schema; omit here for seed users
        createdAt
      }
    });
    users.push(user);
  }

  // Create a default channel for seeded community messages
  const channel = await prisma.communityChannel.create({
    data: {
      name: 'Seed Channel',
      ownerId: users[0].id
    }
  });

  // Create orders and transactions distributed over the last DAYS
  for (let d = 0; d < DAYS; d++) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - d);

    const ordersToday = rand(0, 6);
    for (let o = 0; o < ordersToday; o++) {
      const createdAt = new Date(date);
      createdAt.setHours(rand(0, 23), rand(0, 59), rand(0, 59));

      const order = await prisma.order.create({
        data: {
          clientId: users[rand(0, users.length - 1)].id,
          freelancerId: users[rand(0, users.length - 1)].id,
          amount: rand(20, 500),
          status: 'COMPLETED',
          createdAt
        }
      });

      // Commission transaction
      await prisma.transaction.create({
        data: {
          userId: order.clientId,
          // walletId omitted for simplicity; optional in schema
          type: ('COMMISSION' as any),
          amount: Math.abs(rand(5, 50)),
          status: 'COMPLETED',
          description: `Commission for order ${order.id}`,
          createdAt
        }
      });
    }

    // messages
    const messagesToday = rand(0, 40);
    for (let m = 0; m < messagesToday; m++) {
      const createdAt = new Date(date);
      createdAt.setHours(rand(0, 23), rand(0, 59), rand(0, 59));
      await prisma.communityMessage.create({
        data: {
          channelId: channel.id,
          userId: users[rand(0, users.length - 1)].id,
          content: 'Seed message for analytics',
          createdAt
        }
      });
    }
  }

  // Create some revenue-type transactions not tied to orders
  for (let i = 0; i < 20; i++) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - rand(0, DAYS - 1));
    await prisma.transaction.create({
      data: {
        userId: users[rand(0, users.length - 1)].id,
        // walletId omitted for simplicity
        type: (['FEE', 'ADJUSTMENT'][rand(0, 1)] as any),
        amount: Math.abs(rand(10, 300)),
        status: 'COMPLETED',
        description: 'Seed revenue item',
        createdAt
      }
    });
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
