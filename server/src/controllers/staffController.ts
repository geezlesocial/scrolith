import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';

const defaultRoles = [
  { name: 'Super Admin', level: 100, permissions: { all: true } },
  { name: 'Manager', level: 50, permissions: { users: true, content: true, commerce: true } },
  { name: 'Support Agent', level: 10, permissions: { tickets: true, users: true } }
];

const ensureDefaultRoles = async () => {
  if (!prisma) return;
  const count = await prisma.staffRole.count();
  if (count > 0) return;
  await prisma.staffRole.createMany({ data: defaultRoles });
};

const hashPassword = (password?: string) => {
  if (!password) return undefined;
  return crypto.createHash('sha256').update(password).digest('hex');
};

export const getRoles = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  await ensureDefaultRoles();
  const roles = await prisma.staffRole.findMany({ orderBy: { level: 'desc' } });
  return res.json({ success: true, data: roles });
};

export const getStaff = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  await ensureDefaultRoles();
  const staff = await prisma.staffMember.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' }
  });
  const mapped = staff.map((member) => ({
    id: member.id,
    name: member.name,
    username: member.username,
    email: member.email,
    roleId: member.roleId,
    roleName: member.role?.name || member.roleName || '',
    avatar: member.avatar || '',
    status: member.status || 'active',
    twoFactorEnabled: member.twoFactorEnabled,
    forcePasswordReset: member.forcePasswordReset,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  }));
  return res.json({ success: true, data: mapped });
};

export const saveStaff = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  await ensureDefaultRoles();
  const payload = req.body || {};
  if (!payload.name || !payload.email || !payload.username || !payload.roleId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const role = await prisma.staffRole.findUnique({ where: { id: payload.roleId } });
  if (!role) return res.status(400).json({ success: false, error: 'Invalid role' });

  const data: any = {
    name: payload.name,
    username: payload.username,
    email: payload.email,
    roleId: payload.roleId,
    roleName: role.name,
    avatar: payload.avatar || null,
    status: payload.status || 'active',
    twoFactorEnabled: Boolean(payload.twoFactorEnabled),
    forcePasswordReset: Boolean(payload.forcePasswordReset)
  };

  if (payload.password) {
    data.passwordHash = hashPassword(payload.password);
  }

  let staff;
  if (payload.id) {
    staff = await prisma.staffMember.update({ where: { id: payload.id }, data });
  } else {
    staff = await prisma.staffMember.create({ data });
  }

  return res.json({
    success: true,
    data: {
      id: staff.id,
      name: staff.name,
      username: staff.username,
      email: staff.email,
      roleId: staff.roleId,
      roleName: role.name,
      avatar: staff.avatar || '',
      status: staff.status,
      twoFactorEnabled: staff.twoFactorEnabled,
      forcePasswordReset: staff.forcePasswordReset
    }
  });
};

export const deleteStaff = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  await prisma.staffMember.delete({ where: { id } });
  return res.json({ success: true, data: { id } });
};

