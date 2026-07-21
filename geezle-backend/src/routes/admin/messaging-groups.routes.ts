/**
 * Phase 29.4 — Admin routes for Enterprise Messaging Groups.
 * Mounted at /api/admin/messaging-groups
 */
import express from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac.middleware';
import {
  adminMessagingGroupsOverview,
  adminListMessagingGroups,
  adminGetMessagingGroup,
  adminMessagingGroupAction,
  adminMessagingGroupsAudit,
  adminListAllJoinRequests,
  adminListPolicyTemplates,
  adminGetMessagingGroupSettings,
  adminPutMessagingGroupSettings,
  adminExportMessagingGroups,
  adminMessagingGroupsMetrics
} from '../../controllers/admin.messagingGroups.controller';

const router = express.Router();

// Prefer messaging.groups.* ; also accept chat.read_any for read endpoints via dual permission checks in middleware
// requirePermission accepts single key — use messaging.groups.read which Admin has via ALL_PERMISSION_KEYS after seed.

router.get(
  '/overview',
  requireAnyPermission('messaging.groups.read', 'chat.read_any'),
  adminMessagingGroupsOverview
);
router.get(
  '/metrics',
  requireAnyPermission('messaging.groups.read', 'chat.read_any'),
  adminMessagingGroupsMetrics
);
router.get(
  '/templates',
  requireAnyPermission('messaging.groups.read', 'chat.read_any'),
  adminListPolicyTemplates
);
router.get('/settings', requirePermission('messaging.groups.admin'), adminGetMessagingGroupSettings);
router.put('/settings', requirePermission('messaging.groups.admin'), adminPutMessagingGroupSettings);
router.get(
  '/audit',
  requireAnyPermission('messaging.groups.read', 'chat.audit.read', 'chat.read_any'),
  adminMessagingGroupsAudit
);
router.get(
  '/join-requests',
  requireAnyPermission('messaging.groups.moderate', 'chat.message_any'),
  adminListAllJoinRequests
);
router.get(
  '/export',
  requireAnyPermission('messaging.groups.export', 'chat.records.export'),
  adminExportMessagingGroups
);
router.get('/', requireAnyPermission('messaging.groups.read', 'chat.read_any'), adminListMessagingGroups);
router.get('/:id', requireAnyPermission('messaging.groups.read', 'chat.read_any'), adminGetMessagingGroup);
router.post(
  '/:id/actions',
  requireAnyPermission('messaging.groups.moderate', 'messaging.groups.admin', 'chat.message_any'),
  adminMessagingGroupAction
);

export default router;
