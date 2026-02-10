import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const freelancerId = 'seed-freelancer-1';
  const clientId = 'seed-client-1';

  const gigCategory = await prisma.category.upsert({
    where: { id: 'seed-cat-gig-dev' },
    update: {},
    create: {
      id: 'seed-cat-gig-dev',
      name: 'Development',
      slug: 'development',
      type: 'GIG',
      status: 'active',
      sortOrder: 1
    }
  });

  const jobCategory = await prisma.category.upsert({
    where: { id: 'seed-cat-job-design' },
    update: {},
    create: {
      id: 'seed-cat-job-design',
      name: 'Design',
      slug: 'design',
      type: 'JOB',
      status: 'active',
      sortOrder: 1
    }
  });

  await prisma.gig.upsert({
    where: { id: 'seed-gig-pending' },
    update: {},
    create: {
      id: 'seed-gig-pending',
      title: 'Seed Pending Gig',
      description: 'Pending gig for review.',
      freelancerId,
      status: 'submitted',
      adminStatus: 'pending',
      isActive: false,
      isVisible: false,
      categoryId: gigCategory.id,
      categoryName: gigCategory.name,
      price: 150,
      priceType: 'fixed',
      media: ['https://placehold.co/600x400'],
      tags: ['seed', 'pending']
    }
  });

  await prisma.gig.upsert({
    where: { id: 'seed-gig-approved' },
    update: {},
    create: {
      id: 'seed-gig-approved',
      title: 'Seed Approved Gig',
      description: 'Approved and visible gig.',
      freelancerId,
      status: 'active',
      adminStatus: 'approved',
      isActive: true,
      isVisible: true,
      categoryId: gigCategory.id,
      categoryName: gigCategory.name,
      price: 250,
      priceType: 'fixed',
      media: ['https://placehold.co/600x400'],
      tags: ['seed', 'approved']
    }
  });

  await prisma.job.upsert({
    where: { id: 'seed-job-pending' },
    update: {},
    create: {
      id: 'seed-job-pending',
      ownerId: clientId,
      title: 'Seed Pending Job',
      description: 'Pending job for review.',
      status: 'submitted',
      adminStatus: 'pending',
      isActive: false,
      isVisible: false,
      categoryId: jobCategory.id,
      categoryName: jobCategory.name,
      budgetAmount: 500,
      budgetType: 'fixed',
      tags: ['seed', 'pending']
    }
  });

  const approvedJob = await prisma.job.upsert({
    where: { id: 'seed-job-approved' },
    update: {},
    create: {
      id: 'seed-job-approved',
      ownerId: clientId,
      title: 'Seed Approved Job',
      description: 'Approved job listing.',
      status: 'active',
      adminStatus: 'approved',
      isActive: true,
      isVisible: true,
      categoryId: jobCategory.id,
      categoryName: jobCategory.name,
      budgetAmount: 800,
      budgetType: 'fixed',
      tags: ['seed', 'approved']
    }
  });

  const proposal = await prisma.jobProposal.upsert({
    where: { id: 'seed-proposal-pending' },
    update: {},
    create: {
      id: 'seed-proposal-pending',
      jobId: approvedJob.id,
      freelancerId,
      freelancerName: 'Seed Freelancer',
      clientId,
      coverLetter: 'Seed proposal pending.',
      proposedAmount: 750,
      proposedTimeline: 7,
      status: 'pending'
    }
  });

  const acceptedProposal = await prisma.jobProposal.upsert({
    where: { id: 'seed-proposal-accepted' },
    update: {},
    create: {
      id: 'seed-proposal-accepted',
      jobId: approvedJob.id,
      freelancerId,
      freelancerName: 'Seed Freelancer',
      clientId,
      coverLetter: 'Seed accepted proposal.',
      proposedAmount: 900,
      proposedTimeline: 10,
      status: 'accepted'
    }
  });

  const contract = await prisma.contract.upsert({
    where: { id: 'seed-contract-1' },
    update: {},
    create: {
      id: 'seed-contract-1',
      jobId: approvedJob.id,
      proposalId: acceptedProposal.id,
      title: 'Seed Contract',
      clientId,
      freelancerId,
      freelancerName: 'Seed Freelancer',
      type: 'fixed',
      fixedAmount: 900,
      paymentCycle: 'weekly',
      status: 'active',
      startDate: new Date()
    }
  });

  await prisma.jobProposal.update({
    where: { id: acceptedProposal.id },
    data: { contractId: contract.id }
  });

  await prisma.timeEntry.upsert({
    where: { id: 'seed-time-entry-1' },
    update: {},
    create: {
      id: 'seed-time-entry-1',
      contractId: contract.id,
      freelancerId,
      startTime: new Date(Date.now() - 1000 * 60 * 90),
      endTime: new Date(Date.now() - 1000 * 60 * 30),
      durationMinutes: 60,
      description: 'Seed time entry 1',
      status: 'approved',
      earnings: 150
    }
  });

  await prisma.timeEntry.upsert({
    where: { id: 'seed-time-entry-2' },
    update: {},
    create: {
      id: 'seed-time-entry-2',
      contractId: contract.id,
      freelancerId,
      startTime: new Date(Date.now() - 1000 * 60 * 25),
      endTime: new Date(Date.now() - 1000 * 60 * 5),
      durationMinutes: 20,
      description: 'Seed time entry 2',
      status: 'pending',
      earnings: 50
    }
  });

  await prisma.timeTrackerSession.upsert({
    where: { id: 'seed-active-session' },
    update: {},
    create: {
      id: 'seed-active-session',
      contractId: contract.id,
      freelancerId,
      freelancerName: 'Seed Freelancer',
      startTime: new Date(Date.now() - 1000 * 60 * 15),
      status: 'active',
      hourlyRate: 60
    }
  });

  await prisma.contract.update({
    where: { id: contract.id },
    data: { activeSessionId: 'seed-active-session' }
  });

  await prisma.job.update({
    where: { id: approvedJob.id },
    data: { proposalsCount: 2 }
  });

  await prisma.job.update({
    where: { id: proposal.jobId },
    data: { proposalsCount: 2 }
  });
};

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
