import prisma from '../utils/prismaClient';

type ApprovalPolicySeed = {
  moduleKey: string;
  actionKey: string;
  entityType: string;
  label: string;
  description: string;
  mode: 'AUDIT_ONLY' | 'ENFORCED' | 'DISABLED';
  minApprovals?: number;
};

type SaveApprovalPolicyInput = {
  id?: string;
  moduleKey?: string;
  actionKey?: string;
  entityType?: string;
  label?: string;
  description?: string | null;
  mode?: 'AUDIT_ONLY' | 'ENFORCED' | 'DISABLED';
  minApprovals?: number;
  isActive?: boolean;
};

type CreateApprovalObservationInput = {
  moduleKey: string;
  actionKey: string;
  entityType: string;
  entityId?: string | null;
  title: string;
  summary?: string | null;
  requestedByUserId?: string | null;
  requestedByStaffId?: string | null;
  payload?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
};

const DEFAULT_APPROVAL_POLICIES: ApprovalPolicySeed[] = [
  {
    moduleKey: 'payouts',
    actionKey: 'release',
    entityType: 'payout',
    label: 'Payout release',
    description: 'Review payout releases before funds leave the platform.',
    mode: 'AUDIT_ONLY'
  },
  {
    moduleKey: 'refunds',
    actionKey: 'approve',
    entityType: 'refund',
    label: 'Refund approval',
    description: 'Review refund approvals for governed finance operations.',
    mode: 'AUDIT_ONLY'
  },
  {
    moduleKey: 'rbac',
    actionKey: 'role_change',
    entityType: 'staff_role',
    label: 'Role changes',
    description: 'Review role creation, updates, and deactivation before enforcement is enabled.',
    mode: 'AUDIT_ONLY'
  },
  {
    moduleKey: 'invoices',
    actionKey: 'approve',
    entityType: 'invoice',
    label: 'Invoice approval',
    description: 'Review invoice approvals for enterprise billing.',
    mode: 'AUDIT_ONLY'
  },
  {
    moduleKey: 'settings',
    actionKey: 'enterprise_change',
    entityType: 'platform_settings',
    label: 'Enterprise settings changes',
    description: 'Review platform and system settings changes before enforcement is enabled.',
    mode: 'AUDIT_ONLY'
  }
];

let approvalPoliciesSeeded = false;

const cleanString = (value: unknown) => String(value || '').trim();
const clampMinApprovals = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.floor(parsed)));
};

const normalizeMode = (value?: string | null): 'AUDIT_ONLY' | 'ENFORCED' | 'DISABLED' => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ENFORCED') return 'ENFORCED';
  if (normalized === 'DISABLED') return 'DISABLED';
  return 'AUDIT_ONLY';
};

const mapPolicy = (row: any) => ({
  id: row.id,
  moduleKey: row.moduleKey,
  actionKey: row.actionKey,
  entityType: row.entityType,
  label: row.label,
  description: row.description || '',
  mode: row.mode,
  minApprovals: Number(row.minApprovals || 1),
  isSystemPolicy: Boolean(row.isSystemPolicy),
  isActive: Boolean(row.isActive),
  conditions: row.conditions || null,
  createdByStaffId: row.createdByStaffId || null,
  updatedByStaffId: row.updatedByStaffId || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  requestsCount: Number(row?._count?.requests || 0)
});

const mapRequest = (row: any) => ({
  id: row.id,
  policyId: row.policyId || null,
  moduleKey: row.moduleKey,
  actionKey: row.actionKey,
  entityType: row.entityType,
  entityId: row.entityId || null,
  status: row.status,
  title: row.title,
  summary: row.summary || '',
  requestedByUserId: row.requestedByUserId || null,
  requestedByStaffId: row.requestedByStaffId || null,
  decidedByStaffId: row.decidedByStaffId || null,
  decisionReason: row.decisionReason || '',
  observedOnly: Boolean(row.observedOnly),
  payload: row.payload || null,
  metadata: row.metadata || null,
  requestedAt: row.requestedAt,
  decidedAt: row.decidedAt || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  policy: row.policy
    ? {
        id: row.policy.id,
        label: row.policy.label,
        mode: row.policy.mode,
        minApprovals: row.policy.minApprovals
      }
    : null
});

export const ensureApprovalPoliciesSeeded = async () => {
  if (approvalPoliciesSeeded) return;

  for (const seed of DEFAULT_APPROVAL_POLICIES) {
    await prisma.approvalPolicy.upsert({
      where: {
        moduleKey_actionKey_entityType: {
          moduleKey: seed.moduleKey,
          actionKey: seed.actionKey,
          entityType: seed.entityType
        }
      },
      create: {
        moduleKey: seed.moduleKey,
        actionKey: seed.actionKey,
        entityType: seed.entityType,
        label: seed.label,
        description: seed.description,
        mode: seed.mode,
        minApprovals: seed.minApprovals || 1,
        isSystemPolicy: true,
        isActive: true
      },
      update: {
        label: seed.label,
        description: seed.description,
        minApprovals: seed.minApprovals || 1,
        isSystemPolicy: true
      }
    });
  }

  approvalPoliciesSeeded = true;
};

export const listApprovalPolicies = async () => {
  await ensureApprovalPoliciesSeeded();
  const rows = await prisma.approvalPolicy.findMany({
    include: {
      _count: {
        select: { requests: true }
      }
    },
    orderBy: [{ isSystemPolicy: 'desc' }, { moduleKey: 'asc' }, { actionKey: 'asc' }]
  });
  return rows.map(mapPolicy);
};

export const saveApprovalPolicy = async (input: SaveApprovalPolicyInput, staffId?: string | null) => {
  await ensureApprovalPoliciesSeeded();

  const moduleKey = cleanString(input.moduleKey);
  const actionKey = cleanString(input.actionKey);
  const entityType = cleanString(input.entityType);
  const label = cleanString(input.label);
  if (!moduleKey) throw new Error('moduleKey is required');
  if (!actionKey) throw new Error('actionKey is required');
  if (!entityType) throw new Error('entityType is required');
  if (!label) throw new Error('label is required');

  const data = {
    moduleKey,
    actionKey,
    entityType,
    label,
    description: cleanString(input.description) || null,
    mode: normalizeMode(input.mode),
    minApprovals: clampMinApprovals(input.minApprovals),
    isActive: input.isActive !== false,
    updatedByStaffId: staffId || null
  };

  if (input.id) {
    const row = await prisma.approvalPolicy.update({
      where: { id: input.id },
      data,
      include: { _count: { select: { requests: true } } }
    });
    return mapPolicy(row);
  }

  const row = await prisma.approvalPolicy.create({
    data: {
      ...data,
      createdByStaffId: staffId || null,
      isSystemPolicy: false
    },
    include: { _count: { select: { requests: true } } }
  });
  return mapPolicy(row);
};

export const getApprovalPolicySummary = async () => {
  await ensureApprovalPoliciesSeeded();
  const [policies, observed, pending, approved, rejected] = await prisma.$transaction([
    prisma.approvalPolicy.count({ where: { isActive: true } }),
    prisma.approvalRequest.count({ where: { status: 'OBSERVED' } }),
    prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
    prisma.approvalRequest.count({ where: { status: 'APPROVED' } }),
    prisma.approvalRequest.count({ where: { status: 'REJECTED' } })
  ]);

  return { activePolicies: policies, observed, pending, approved, rejected };
};

export const resolveApprovalPolicy = async (moduleKey: string, actionKey: string, entityType: string) => {
  await ensureApprovalPoliciesSeeded();
  return prisma.approvalPolicy.findFirst({
    where: {
      moduleKey,
      actionKey,
      entityType,
      isActive: true
    }
  });
};

export const createApprovalObservation = async (input: CreateApprovalObservationInput) => {
  const policy =
    (await resolveApprovalPolicy(input.moduleKey, input.actionKey, input.entityType)) ||
    (await resolveApprovalPolicy(input.moduleKey, input.actionKey, 'generic'));

  const effectiveMode = policy ? normalizeMode(policy.mode) : 'DISABLED';
  if (effectiveMode === 'DISABLED') return null;

  const row = await prisma.approvalRequest.create({
    data: {
      policyId: policy?.id || null,
      moduleKey: input.moduleKey,
      actionKey: input.actionKey,
      entityType: input.entityType,
      entityId: input.entityId || null,
      status: effectiveMode === 'ENFORCED' ? 'PENDING' : 'OBSERVED',
      title: input.title,
      summary: input.summary || null,
      requestedByUserId: input.requestedByUserId || null,
      requestedByStaffId: input.requestedByStaffId || null,
      observedOnly: effectiveMode !== 'ENFORCED',
      payload: input.payload || null,
      metadata: {
        ...(input.metadata || {}),
        mode: effectiveMode
      }
    },
    include: {
      policy: {
        select: { id: true, label: true, mode: true, minApprovals: true }
      }
    }
  });
  return mapRequest(row);
};

export const listApprovalRequests = async (params?: {
  status?: string;
  moduleKey?: string;
  limit?: number;
}) => {
  const rows = await prisma.approvalRequest.findMany({
    where: {
      ...(cleanString(params?.status) ? { status: cleanString(params?.status).toUpperCase() } : {}),
      ...(cleanString(params?.moduleKey) ? { moduleKey: cleanString(params?.moduleKey) } : {})
    },
    include: {
      policy: {
        select: { id: true, label: true, mode: true, minApprovals: true }
      }
    },
    orderBy: [{ requestedAt: 'desc' }],
    take: Math.max(1, Math.min(200, Number(params?.limit || 50)))
  });
  return rows.map(mapRequest);
};

export const decideApprovalRequest = async (
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  staffId?: string | null,
  reason?: string | null
) => {
  const row = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: decision,
      decidedByStaffId: staffId || null,
      decisionReason: cleanString(reason) || null,
      decidedAt: new Date()
    },
    include: {
      policy: {
        select: { id: true, label: true, mode: true, minApprovals: true }
      }
    }
  });
  return mapRequest(row);
};
