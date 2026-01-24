import { Request, Response } from 'express';
import { prisma } from '../db';

// Fallback in-memory store
const orders: any[] = [];

export const listOrders = async (req: Request, res: Response) => {
  const role = req.query.role as string;
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || null;

  if (prisma) {
    if (role === 'freelancer' && userId) {
      const data = await prisma.order.findMany({ where: { assigneeId: userId } });
      const parsed = data.map((o: any) => ({ ...o, messages: o.messages ? JSON.parse(o.messages) : [], revisions: o.revisions ? JSON.parse(o.revisions) : [] }));
      return res.json({ success: true, data: parsed });
    }
    const data = await prisma.order.findMany({});
    const parsed = data.map((o: any) => ({ ...o, messages: o.messages ? JSON.parse(o.messages) : [], revisions: o.revisions ? JSON.parse(o.revisions) : [] }));
    return res.json({ success: true, data: parsed });
  }

  if (role === 'freelancer' && userId) {
    const filtered = orders.filter(o => o.assigneeId === userId);
    return res.json({ success: true, data: filtered });
  }
  return res.json({ success: true, data: orders });
};

export const getOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const userId = user?.id || null;

  if (prisma) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (req.query.role === 'freelancer' && order.assigneeId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });
    const parsed = { ...order, messages: order.messages ? JSON.parse(order.messages) : [], revisions: order.revisions ? JSON.parse(order.revisions) : [] };
    return res.json({ success: true, data: parsed });
  }

  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (req.query.role === 'freelancer' && order.assigneeId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });
  return res.json({ success: true, data: order });
};

export const deliverOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (prisma) {
    const order = await prisma.order.update({ where: { id }, data: { status: 'Delivered' } });
    const parsed = { ...order, messages: order.messages ? JSON.parse(order.messages) : [], revisions: order.revisions ? JSON.parse(order.revisions) : [] };
    return res.json({ success: true, data: parsed });
  }
  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  order.status = 'Delivered';
  return res.json({ success: true, data: order });
};

export const requestInfo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;
  if (prisma) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const messages = order.messages ? JSON.parse(order.messages) : [];
    messages.push({ from: 'freelancer', message, createdAt: new Date() });
    await prisma.order.update({ where: { id }, data: { messages: JSON.stringify(messages) } });
    return res.json({ success: true });
  }
  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  order.messages = order.messages || [];
  order.messages.push({ from: 'freelancer', message, createdAt: new Date() });
  return res.json({ success: true });
};

export const proposeRevision = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { revision } = req.body;
  if (prisma) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const revisions = order.revisions ? JSON.parse(order.revisions) : [];
    revisions.push({ revision, createdAt: new Date() });
    await prisma.order.update({ where: { id }, data: { revisions: JSON.stringify(revisions) } });
    return res.json({ success: true });
  }
  const order = orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  order.revisions = order.revisions || [];
  order.revisions.push({ revision, createdAt: new Date() });
  return res.json({ success: true });
};
