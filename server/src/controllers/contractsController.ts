import { Request, Response } from 'express';
import { prisma } from '../db';

const parseNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toContractResponse = (contract: any) => ({
  id: contract.id,
  title: contract.title,
  client_id: contract.clientId,
  clientId: contract.clientId,
  client_name: contract.clientName,
  clientName: contract.clientName,
  freelancer_id: contract.freelancerId,
  freelancerId: contract.freelancerId,
  freelancer_name: contract.freelancerName,
  freelancerName: contract.freelancerName,
  type: contract.type,
  hourly_rate: contract.hourlyRate ?? 0,
  hourlyRate: contract.hourlyRate ?? 0,
  payment_cycle: contract.paymentCycle,
  paymentCycle: contract.paymentCycle,
  status: contract.status,
  total_hours_logged: contract.totalHoursLogged ?? 0,
  totalHoursLogged: contract.totalHoursLogged ?? 0,
  total_paid: contract.totalPaid ?? 0,
  totalPaid: contract.totalPaid ?? 0,
  start_date: contract.startDate,
  startDate: contract.startDate,
  description: contract.description,
  active_session_id: contract.activeSessionId,
  activeSessionId: contract.activeSessionId,
  jobId: contract.jobId,
  proposalId: contract.proposalId,
  createdAt: contract.createdAt,
  updatedAt: contract.updatedAt
});

const toTimeEntryResponse = (entry: any) => ({
  id: entry.id,
  contract_id: entry.contractId,
  contractId: entry.contractId,
  freelancer_id: entry.freelancerId,
  freelancerId: entry.freelancerId,
  start_time: entry.startTime,
  startTime: entry.startTime,
  end_time: entry.endTime,
  endTime: entry.endTime,
  duration_minutes: entry.durationMinutes,
  durationMinutes: entry.durationMinutes,
  description: entry.description,
  status: entry.status,
  earnings: entry.earnings,
  screenshots: entry.screenshots || [],
  activity_score: entry.activityScore,
  activityScore: entry.activityScore,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt
});

export const listContracts = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const role = (req.query.role as string | undefined)?.toLowerCase();
  const userId = (req.query.userId as string | undefined) || (req as any).user?.id;
  const jobId = req.query.jobId as string | undefined;
  const freelancerId = req.query.freelancerId as string | undefined;
  const clientId = req.query.clientId as string | undefined;
  const proposalId = req.query.proposalId as string | undefined;

  const where: any = {};
  if (jobId) where.jobId = jobId;
  if (proposalId) where.proposalId = proposalId;
  if (freelancerId) where.freelancerId = freelancerId;
  if (clientId) where.clientId = clientId;
  if (role === 'freelancer' && userId) where.freelancerId = userId;
  if (role === 'client' && userId) where.clientId = userId;

  const contracts = await prisma.contract.findMany({ where, orderBy: { createdAt: 'desc' } });
  return res.json({ success: true, data: contracts.map(toContractResponse) });
};

export const getContractById = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) return res.status(404).json({ success: false, error: 'Contract not found' });
  return res.json({ success: true, data: toContractResponse(contract) });
};

export const createContract = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const payload = req.body || {};
  if (!payload.clientId || !payload.freelancerId) {
    return res.status(400).json({ success: false, error: 'clientId and freelancerId are required' });
  }

  const contract = await prisma.contract.create({
    data: {
      jobId: payload.jobId || null,
      proposalId: payload.proposalId || null,
      title: payload.title || 'Contract',
      clientId: payload.clientId,
      clientName: payload.clientName || null,
      freelancerId: payload.freelancerId,
      freelancerName: payload.freelancerName || null,
      type: payload.type || 'fixed',
      hourlyRate: parseNumber(payload.hourlyRate),
      fixedAmount: parseNumber(payload.fixedAmount),
      paymentCycle: payload.paymentCycle || null,
      status: payload.status || 'active',
      startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
      description: payload.description || null
    }
  });

  return res.json({ success: true, data: toContractResponse(contract) });
};

export const updateContractStatus = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const status = req.body?.status as string | undefined;
  if (!status) return res.status(400).json({ success: false, error: 'status is required' });
  const contract = await prisma.contract.update({ where: { id }, data: { status } });
  return res.json({ success: true, data: toContractResponse(contract) });
};

export const startTracking = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const freelancerId = user?.id || req.body?.freelancerId;
  if (!freelancerId) return res.status(400).json({ success: false, error: 'freelancerId is required' });

  const existing = await prisma.timeTrackerSession.findFirst({
    where: { contractId: id, freelancerId, status: 'active' }
  });
  if (existing) return res.status(400).json({ success: false, error: 'Active session already exists' });

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) return res.status(404).json({ success: false, error: 'Contract not found' });

  const session = await prisma.timeTrackerSession.create({
    data: {
      contractId: id,
      freelancerId,
      freelancerName: contract.freelancerName || null,
      startTime: new Date(),
      status: 'active',
      hourlyRate: contract.hourlyRate || null
    }
  });

  await prisma.contract.update({ where: { id }, data: { activeSessionId: session.id } });
  if ((req as any).io) (req as any).io.emit('tracking:started', session);
  return res.json({ success: true, data: session });
};

export const stopTracking = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const freelancerId = user?.id || req.body?.freelancerId;
  const notes = req.body?.notes || req.body?.description || null;
  const screenshots = req.body?.screenshots || [];

  const session = await prisma.timeTrackerSession.findFirst({
    where: { contractId: id, freelancerId, status: 'active' },
    orderBy: { startTime: 'desc' }
  });
  if (!session) return res.status(404).json({ success: false, error: 'Active session not found' });

  const endTime = new Date();
  const durationSeconds = Math.max(0, Math.floor((endTime.getTime() - new Date(session.startTime).getTime()) / 1000));
  const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

  await prisma.timeTrackerSession.update({
    where: { id: session.id },
    data: { endTime, durationSeconds, status: 'completed' }
  });

  const contract = await prisma.contract.findUnique({ where: { id } });
  const hourlyRate = contract?.hourlyRate || session.hourlyRate || 0;
  const earnings = hourlyRate ? (durationMinutes / 60) * hourlyRate : 0;

  const entry = await prisma.timeEntry.create({
    data: {
      contractId: id,
      freelancerId: freelancerId || session.freelancerId,
      startTime: session.startTime,
      endTime,
      durationMinutes,
      description: notes,
      status: 'pending',
      earnings,
      screenshots
    }
  });

  await prisma.contract.update({
    where: { id },
    data: {
      activeSessionId: null,
      totalHoursLogged: { increment: durationMinutes / 60 },
      totalPaid: { increment: 0 }
    }
  });

  if ((req as any).io) (req as any).io.emit('tracking:stopped', { sessionId: session.id, entry });
  return res.json({ success: true, data: toTimeEntryResponse(entry) });
};

export const getTimeEntries = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const entries = await prisma.timeEntry.findMany({ where: { contractId: id }, orderBy: { startTime: 'desc' } });
  return res.json({ success: true, data: entries.map(toTimeEntryResponse) });
};

export const addTimeEntry = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const payload = req.body || {};
  const startTime = payload.startTime ? new Date(payload.startTime) : new Date();
  const endTime = payload.endTime ? new Date(payload.endTime) : null;
  const durationMinutes =
    parseNumber(payload.durationMinutes) ??
    (endTime ? Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000)) : 0);

  const entry = await prisma.timeEntry.create({
    data: {
      contractId: id,
      freelancerId: payload.freelancerId || (req as any).user?.id || 'unknown',
      startTime,
      endTime,
      durationMinutes,
      description: payload.description || null,
      status: payload.status || 'pending',
      earnings: parseNumber(payload.earnings),
      screenshots: payload.screenshots || []
    }
  });
  return res.json({ success: true, data: toTimeEntryResponse(entry) });
};

export const approveTimeEntry = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  await prisma.timeEntry.update({ where: { id }, data: { status: 'approved' } });
  return res.json({ success: true });
};

export const payContractDue = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const entries = await prisma.timeEntry.findMany({ where: { contractId: id, status: 'approved' } });
  const amount = entries.reduce((sum, entry) => sum + Number(entry.earnings || 0), 0);
  if (entries.length) {
    await prisma.timeEntry.updateMany({ where: { contractId: id, status: 'approved' }, data: { status: 'paid' } });
    await prisma.contract.update({ where: { id }, data: { totalPaid: { increment: amount } } });
  }
  return res.json({ success: true, data: { amount } });
};

export const listActiveTrackingSessions = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const sessions = await prisma.timeTrackerSession.findMany({
    where: { status: 'active' },
    include: { contract: true },
    orderBy: { startTime: 'desc' }
  });
  const data = sessions.map((s) => ({
    sessionId: s.id,
    contractId: s.contractId,
    contractTitle: s.contract?.title || 'Contract',
    freelancerId: s.freelancerId,
    freelancerName: s.freelancerName || s.contract?.freelancerName || '',
    startedAt: s.startTime,
    elapsedSeconds: Math.floor((Date.now() - new Date(s.startTime).getTime()) / 1000),
    status: 'active'
  }));
  return res.json({ success: true, data });
};

export const forceStopTrackingSession = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { sessionId } = req.params;
  const notes = req.body?.notes || null;

  const session = await prisma.timeTrackerSession.findUnique({ where: { id: sessionId } });
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const endTime = new Date();
  const durationSeconds = Math.max(0, Math.floor((endTime.getTime() - new Date(session.startTime).getTime()) / 1000));
  const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
  await prisma.timeTrackerSession.update({
    where: { id: sessionId },
    data: { endTime, durationSeconds, status: 'completed' }
  });

  const contract = await prisma.contract.findUnique({ where: { id: session.contractId } });
  const hourlyRate = contract?.hourlyRate || session.hourlyRate || 0;
  const earnings = hourlyRate ? (durationMinutes / 60) * hourlyRate : 0;

  const entry = await prisma.timeEntry.create({
    data: {
      contractId: session.contractId,
      freelancerId: session.freelancerId,
      startTime: session.startTime,
      endTime,
      durationMinutes,
      description: notes,
      status: 'pending',
      earnings
    }
  });

  await prisma.contract.update({
    where: { id: session.contractId },
    data: {
      activeSessionId: null,
      totalHoursLogged: { increment: durationMinutes / 60 }
    }
  });

  if ((req as any).io) (req as any).io.emit('tracking:force_stopped', { sessionId, entry });
  return res.json({ success: true, data: toTimeEntryResponse(entry) });
};

export const listAllTimeEntries = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const skip = (page - 1) * limit;
  const [total, entries] = await Promise.all([
    prisma.timeEntry.count(),
    prisma.timeEntry.findMany({ orderBy: { startTime: 'desc' }, skip, take: limit })
  ]);
  return res.json({ success: true, data: { items: entries.map(toTimeEntryResponse), total } });
};
