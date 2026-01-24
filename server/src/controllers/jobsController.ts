import { Request, Response } from 'express';
import { prisma } from '../db';

const jobs: any[] = [];

export const listJobs = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const ownerId = (req.query.ownerId === 'me' ? user?.id : req.query.ownerId) || null;
  if (prisma) {
    if (ownerId) return res.json({ success: true, data: await prisma.job.findMany({ where: { ownerId } }) });
    return res.json({ success: true, data: await prisma.job.findMany() });
  }
  if (ownerId) return res.json({ success: true, data: jobs.filter(j => j.ownerId === ownerId) });
  return res.json({ success: true, data: jobs });
};

export const createJob = async (req: Request, res: Response) => {
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const payload = req.body;
  if (prisma) {
    const job = await prisma.job.create({ data: { ownerId: user?.id || 'anonymous', title: payload.title || null, description: payload.description || null, status: payload.status || null } });
    return res.json({ success: true, data: job });
  }
  const job = { id: `job_${Date.now()}`, ownerId: user?.id || 'anonymous', ...payload };
  jobs.push(job);
  return res.json({ success: true, data: job });
};

export const updateJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  if (prisma) {
    const job = await prisma.job.update({ where: { id }, data: payload });
    return res.json({ success: true, data: job });
  }
  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  Object.assign(job, payload);
  return res.json({ success: true, data: job });
};

export const deleteJob = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (prisma) {
    await prisma.job.delete({ where: { id } });
    return res.json({ success: true });
  }
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Job not found' });
  jobs.splice(idx, 1);
  return res.json({ success: true });
};

export const jobAction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const action = (req.params.action || req.body.action) as string;
  if (prisma) {
    const job = await prisma.job.update({ where: { id }, data: { status: action } });
    return res.json({ success: true, data: job });
  }
  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  job.status = action;
  return res.json({ success: true, data: job });
};
