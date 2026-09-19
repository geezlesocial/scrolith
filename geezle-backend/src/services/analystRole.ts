/**
 * Runtime ANALYST policy. This role is intentionally independent from the
 * ADMIN/MODERATOR role families and is limited to existing read-only staff
 * permission semantics.
 */
export const ANALYST_PERMISSION_KEYS = [
  'audit.read',
  'approvals.read',
  'security.alerts.read',
  'settings.read',
  'staff.read',
  'procurement.read',
  'budgets.read',
  'invoices.read',
  'risk.read',
  'compliance.read',
  'talent_cloud.read',
  'integrations.read',
  'webhooks.read',
  'scrolitha.read',
  'managed_delivery.read'
] as const;

export type AnalystPermissionKey = (typeof ANALYST_PERMISSION_KEYS)[number];

export const isAnalystRole = (role?: string | null): boolean =>
  String(role || '').trim().toUpperCase() === 'ANALYST';

export const isAnalystMfaRequiredByPolicy = (role: string | null | undefined, admin2faEnabled: boolean): boolean =>
  admin2faEnabled && isAnalystRole(role);

export const isAnalystPermission = (permissionKey: string): permissionKey is AnalystPermissionKey =>
  (ANALYST_PERMISSION_KEYS as readonly string[]).includes(permissionKey);
