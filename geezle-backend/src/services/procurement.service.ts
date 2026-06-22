import prisma from '../utils/prismaClient';

type ProcurementSettings = {
  enabled: boolean;
  enterpriseOnly: boolean;
  autoHoldOnBudgetExceeded: boolean;
  defaultApprovalThreshold: number;
  invoicePrefix: string;
  purchaseRequestPrefix: string;
  purchaseOrderPrefix: string;
  spendAuthorizationPrefix: string;
  creditNotePrefix: string;
  invoicePaymentTermsDays: number;
};

type CostCenterInput = {
  code?: string;
  name?: string;
  department?: string | null;
  projectCode?: string | null;
  currency?: string | null;
  monthlyBudget?: number | null;
  quarterlyBudget?: number | null;
  spendCap?: number | null;
  approvalThreshold?: number | null;
  isActive?: boolean;
  metadata?: Record<string, any> | null;
};

type BudgetRuleInput = {
  costCenterId?: string | null;
  department?: string | null;
  projectCode?: string | null;
  interval?: string;
  limitAmount?: number;
  alertThresholdPercent?: number;
  hardStop?: boolean;
  approvalThreshold?: number | null;
  currency?: string | null;
  isActive?: boolean;
  metadata?: Record<string, any> | null;
};

type PurchaseRequestInput = {
  costCenterId?: string | null;
  department?: string | null;
  projectCode?: string | null;
  title?: string;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number;
  currency?: string | null;
  metadata?: Record<string, any> | null;
  requiredBy?: string | null;
};

type InvoiceLineInput = {
  label: string;
  description?: string | null;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  department?: string | null;
  projectCode?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, any> | null;
};

type InvoiceInput = {
  purchaseRequestId?: string | null;
  purchaseOrderId?: string | null;
  contractId?: string | null;
  orderId?: string | null;
  escrowId?: string | null;
  transactionId?: string | null;
  sellerUserId?: string | null;
  buyerUserId?: string | null;
  costCenterId?: string | null;
  department?: string | null;
  projectCode?: string | null;
  invoiceType?: string | null;
  currency?: string | null;
  taxId?: string | null;
  vatNumber?: string | null;
  gstNumber?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  lineItems?: InvoiceLineInput[];
  metadata?: Record<string, any> | null;
};

const PROCUREMENT_SCOPE = 'procurement_phase2';

const DEFAULT_SETTINGS: ProcurementSettings = {
  enabled: false,
  enterpriseOnly: true,
  autoHoldOnBudgetExceeded: true,
  defaultApprovalThreshold: 1000,
  invoicePrefix: 'SCI',
  purchaseRequestPrefix: 'PR',
  purchaseOrderPrefix: 'PO',
  spendAuthorizationPrefix: 'SA',
  creditNotePrefix: 'CN',
  invoicePaymentTermsDays: 30
};

const cleanString = (value: unknown) => String(value || '').trim();
const normalizeCurrency = (value?: string | null) => cleanString(value || 'USD').toUpperCase() || 'USD';
const toNullableNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed) : null;
};
const toPositiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Number(parsed.toFixed(2));
};
const toBoolean = (value: unknown, fallback = false) => {
  if (value === undefined) return fallback;
  return Boolean(value);
};
const toDate = (value?: string | null) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const nowStamp = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${date}-${time}-${suffix}`;
};

const buildNumber = (prefix: string) => `${cleanString(prefix || 'DOC').toUpperCase()}-${nowStamp()}`;

const getPeriodBounds = (interval: string, date = new Date()) => {
  const normalized = cleanString(interval).toUpperCase();
  if (normalized === 'QUARTERLY') {
    const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999));
    return { start, end };
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
};

const normalizeSettings = (value: any): ProcurementSettings => ({
  enabled: toBoolean(value?.enabled, DEFAULT_SETTINGS.enabled),
  enterpriseOnly: toBoolean(value?.enterpriseOnly, DEFAULT_SETTINGS.enterpriseOnly),
  autoHoldOnBudgetExceeded: toBoolean(value?.autoHoldOnBudgetExceeded, DEFAULT_SETTINGS.autoHoldOnBudgetExceeded),
  defaultApprovalThreshold: Math.max(0, toPositiveNumber(value?.defaultApprovalThreshold, DEFAULT_SETTINGS.defaultApprovalThreshold)),
  invoicePrefix: cleanString(value?.invoicePrefix || DEFAULT_SETTINGS.invoicePrefix) || DEFAULT_SETTINGS.invoicePrefix,
  purchaseRequestPrefix:
    cleanString(value?.purchaseRequestPrefix || DEFAULT_SETTINGS.purchaseRequestPrefix) || DEFAULT_SETTINGS.purchaseRequestPrefix,
  purchaseOrderPrefix:
    cleanString(value?.purchaseOrderPrefix || DEFAULT_SETTINGS.purchaseOrderPrefix) || DEFAULT_SETTINGS.purchaseOrderPrefix,
  spendAuthorizationPrefix:
    cleanString(value?.spendAuthorizationPrefix || DEFAULT_SETTINGS.spendAuthorizationPrefix) ||
    DEFAULT_SETTINGS.spendAuthorizationPrefix,
  creditNotePrefix: cleanString(value?.creditNotePrefix || DEFAULT_SETTINGS.creditNotePrefix) || DEFAULT_SETTINGS.creditNotePrefix,
  invoicePaymentTermsDays: Math.max(1, Math.min(180, Math.floor(Number(value?.invoicePaymentTermsDays || DEFAULT_SETTINGS.invoicePaymentTermsDays))))
});

export const getProcurementSettings = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: PROCUREMENT_SCOPE } });
  return normalizeSettings(record?.data || DEFAULT_SETTINGS);
};

export const updateProcurementSettings = async (input: Partial<ProcurementSettings>) => {
  const existing = await getProcurementSettings();
  const normalized = normalizeSettings({ ...existing, ...(input || {}) });
  await prisma.appSetting.upsert({
    where: { scope: PROCUREMENT_SCOPE },
    create: { scope: PROCUREMENT_SCOPE, data: normalized },
    update: { data: normalized }
  });
  return normalized;
};

export const listCostCenters = async () => {
  return prisma.costCenter.findMany({
    include: {
      _count: {
        select: { budgetRules: true, purchaseRequests: true, invoices: true }
      }
    },
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }]
  });
};

export const saveCostCenter = async (input: CostCenterInput, id?: string) => {
  const code = cleanString(input.code);
  const name = cleanString(input.name);
  if (!code) throw new Error('code is required');
  if (!name) throw new Error('name is required');

  const data = {
    code,
    name,
    department: cleanString(input.department) || null,
    projectCode: cleanString(input.projectCode) || null,
    currency: normalizeCurrency(input.currency),
    monthlyBudget: toNullableNumber(input.monthlyBudget),
    quarterlyBudget: toNullableNumber(input.quarterlyBudget),
    spendCap: toNullableNumber(input.spendCap),
    approvalThreshold: toNullableNumber(input.approvalThreshold),
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };

  if (id) {
    return prisma.costCenter.update({ where: { id }, data });
  }
  return prisma.costCenter.create({ data });
};

export const listBudgetRules = async () => {
  return prisma.budgetRule.findMany({
    include: { costCenter: true },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
  });
};

export const saveBudgetRule = async (input: BudgetRuleInput, id?: string) => {
  const limitAmount = toPositiveNumber(input.limitAmount, NaN as any);
  if (!Number.isFinite(limitAmount)) throw new Error('limitAmount is required');
  const data = {
    costCenterId: cleanString(input.costCenterId) || null,
    department: cleanString(input.department) || null,
    projectCode: cleanString(input.projectCode) || null,
    interval: cleanString(input.interval || 'MONTHLY').toUpperCase(),
    limitAmount,
    alertThresholdPercent: Math.max(1, Math.min(100, toPositiveNumber(input.alertThresholdPercent, 80))),
    hardStop: input.hardStop !== false,
    approvalThreshold: toNullableNumber(input.approvalThreshold),
    currency: normalizeCurrency(input.currency),
    isActive: input.isActive !== false,
    metadata: input.metadata || null
  };
  if (id) return prisma.budgetRule.update({ where: { id }, data });
  return prisma.budgetRule.create({ data });
};

const evaluateBudgetAgainstRules = async (params: {
  costCenterId?: string | null;
  department?: string | null;
  projectCode?: string | null;
  amount: number;
}) => {
  const costCenter = cleanString(params.costCenterId)
    ? await prisma.costCenter.findUnique({ where: { id: cleanString(params.costCenterId) } })
    : null;

  const rules = await prisma.budgetRule.findMany({
    where: {
      isActive: true,
      OR: [
        ...(costCenter?.id ? [{ costCenterId: costCenter.id }] : []),
        ...(cleanString(params.department) ? [{ department: cleanString(params.department) }] : []),
        ...(cleanString(params.projectCode) ? [{ projectCode: cleanString(params.projectCode) }] : [])
      ]
    },
    orderBy: [{ hardStop: 'desc' }, { limitAmount: 'asc' }]
  });

  const matchedRules = rules.length ? rules : [];
  const interval = matchedRules[0]?.interval || 'MONTHLY';
  const { start, end } = getPeriodBounds(interval);

  const where = {
    createdAt: { gte: start, lte: end },
    status: { in: ['APPROVED', 'AUTHORIZED', 'ORDERED', 'INVOICED'] as string[] },
    ...(costCenter?.id ? { costCenterId: costCenter.id } : {}),
    ...(cleanString(params.department) ? { department: cleanString(params.department) } : {}),
    ...(cleanString(params.projectCode) ? { projectCode: cleanString(params.projectCode) } : {})
  } as any;

  const [existingRequests, existingInvoices] = await Promise.all([
    prisma.purchaseRequest.findMany({ where, select: { amount: true } }),
    prisma.invoiceRecord.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(costCenter?.id ? { costCenterId: costCenter.id } : {}),
        ...(cleanString(params.department) ? { department: cleanString(params.department) } : {}),
        ...(cleanString(params.projectCode) ? { projectCode: cleanString(params.projectCode) } : {})
      },
      select: { totalAmount: true }
    })
  ]);

  const consumed = existingRequests.reduce((sum, row) => sum + Number(row.amount || 0), 0) +
    existingInvoices.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const projected = consumed + Number(params.amount || 0);

  const ceilingCandidates = [
    toNullableNumber(costCenter?.spendCap),
    toNullableNumber(costCenter?.monthlyBudget),
    interval === 'QUARTERLY' ? toNullableNumber(costCenter?.quarterlyBudget) : null,
    ...matchedRules.map((rule) => Number(rule.limitAmount || 0))
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  const alertThresholdCandidates = matchedRules.map((rule) => Number(rule.alertThresholdPercent || 80));
  const hardStop = matchedRules.some((rule) => rule.hardStop);
  const approvalThresholdCandidates = [
    toNullableNumber(costCenter?.approvalThreshold),
    ...matchedRules.map((rule) => toNullableNumber(rule.approvalThreshold))
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);

  const ceiling = ceilingCandidates.length ? Math.min(...ceilingCandidates) : null;
  const alertThresholdPercent = alertThresholdCandidates.length ? Math.min(...alertThresholdCandidates) : 80;
  const approvalThreshold = approvalThresholdCandidates.length ? Math.min(...approvalThresholdCandidates) : null;
  const percentUsed = ceiling && ceiling > 0 ? Number(((projected / ceiling) * 100).toFixed(2)) : 0;

  let budgetStatus: 'WITHIN_BUDGET' | 'ALERT' | 'EXCEEDED' = 'WITHIN_BUDGET';
  if (ceiling && projected > ceiling) budgetStatus = 'EXCEEDED';
  else if (ceiling && percentUsed >= alertThresholdPercent) budgetStatus = 'ALERT';

  return {
    costCenter,
    rules: matchedRules,
    interval,
    consumed,
    projected,
    ceiling,
    percentUsed,
    hardStop,
    budgetStatus,
    approvalThreshold
  };
};

export const createPurchaseRequest = async (
  requesterUserId: string,
  requesterStaffId: string | null,
  input: PurchaseRequestInput
) => {
  const settings = await getProcurementSettings();
  if (!settings.enabled) throw new Error('Procurement is not enabled');

  const title = cleanString(input.title);
  const amount = toPositiveNumber(input.amount, NaN as any);
  if (!title) throw new Error('title is required');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero');

  const budget = await evaluateBudgetAgainstRules({
    costCenterId: input.costCenterId,
    department: input.department,
    projectCode: input.projectCode,
    amount
  });

  const threshold = budget.approvalThreshold ?? settings.defaultApprovalThreshold;
  const requestNumber = buildNumber(settings.purchaseRequestPrefix);
  const shouldHold = budget.budgetStatus === 'EXCEEDED' && settings.autoHoldOnBudgetExceeded && budget.hardStop;
  const requiresApproval = amount >= threshold;

  const status = shouldHold ? 'ON_HOLD' : requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';
  const financeStatus = shouldHold ? 'ON_HOLD' : requiresApproval ? 'PENDING' : 'AUTHORIZED';

  const created = await prisma.purchaseRequest.create({
    data: {
      requestNumber,
      requesterUserId: requesterUserId || null,
      requesterStaffId: requesterStaffId || null,
      costCenterId: cleanString(input.costCenterId) || null,
      department: cleanString(input.department) || null,
      projectCode: cleanString(input.projectCode) || null,
      title,
      description: cleanString(input.description) || null,
      entityType: cleanString(input.entityType || 'generic') || 'generic',
      entityId: cleanString(input.entityId) || null,
      amount,
      currency: normalizeCurrency(input.currency),
      status,
      budgetStatus: budget.budgetStatus,
      financeStatus,
      approvalThresholdAmount: threshold,
      spendCapAtRequest: budget.ceiling,
      requiredBy: toDate(input.requiredBy),
      approvedAt: requiresApproval || shouldHold ? null : new Date(),
      metadata: {
        ...(input.metadata || {}),
        budget: {
          consumed: budget.consumed,
          projected: budget.projected,
          ceiling: budget.ceiling,
          percentUsed: budget.percentUsed,
          interval: budget.interval
        }
      }
    }
  });

  if (!requiresApproval && !shouldHold) {
    await createSpendAuthorizationForRequest(created.id, created.amount, created.currency, null);
    await createPurchaseOrderForRequest(created.id, created.amount, created.currency, {
      supplierName: cleanString((input.metadata as any)?.supplierName)
    });
  }

  return prisma.purchaseRequest.findUnique({
    where: { id: created.id },
    include: {
      approvals: true,
      purchaseOrders: true,
      spendAuthorizations: true,
      costCenter: true
    }
  });
};

const createSpendAuthorizationForRequest = async (
  purchaseRequestId: string,
  approvedAmount: number,
  currency: string,
  approvedByStaffId: string | null
) => {
  const settings = await getProcurementSettings();
  return prisma.spendAuthorization.create({
    data: {
      authorizationNumber: buildNumber(settings.spendAuthorizationPrefix),
      purchaseRequestId,
      approvedAmount,
      currency: normalizeCurrency(currency),
      status: 'ACTIVE',
      approvedByStaffId: approvedByStaffId || null,
      expiresAt: new Date(Date.now() + settings.invoicePaymentTermsDays * 24 * 60 * 60 * 1000)
    }
  });
};

const createPurchaseOrderForRequest = async (
  purchaseRequestId: string,
  totalAmount: number,
  currency: string,
  metadata?: Record<string, any> | null
) => {
  const settings = await getProcurementSettings();
  return prisma.purchaseOrder.create({
    data: {
      poNumber: buildNumber(settings.purchaseOrderPrefix),
      purchaseRequestId,
      supplierName: cleanString(metadata?.supplierName) || null,
      totalAmount,
      currency: normalizeCurrency(currency),
      status: 'ISSUED',
      metadata: metadata || null
    }
  });
};

export const listPurchaseRequests = async (params?: {
  status?: string;
  financeStatus?: string;
  costCenterId?: string;
  query?: string;
  limit?: number;
}) => {
  const query = cleanString(params?.query);
  return prisma.purchaseRequest.findMany({
    where: {
      ...(cleanString(params?.status) ? { status: cleanString(params?.status).toUpperCase() } : {}),
      ...(cleanString(params?.financeStatus) ? { financeStatus: cleanString(params?.financeStatus).toUpperCase() } : {}),
      ...(cleanString(params?.costCenterId) ? { costCenterId: cleanString(params?.costCenterId) } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { requestNumber: { contains: query, mode: 'insensitive' } },
              { department: { contains: query, mode: 'insensitive' } },
              { projectCode: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      approvals: { orderBy: { createdAt: 'desc' } },
      purchaseOrders: true,
      spendAuthorizations: true,
      costCenter: true
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, Number(params?.limit || 50)))
  });
};

export const listApprovalQueue = async () => {
  return prisma.purchaseRequest.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'ON_HOLD'] } },
    include: { costCenter: true, approvals: { orderBy: { createdAt: 'desc' } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
  });
};

export const decidePurchaseRequest = async (
  purchaseRequestId: string,
  action: 'APPROVED' | 'REJECTED' | 'ON_HOLD',
  actorUserId: string | null,
  actorStaffId: string | null,
  note?: string | null,
  idempotencyKey?: string | null
) => {
  const existingApprovalKey = cleanString(idempotencyKey);
  if (existingApprovalKey) {
    const existing = await prisma.purchaseApproval.findUnique({ where: { idempotencyKey: existingApprovalKey } });
    if (existing) {
      return prisma.purchaseRequest.findUnique({
        where: { id: purchaseRequestId },
        include: { approvals: true, purchaseOrders: true, spendAuthorizations: true, costCenter: true }
      });
    }
  }

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    include: { purchaseOrders: true, spendAuthorizations: true }
  });
  if (!request) throw new Error('Purchase request not found');

  const nextStatus = action === 'APPROVED' ? 'APPROVED' : action === 'REJECTED' ? 'REJECTED' : 'ON_HOLD';
  const nextFinanceStatus = action === 'APPROVED' ? 'AUTHORIZED' : action === 'REJECTED' ? 'REJECTED' : 'ON_HOLD';

  await prisma.$transaction(async (tx) => {
    await tx.purchaseApproval.create({
      data: {
        purchaseRequestId,
        actorUserId: actorUserId || null,
        actorStaffId: actorStaffId || null,
        action,
        note: cleanString(note) || null,
        idempotencyKey: existingApprovalKey || null
      }
    });

    await tx.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: {
        status: nextStatus,
        financeStatus: nextFinanceStatus,
        approvedAt: action === 'APPROVED' ? new Date() : request.approvedAt,
        rejectedAt: action === 'REJECTED' ? new Date() : request.rejectedAt
      }
    });

    if (action === 'APPROVED') {
      if (!request.spendAuthorizations.length) {
        await tx.spendAuthorization.create({
          data: {
            authorizationNumber: buildNumber(DEFAULT_SETTINGS.spendAuthorizationPrefix),
            purchaseRequestId,
            approvedAmount: request.amount,
            currency: request.currency,
            status: 'ACTIVE',
            approvedByStaffId: actorStaffId || null,
            expiresAt: new Date(Date.now() + DEFAULT_SETTINGS.invoicePaymentTermsDays * 24 * 60 * 60 * 1000)
          }
        });
      }
      if (!request.purchaseOrders.length) {
        await tx.purchaseOrder.create({
          data: {
            poNumber: buildNumber(DEFAULT_SETTINGS.purchaseOrderPrefix),
            purchaseRequestId,
            totalAmount: request.amount,
            currency: request.currency,
            status: 'ISSUED'
          }
        });
      }
    }
  });

  return prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    include: { approvals: true, purchaseOrders: true, spendAuthorizations: true, costCenter: true }
  });
};

const normalizeInvoiceLine = (line: InvoiceLineInput) => {
  const quantity = Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : 1;
  const unitPrice = Number.isFinite(Number(line.unitPrice)) ? Number(line.unitPrice) : 0;
  const amount = Number.isFinite(Number(line.amount)) ? Number(line.amount) : Number((quantity * unitPrice).toFixed(2));
  return {
    label: cleanString(line.label),
    description: cleanString(line.description) || null,
    quantity,
    unitPrice,
    amount,
    department: cleanString(line.department) || null,
    projectCode: cleanString(line.projectCode) || null,
    sourceType: cleanString(line.sourceType) || null,
    sourceId: cleanString(line.sourceId) || null,
    metadata: line.metadata || null
  };
};

const buildInvoiceDocument = (invoice: any) => {
  const lines = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  const html = [
    `<h1>Invoice ${invoice.invoiceNumber}</h1>`,
    `<p>Type: ${invoice.invoiceType}</p>`,
    `<p>Status: ${invoice.status}</p>`,
    `<p>Department: ${invoice.department || '-'}</p>`,
    `<p>Project: ${invoice.projectCode || '-'}</p>`,
    '<table border="1" cellspacing="0" cellpadding="6">',
    '<thead><tr><th>Label</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>',
    '<tbody>',
    ...lines.map(
      (line: any) =>
        `<tr><td>${line.label}</td><td>${line.quantity}</td><td>${line.unitPrice}</td><td>${line.amount}</td></tr>`
    ),
    '</tbody></table>',
    `<p>Subtotal: ${invoice.subtotal} ${invoice.currency}</p>`,
    `<p>Tax: ${invoice.taxAmount} ${invoice.currency}</p>`,
    `<p>Total: ${invoice.totalAmount} ${invoice.currency}</p>`
  ].join('');

  const splitBreakdown = lines.reduce((acc: Record<string, number>, line: any) => {
    const key = `${line.department || 'unassigned'}::${line.projectCode || 'unassigned'}`;
    acc[key] = Number(((acc[key] || 0) + Number(line.amount || 0)).toFixed(2));
    return acc;
  }, {});

  return { html, splitBreakdown };
};

export const createInvoiceRecord = async (input: InvoiceInput) => {
  const settings = await getProcurementSettings();
  if (!settings.enabled) throw new Error('Procurement is not enabled');

  const lineItems = (Array.isArray(input.lineItems) ? input.lineItems : [])
    .map(normalizeInvoiceLine)
    .filter((line) => line.label);
  if (!lineItems.length) throw new Error('At least one line item is required');

  const subtotal = Number(lineItems.reduce((sum, line) => sum + Number(line.amount || 0), 0).toFixed(2));
  const taxAmount = 0;
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));
  const invoiceNumber = buildNumber(settings.invoicePrefix);

  const created = await prisma.invoiceRecord.create({
    data: {
      invoiceNumber,
      purchaseRequestId: cleanString(input.purchaseRequestId) || null,
      purchaseOrderId: cleanString(input.purchaseOrderId) || null,
      contractId: cleanString(input.contractId) || null,
      orderId: cleanString(input.orderId) || null,
      escrowId: cleanString(input.escrowId) || null,
      transactionId: cleanString(input.transactionId) || null,
      sellerUserId: cleanString(input.sellerUserId) || null,
      buyerUserId: cleanString(input.buyerUserId) || null,
      costCenterId: cleanString(input.costCenterId) || null,
      invoiceType: cleanString(input.invoiceType || 'PLATFORM').toUpperCase(),
      status: 'PENDING_APPROVAL',
      reconciliationStatus: 'PENDING',
      department: cleanString(input.department) || null,
      projectCode: cleanString(input.projectCode) || null,
      subtotal,
      taxAmount,
      totalAmount,
      currency: normalizeCurrency(input.currency),
      taxId: cleanString(input.taxId) || null,
      vatNumber: cleanString(input.vatNumber) || null,
      gstNumber: cleanString(input.gstNumber) || null,
      billingPeriodStart: toDate(input.billingPeriodStart),
      billingPeriodEnd: toDate(input.billingPeriodEnd),
      metadata: input.metadata || null,
      lineItems: {
        create: lineItems
      }
    },
    include: {
      lineItems: true,
      costCenter: true
    }
  });

  const document = buildInvoiceDocument(created);
  return prisma.invoiceRecord.update({
    where: { id: created.id },
    data: {
      documentPayload: {
        html: document.html,
        filename: `${created.invoiceNumber}.html`
      },
      splitBreakdown: document.splitBreakdown
    },
    include: {
      lineItems: true,
      costCenter: true,
      purchaseOrder: true,
      purchaseRequest: true,
      creditNotes: true
    }
  });
};

export const listInvoiceRecords = async (params?: {
  status?: string;
  reconciliationStatus?: string;
  invoiceType?: string;
  costCenterId?: string;
  query?: string;
  limit?: number;
}) => {
  const query = cleanString(params?.query);
  return prisma.invoiceRecord.findMany({
    where: {
      ...(cleanString(params?.status) ? { status: cleanString(params?.status).toUpperCase() } : {}),
      ...(cleanString(params?.reconciliationStatus)
        ? { reconciliationStatus: cleanString(params?.reconciliationStatus).toUpperCase() }
        : {}),
      ...(cleanString(params?.invoiceType) ? { invoiceType: cleanString(params?.invoiceType).toUpperCase() } : {}),
      ...(cleanString(params?.costCenterId) ? { costCenterId: cleanString(params?.costCenterId) } : {}),
      ...(query
        ? {
            OR: [
              { invoiceNumber: { contains: query, mode: 'insensitive' } },
              { department: { contains: query, mode: 'insensitive' } },
              { projectCode: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      lineItems: true,
      costCenter: true,
      purchaseOrder: true,
      purchaseRequest: true,
      creditNotes: true
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, Number(params?.limit || 50)))
  });
};

export const updateInvoiceStatus = async (
  invoiceId: string,
  status: 'APPROVED' | 'RECONCILED',
  metadata?: Record<string, any> | null
) => {
  const row = await prisma.invoiceRecord.update({
    where: { id: invoiceId },
    data:
      status === 'APPROVED'
        ? {
            status: 'APPROVED',
            approvedAt: new Date(),
            metadata: metadata ? { ...(metadata || {}) } : undefined
          }
        : {
            reconciliationStatus: 'RECONCILED',
            status: 'RECONCILED',
            reconciledAt: new Date(),
            metadata: metadata ? { ...(metadata || {}) } : undefined
          },
    include: {
      lineItems: true,
      costCenter: true,
      purchaseOrder: true,
      purchaseRequest: true,
      creditNotes: true
    }
  });
  return row;
};

export const getInvoicePackage = async (invoiceId: string) => {
  const invoice = await prisma.invoiceRecord.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true, creditNotes: true, costCenter: true, purchaseOrder: true, purchaseRequest: true }
  });
  if (!invoice) throw new Error('Invoice not found');
  const document = invoice.documentPayload && typeof invoice.documentPayload === 'object'
    ? invoice.documentPayload
    : buildInvoiceDocument(invoice);
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    filename: `${invoice.invoiceNumber}.html`,
    contentType: 'text/html',
    document,
    splitBreakdown: invoice.splitBreakdown || {},
    creditNotes: invoice.creditNotes || []
  };
};

export const generateConsolidatedInvoicePackage = async (params: {
  costCenterId?: string;
  department?: string;
  projectCode?: string;
  month?: string;
}) => {
  const monthDate = toDate(params.month ? `${params.month}-01T00:00:00.000Z` : null) || new Date();
  const { start, end } = getPeriodBounds('MONTHLY', monthDate);
  const invoices = await prisma.invoiceRecord.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      ...(cleanString(params.costCenterId) ? { costCenterId: cleanString(params.costCenterId) } : {}),
      ...(cleanString(params.department) ? { department: cleanString(params.department) } : {}),
      ...(cleanString(params.projectCode) ? { projectCode: cleanString(params.projectCode) } : {})
    },
    include: { lineItems: true, creditNotes: true }
  });

  const total = Number(invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0).toFixed(2));
  const html = [
    `<h1>Consolidated invoice package ${start.toISOString().slice(0, 7)}</h1>`,
    `<p>Invoices: ${invoices.length}</p>`,
    `<p>Total: ${total}</p>`,
    '<ul>',
    ...invoices.map((invoice) => `<li>${invoice.invoiceNumber} - ${invoice.totalAmount} ${invoice.currency}</li>`),
    '</ul>'
  ].join('');

  return {
    filename: `consolidated-${start.toISOString().slice(0, 7)}.html`,
    contentType: 'text/html',
    total,
    invoices,
    document: html
  };
};

export const createCreditNote = async (invoiceId: string, amount: number, reason: string) => {
  const settings = await getProcurementSettings();
  const invoice = await prisma.invoiceRecord.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found');
  if (!reason.trim()) throw new Error('reason is required');
  return prisma.creditNote.create({
    data: {
      creditNoteNumber: buildNumber(settings.creditNotePrefix),
      invoiceId,
      amount: toPositiveNumber(amount),
      currency: invoice.currency,
      reason: cleanString(reason),
      status: 'ISSUED'
    }
  });
};

export const getProcurementSummary = async () => {
  const [costCenters, rules, pendingApprovals, invoicesPending, reconciledInvoices, openPurchaseRequests] = await Promise.all([
    prisma.costCenter.count({ where: { isActive: true } }),
    prisma.budgetRule.count({ where: { isActive: true } }),
    prisma.purchaseRequest.count({ where: { status: { in: ['PENDING_APPROVAL', 'ON_HOLD'] } } }),
    prisma.invoiceRecord.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.invoiceRecord.count({ where: { reconciliationStatus: 'RECONCILED' } }),
    prisma.purchaseRequest.count({ where: { status: { notIn: ['REJECTED'] } } })
  ]);

  return {
    costCenters,
    budgetRules: rules,
    pendingApprovals,
    invoicesPending,
    reconciledInvoices,
    openPurchaseRequests
  };
};
