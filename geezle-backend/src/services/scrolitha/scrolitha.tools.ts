import { FileOwnerRole } from '@prisma/client';
import prisma from '../../utils/prismaClient';
import { listScrolithaAuditLogs } from './scrolitha.audit';
import { updateScrolithaConfig } from './scrolitha.policy';
import type { ScrolithaToolDefinition } from './scrolitha.types';

const s = (v: unknown) => String(v || '').trim();
const n = (v: unknown, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : []);
const role = (v: unknown) => String(v || '').toLowerCase();

const MONETIZATION_STATUS = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED'
} as const;

const AD_STATUS = {
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  REJECTED: 'REJECTED'
} as const;

const fileRole = (r: unknown): FileOwnerRole => {
  const x = role(r);
  if (x.includes('admin')) return 'ADMIN';
  if (x.includes('freelancer') || x.includes('seller')) return 'FREELANCER';
  return 'CLIENT';
};

const ownedFiles = async (actorId: string, actorRole: string, fileIds: string[], isAdmin: boolean) => {
  if (!fileIds.length) return [];
  return prisma.file.findMany({
    where: {
      id: { in: fileIds },
      ...(isAdmin ? {} : { ownerId: actorId, ownerRole: fileRole(actorRole) })
    }
  });
};

const registerUsage = async (fileIds: string[], usageType: string, usageId: string, label?: string) => {
  if (!fileIds.length) return;
  await prisma.fileUsage.createMany({
    data: fileIds.map((fileId) => ({ fileId, usageType, usageId, label: label || null })),
    skipDuplicates: true
  });
};

const userTools: ScrolithaToolDefinition[] = [
  {
    key: 'GET_ME_PROFILE',
    description: 'Fetch current user profile.',
    scope: 'user',
    method: 'GET',
    endpoint: '/api/profile/me',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (_params, ctx) => {
      const [user, profile] = await Promise.all([
        prisma.user.findUnique({ where: { id: ctx.actor.id } }),
        prisma.profile.findUnique({ where: { userId: ctx.actor.id } })
      ]);
      return { success: true, result: { user, profile }, resultSummary: 'Profile loaded.', deepLink: '/profile/edit' };
    }
  },
  {
    key: 'GET_UPLOADED_FILES',
    description: 'List uploaded files.',
    scope: 'user',
    method: 'GET',
    endpoint: '/api/files',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params, ctx) => {
      const take = Math.max(1, Math.min(100, Math.floor(n(params.limit, 20))));
      const rows = await prisma.file.findMany({
        where: { ownerId: ctx.actor.id, ownerRole: fileRole(ctx.actor.role) },
        orderBy: { createdAt: 'desc' },
        take
      });
      return {
        success: true,
        result: {
          files: rows.map((x) => ({ id: x.id, name: x.originalName, mimeType: x.mimeType, url: x.url, thumbnailUrl: x.thumbnailUrl }))
        },
        resultSummary: 'Files loaded.',
        deepLink: '/freelancer/dashboard?tab=uploaded-files'
      };
    }
  },
  {
    key: 'UPLOAD_FILE_TO_LIBRARY',
    description: 'Confirm file exists in Uploaded Files and optionally bind usage.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/files/upload',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    requiresConfirmation: true,
    execute: async (params, ctx) => {
      const fileId = s(params.fileId);
      if (!fileId) throw new Error('fileId is required.');
      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          ...(ctx.actor.isAdmin ? {} : { ownerId: ctx.actor.id, ownerRole: fileRole(ctx.actor.role) })
        }
      });
      if (!file) throw new Error('File not found for this account.');
      const usageType = s(params.usageType);
      const usageId = s(params.usageId);
      if (usageType && usageId) await registerUsage([file.id], usageType, usageId, 'Scrolitha attachment');
      return {
        success: true,
        result: { fileId: file.id, name: file.originalName, mimeType: file.mimeType, url: file.url, usageType: usageType || null, usageId: usageId || null },
        emittedEvents: ['scrolitha:file_attached'],
        resultSummary: 'File available in library.',
        deepLink: '/freelancer/dashboard?tab=uploaded-files'
      };
    }
  },
  {
    key: 'CREATE_GIG',
    description: 'Create gig draft.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/gigs',
    roleScope: ['freelancer', 'admin'],
    requiresConfirmation: true,
    execute: async (params, ctx) => {
      const fileIds = arr(params.fileIds || params.attachmentFileIds);
      const files = await ownedFiles(ctx.actor.id, ctx.actor.role, fileIds, ctx.actor.isAdmin);
      const images = files.filter((f) => String(f.mimeType).startsWith('image/')).map((f) => f.url);
      const videos = files.filter((f) => String(f.mimeType).startsWith('video/')).map((f) => f.url);
      const docs = files.filter((f) => !String(f.mimeType).startsWith('image/') && !String(f.mimeType).startsWith('video/')).map((f) => f.url);
      const title = s(params.title) || 'Untitled Gig';
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'gig'}-${Date.now()}`;
      const gig = await prisma.gig.create({
        data: ({
          title,
          slug,
          description: s(params.description),
          price: Math.max(0, n(params.price, 0)),
          userId: ctx.actor.id,
          images,
          videos,
          documents: docs,
          image: images[0] || null,
          tags: arr(params.tags),
          status: 'DRAFT',
          adminStatus: 'PENDING',
          isActive: false
        } as any)
      });
      await registerUsage(files.map((x) => x.id), 'gig', gig.id, 'Scrolitha gig');
      return {
        success: true,
        result: { gigId: gig.id, status: gig.status.toLowerCase(), attachmentCount: files.length },
        emittedEvents: ['gigs:status_updated'],
        resultSummary: 'Gig draft created.',
        deepLink: '/freelancer/dashboard?tab=gigs'
      };
    }
  },
  {
    key: 'SUBMIT_GIG_FOR_REVIEW',
    description: 'Submit gig draft for review.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/gigs/:id/submit',
    roleScope: ['freelancer', 'admin'],
    requiresConfirmation: true,
    execute: async (params, ctx) => {
      const gigId = s(params.gigId || params.id);
      if (!gigId) throw new Error('gigId is required.');
      const existing = await prisma.gig.findUnique({ where: { id: gigId } });
      if (!existing) throw new Error('Gig not found.');
      if (!ctx.actor.isAdmin && existing.userId !== ctx.actor.id) throw new Error('Not allowed to submit this gig.');
      const gig = await prisma.gig.update({ where: { id: gigId }, data: { status: 'PENDING', adminStatus: 'PENDING', isActive: false } });
      return { success: true, result: { gigId: gig.id, status: gig.status.toLowerCase() }, emittedEvents: ['gigs:status_updated'], resultSummary: 'Gig submitted.', deepLink: '/freelancer/dashboard?tab=gigs' };
    }
  },
  {
    key: 'CREATE_JOB',
    description: 'Create job draft.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/jobs',
    roleScope: ['client', 'employer', 'admin'],
    requiresConfirmation: true,
    execute: async (params, ctx) => {
      const fileIds = arr(params.fileIds || params.attachmentFileIds);
      const files = await ownedFiles(ctx.actor.id, ctx.actor.role, fileIds, ctx.actor.isAdmin);
      const job = await prisma.job.create({
        data: ({
          title: s(params.title) || 'Untitled Job',
          description: s(params.description),
          budget: s(params.budget),
          tags: arr(params.tags),
          attachments: files.map((f) => f.url),
          clientId: ctx.actor.id,
          status: 'DRAFT',
          isActive: false,
          isVisible: false,
          adminStatus: 'PENDING'
        } as any)
      });
      await registerUsage(files.map((x) => x.id), 'job', job.id, 'Scrolitha job');
      return { success: true, result: { jobId: job.id, status: job.status.toLowerCase() }, emittedEvents: ['jobs:status_updated'], resultSummary: 'Job draft created.', deepLink: '/client/dashboard?tab=jobs' };
    }
  },
  {
    key: 'CREATE_TICKET',
    description: 'Create support ticket.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/support/tickets/auth',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    requiresConfirmation: true,
    execute: async (params, ctx) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.actor.id }, select: { id: true, name: true, email: true, phone: true } });
      if (!user) throw new Error('User not found.');
      const msg = s(params.message || params.description);
      if (!msg) throw new Error('message is required.');
      const ticket = await prisma.supportTicket.create({
        data: {
          trackingCode: `SUP-${Date.now()}`,
          userId: user.id,
          fullName: user.name || 'User',
          email: user.email,
          mobile: user.phone || null,
          subject: s(params.subject) || 'Support request',
          message: msg,
          category: s(params.category) || 'General',
          priority: s(params.priority) || 'Low',
          status: 'Open'
        }
      });
      return { success: true, result: { ticketId: ticket.id, trackingCode: ticket.trackingCode }, emittedEvents: ['notifications:new'], resultSummary: 'Support ticket created.', deepLink: '/support' };
    }
  },
  {
    key: 'BLOCK_USER',
    description: 'Block a user.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/community/blocks',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params, ctx) => {
      const blockedId = s(params.targetUserId || params.userId);
      if (!blockedId) throw new Error('targetUserId is required.');
      if (blockedId === ctx.actor.id) throw new Error('Cannot block yourself.');
      const block = await prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: ctx.actor.id, blockedId } }, create: { blockerId: ctx.actor.id, blockedId }, update: {} });
      return { success: true, result: { blockId: block.id, blockedId }, resultSummary: 'User blocked.' };
    }
  },
  {
    key: 'FOLLOW_USER',
    description: 'Follow a user.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/community/follow',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params, ctx) => {
      const followeeId = s(params.targetUserId || params.userId);
      if (!followeeId) throw new Error('targetUserId is required.');
      if (followeeId === ctx.actor.id) throw new Error('Cannot follow yourself.');
      const row = await prisma.userFollow.upsert({ where: { followerId_followeeId: { followerId: ctx.actor.id, followeeId } }, create: { followerId: ctx.actor.id, followeeId }, update: {} });
      return { success: true, result: { followId: row.id, targetUserId: followeeId }, emittedEvents: ['notifications:new'], resultSummary: 'User followed.' };
    }
  },
  {
    key: 'FETCH_NOTIFICATIONS',
    description: 'Fetch my notifications.',
    scope: 'user',
    method: 'GET',
    endpoint: '/api/notifications',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params, ctx) => {
      const take = Math.max(1, Math.min(100, Math.floor(n(params.limit, 20))));
      const rows = await prisma.notification.findMany({ where: { userId: ctx.actor.id }, orderBy: { createdAt: 'desc' }, take });
      return { success: true, result: { notifications: rows }, resultSummary: 'Notifications loaded.' };
    }
  },
  {
    key: 'MARK_NOTIFICATION_READ',
    description: 'Mark notifications read.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/notifications/mark-read',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params, ctx) => {
      const ids = Array.from(new Set(arr(params.ids).concat(s(params.notificationId) ? [s(params.notificationId)] : [])));
      if (!ids.length) throw new Error('notificationId or ids is required.');
      const out = await prisma.notification.updateMany({ where: { id: { in: ids }, userId: ctx.actor.id }, data: { isRead: true } });
      return { success: true, result: { updated: out.count, ids }, emittedEvents: ['notifications:new'], resultSummary: 'Notifications marked read.' };
    }
  },
  {
    key: 'GET_MY_ORDERS',
    description: 'Fetch my orders.',
    scope: 'user',
    method: 'GET',
    endpoint: '/api/orders',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params, ctx) => {
      const take = Math.max(1, Math.min(100, Math.floor(n(params.limit, 20))));
      const r = role(ctx.actor.role);
      const where = r.includes('admin') ? {} : r.includes('freelancer') ? { freelancerId: ctx.actor.id } : { clientId: ctx.actor.id };
      const rows = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take });
      return { success: true, result: { orders: rows }, resultSummary: 'Orders loaded.' };
    }
  },
  {
    key: 'GENERATE_PROJECT_BRIEF',
    description: 'Generate project brief template.',
    scope: 'user',
    method: 'POST',
    endpoint: '/api/scrolitha/brief',
    roleScope: ['freelancer', 'client', 'employer', 'admin'],
    execute: async (params) => {
      const brief = [`Title: ${s(params.title) || 'Project Brief'}`, '', `Objective: ${s(params.objective) || 'Define clear outcomes.'}`, `Scope: ${s(params.scope) || 'Describe scope and constraints.'}`, `Budget: ${s(params.budget) || 'TBD'}`, `Deadline: ${s(params.deadline) || 'TBD'}`].join('\n');
      return { success: true, result: { brief }, resultSummary: 'Brief drafted.', deepLink: '/create-job' };
    }
  }
];

const adminTools: ScrolithaToolDefinition[] = [
  {
    key: 'SEARCH_USERS',
    description: 'Search platform users.',
    scope: 'admin',
    method: 'GET',
    endpoint: '/api/admin/users',
    roleScope: ['admin'],
    execute: async (params) => {
      const q = s(params.query);
      const take = Math.max(1, Math.min(100, Math.floor(n(params.limit, 25))));
      const users = await prisma.user.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {},
        orderBy: { updatedAt: 'desc' },
        take
      });
      return { success: true, result: { users }, resultSummary: `Found ${users.length} users.` };
    }
  },
  {
    key: 'UPDATE_USER_STATUS',
    description: 'Activate or restrict user account.',
    scope: 'admin',
    method: 'POST',
    endpoint: '/api/admin/users/:id/status',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params, ctx) => {
      const userId = s(params.userId);
      if (!userId) throw new Error('userId is required.');
      const isActive = ['active', 'enabled', 'enable'].includes(s(params.status).toLowerCase());
      const user = await prisma.user.update({ where: { id: userId }, data: { isActive } });
      await prisma.accountViolation.create({ data: { userId, type: isActive ? 'admin_reactivate' : 'admin_restrict', severity: isActive ? 'low' : 'high', reason: s(params.reason) || null, metadata: { actorId: ctx.actor.id } } });
      return { success: true, result: { id: user.id, isActive: user.isActive }, emittedEvents: ['notifications:new'], resultSummary: 'User status updated.' };
    }
  },
  {
    key: 'REVIEW_MONETIZATION_APPLICATION',
    description: 'Approve/reject monetization application.',
    scope: 'admin',
    method: 'POST',
    endpoint: '/api/admin/monetization/applications/:id/review',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params, ctx) => {
      const id = s(params.applicationId || params.id);
      const decision = s(params.decision).toLowerCase();
      if (!id) throw new Error('applicationId is required.');
      const status = decision === 'approve' ? MONETIZATION_STATUS.APPROVED : decision === 'reject' ? MONETIZATION_STATUS.REJECTED : decision === 'suspend' ? MONETIZATION_STATUS.SUSPENDED : null;
      if (!status) throw new Error('decision must be approve|reject|suspend.');
      const app = await prisma.monetizationApplication.update({ where: { id }, data: ({ status, reviewedByAdminId: ctx.actor.id, reviewedAt: new Date(), adminNote: s(params.adminNote) || null } as any) });
      if (status === MONETIZATION_STATUS.APPROVED) {
        await prisma.monetizationProfile.upsert({ where: { userId: app.userId }, create: { userId: app.userId, isEnabled: true, enabledAt: new Date() }, update: { isEnabled: true, enabledAt: new Date(), disabledAt: null, disabledReason: null } });
      }
      return { success: true, result: { id: app.id, status: app.status }, emittedEvents: ['notifications:new'], resultSummary: 'Monetization application reviewed.' };
    }
  },
  {
    key: 'CREATE_ROLE',
    description: 'Create staff role.',
    scope: 'admin',
    method: 'POST',
    endpoint: '/api/admin/rbac/roles',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params) => {
      const name = s(params.name);
      if (!name) throw new Error('name is required.');
      const created = await prisma.staffRole.create({ data: { name, description: s(params.description) || null, isSystemRole: false, isActive: true } });
      const keys = arr(params.permissions);
      if (keys.length) {
        const perms = await prisma.staffPermission.findMany({ where: { key: { in: keys } }, select: { id: true } });
        if (perms.length) await prisma.staffRolePermission.createMany({ data: perms.map((p) => ({ roleId: created.id, permissionId: p.id })), skipDuplicates: true });
      }
      return { success: true, result: { roleId: created.id, name: created.name }, resultSummary: 'Role created.' };
    }
  },
  {
    key: 'UPDATE_ROLE_PERMISSIONS',
    description: 'Replace role permissions.',
    scope: 'admin',
    method: 'PUT',
    endpoint: '/api/admin/rbac/roles/:id',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params) => {
      const roleId = s(params.roleId || params.id);
      if (!roleId) throw new Error('roleId is required.');
      const roleRow = await prisma.staffRole.findUnique({ where: { id: roleId }, select: { id: true } });
      if (!roleRow) throw new Error('Role not found.');
      const keys = arr(params.permissions);
      const perms = keys.length ? await prisma.staffPermission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } }) : [];
      await prisma.staffRolePermission.deleteMany({ where: { roleId } });
      if (perms.length) await prisma.staffRolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })), skipDuplicates: true });
      return { success: true, result: { roleId, permissions: perms.map((p) => p.key) }, resultSummary: 'Role permissions updated.' };
    }
  },
  {
    key: 'MODERATE_POST',
    description: 'Moderate community post.',
    scope: 'admin',
    method: 'POST',
    endpoint: '/api/admin/community/moderation/post',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params, ctx) => {
      const postId = s(params.postId || params.id);
      if (!postId) throw new Error('postId is required.');
      const action = s(params.action).toLowerCase();
      const status = action === 'restore' || action === 'approve' ? 'active' : 'deleted';
      const post = await prisma.communityPost.update({ where: { id: postId }, data: { status } });
      const staff = await prisma.staffUser.findUnique({ where: { userId: ctx.actor.id }, select: { id: true } });
      if (staff?.id) {
        await prisma.moderationAuditLog.create({ data: { staffId: staff.id, action: `post_${action || 'moderate'}`, targetType: 'community_post', targetId: postId, metadata: { reason: s(params.reason) || null } } });
      }
      return { success: true, result: { postId: post.id, status: post.status }, emittedEvents: ['community:post_updated'], resultSummary: 'Post moderated.' };
    }
  },
  {
    key: 'REVIEW_ADS',
    description: 'Moderate ads status.',
    scope: 'admin',
    method: 'POST',
    endpoint: '/api/admin/community/ads/review',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params) => {
      const adId = s(params.adId || params.id);
      if (!adId) throw new Error('adId is required.');
      const action = s(params.action).toLowerCase();
      const status = action === 'approve' ? AD_STATUS.APPROVED : action === 'activate' ? AD_STATUS.ACTIVE : action === 'pause' ? AD_STATUS.PAUSED : action === 'reject' ? AD_STATUS.REJECTED : null;
      if (!status) throw new Error('action must be approve|activate|pause|reject.');
      const ad = await prisma.communityAd.update({ where: { id: adId }, data: ({ status, adminReviewNotes: s(params.note) || null } as any) });
      return { success: true, result: { adId: ad.id, status: ad.status }, emittedEvents: ['community:ad_status_updated'], resultSummary: 'Ad reviewed.' };
    }
  },
  {
    key: 'UPDATE_SCROLITHA_POLICIES',
    description: 'Update Scrolitha policy config.',
    scope: 'admin',
    method: 'PUT',
    endpoint: '/api/admin/scrolitha/config',
    roleScope: ['admin'],
    requiresConfirmation: true,
    destructive: true,
    execute: async (params, ctx) => {
      const data = await updateScrolithaConfig({ scope: params.scope || 'admin', enabled: params.enabled, safeMode: params.safeMode, requireConfirmationByDefault: params.requireConfirmationByDefault, lowRiskAutoExecute: params.lowRiskAutoExecute, denyListedTools: params.denyListedTools, promptBlocklist: params.promptBlocklist, userRateLimitPerMinute: params.userRateLimitPerMinute, adminActionCapPerMinute: params.adminActionCapPerMinute, metadata: params.metadata, updatedBy: ctx.actor.id });
      return { success: true, result: data, emittedEvents: ['scrolitha:config_updated'], resultSummary: 'Scrolitha policy updated.' };
    }
  },
  {
    key: 'VIEW_SCROLITHA_AUDIT_LOGS',
    description: 'Read Scrolitha audit logs.',
    scope: 'admin',
    method: 'GET',
    endpoint: '/api/admin/scrolitha/audit',
    roleScope: ['admin'],
    execute: async (params) => {
      const data = await listScrolithaAuditLogs({ scope: s(params.scope) || undefined, actorId: s(params.actorId) || undefined, cursor: s(params.cursor) || undefined, limit: n(params.limit, 50) });
      return { success: true, result: data, resultSummary: 'Audit logs loaded.' };
    }
  }
];

const TOOL_DEFINITIONS: ScrolithaToolDefinition[] = [...userTools, ...adminTools];
const TOOL_MAP = new Map<string, ScrolithaToolDefinition>(TOOL_DEFINITIONS.map((t) => [t.key, t]));

export const getScrolithaToolDefinition = (key: string) => TOOL_MAP.get(String(key || '').trim().toUpperCase()) || null;

export const listScrolithaTools = () => TOOL_DEFINITIONS.map((t) => ({
  key: t.key,
  description: t.description,
  scope: t.scope,
  method: t.method,
  endpoint: t.endpoint,
  roleScope: t.roleScope || [],
  requiresConfirmation: Boolean(t.requiresConfirmation),
  destructive: Boolean(t.destructive)
}));
