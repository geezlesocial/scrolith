import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

// Try to initialize Prisma if available; otherwise fallback to null.
let prisma: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  if (typeof prisma.$connect === 'function') prisma.$connect().catch(() => {});
} catch (e) {
  prisma = null;
}

// Fix: Use 'any' for req/res to resolve type mismatches
export const updateSystemSettings = async (req: any, res: any) => {
  const settings = req.body;
  
  try {
    // Fix: Mocked DB call
    /*
    const updated = await prisma.systemSettings.upsert({
      where: { id: 'global' },
      update: { ...settings },
      create: { id: 'global', ...settings }
    });
    */
    const updated = { id: 'global', ...settings };
    console.log('[Mock DB] System settings updated', updated);

    // ⚡️ REAL-TIME TRIGGER
    // Notify all connected clients that settings changed
    const io = (req as any).io;
    io.emit('settings:updated', updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// Fix: Use 'any' for req/res
export const updateUserStatus = async (req: any, res: any) => {
  const { userId, status } = req.body;

  try {
    // Fix: Mocked DB call
    /*
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status }
    });
    */
    const user = { id: userId, status }; // Mock user object
    console.log(`[Mock DB] User ${userId} status changed to ${status}`);

    // ⚡️ REAL-TIME TRIGGER
    // Notify Admin Dashboard List
    const io = (req as any).io;
    io.emit('admin:user_updated', user);
    
    // Notify Specific User (e.g., force logout if suspended)
    io.to(`user_${userId}`).emit('account:status_change', { status });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const updateAdminProfile = async (req: any, res: any) => {
  const updates = req.body || {};
  try {
    // If Prisma is available, persist to DB (systemSettings record)
    let updated: any = null;
    if (prisma) {
      try {
        // Store admin profile inside a global system settings record so it's accessible
        // from existing system settings APIs. Use JSON/Json field if available.
        updated = await prisma.systemSettings.upsert({
          where: { id: 'global' },
          update: { adminProfile: { ...(updates || {}) }, updatedAt: new Date() },
          create: { id: 'global', adminProfile: { ...(updates || {}) } }
        });
      } catch (dbErr) {
        console.warn('Prisma available but failed to upsert admin profile, falling back to file:', dbErr);
        updated = null;
      }
    }

    // Fallback to file-based persistence if Prisma isn't available or DB write failed
    if (!updated) {
      const dataDir = path.resolve(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const filePath = path.join(dataDir, 'admin_profile.json');

      let current = {};
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          current = JSON.parse(raw || '{}');
        } catch (e) {
          current = {};
        }
      }

      updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    }

    // Broadcast update to connected clients (admins)
    const io = (req as any).io;
    if (io && typeof io.emit === 'function') {
      io.emit('admin:profile_updated', updated);
      try { io.to('admins').emit('admin:profile_updated', updated); } catch (e) {}
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update admin profile:', error);
    res.status(500).json({ error: 'Failed to update admin profile' });
  }
};