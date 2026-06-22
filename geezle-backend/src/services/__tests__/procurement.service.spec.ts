export {};

const mockPrisma: any = {
  appSetting: {
    findUnique: jest.fn()
  },
  costCenter: {
    findUnique: jest.fn(),
    count: jest.fn()
  },
  budgetRule: {
    findMany: jest.fn(),
    count: jest.fn()
  },
  purchaseRequest: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn()
  },
  purchaseApproval: {
    findUnique: jest.fn()
  },
  spendAuthorization: {
    create: jest.fn()
  },
  purchaseOrder: {
    create: jest.fn()
  },
  invoiceRecord: {
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn()
  },
  creditNote: {
    create: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('procurement.service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      data: {
        enabled: true,
        enterpriseOnly: true,
        autoHoldOnBudgetExceeded: true,
        defaultApprovalThreshold: 1000,
        invoicePrefix: 'SCI',
        purchaseRequestPrefix: 'PR',
        purchaseOrderPrefix: 'PO',
        spendAuthorizationPrefix: 'SA',
        creditNotePrefix: 'CN',
        invoicePaymentTermsDays: 30
      }
    });
    mockPrisma.costCenter.findUnique.mockResolvedValue({
      id: 'cc-1',
      monthlyBudget: 100,
      quarterlyBudget: null,
      spendCap: 100,
      approvalThreshold: 50
    });
    mockPrisma.budgetRule.findMany.mockResolvedValue([
      {
        id: 'rule-1',
        interval: 'MONTHLY',
        limitAmount: 100,
        alertThresholdPercent: 80,
        hardStop: true,
        approvalThreshold: 50,
        costCenterId: 'cc-1',
        department: null,
        projectCode: null,
        currency: 'USD',
        isActive: true
      }
    ]);
    mockPrisma.purchaseRequest.aggregate.mockResolvedValue({ _sum: { amount: 90 } });
    mockPrisma.purchaseRequest.findMany.mockResolvedValue([{ amount: 90 }]);
    mockPrisma.purchaseRequest.count.mockResolvedValue(0);
    mockPrisma.budgetRule.count.mockResolvedValue(0);
    mockPrisma.costCenter.count.mockResolvedValue(0);
    mockPrisma.invoiceRecord.count.mockResolvedValue(0);
    mockPrisma.invoiceRecord.findMany.mockResolvedValue([]);
  });

  test('puts purchase requests on hold when a hard budget stop is exceeded', async () => {
    mockPrisma.purchaseRequest.create.mockResolvedValue({ id: 'pr-1' });
    mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'ON_HOLD',
      financeStatus: 'ON_HOLD',
      budgetStatus: 'EXCEEDED',
      approvals: [],
      purchaseOrders: [],
      spendAuthorizations: [],
      costCenter: { id: 'cc-1' }
    });

    const service = await import('../procurement.service');
    const result = await service.createPurchaseRequest('user-1', 'staff-1', {
      costCenterId: 'cc-1',
      title: 'Managed sourcing request',
      amount: 25,
      currency: 'usd'
    });

    expect(mockPrisma.purchaseRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ON_HOLD',
          financeStatus: 'ON_HOLD',
          budgetStatus: 'EXCEEDED'
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: 'ON_HOLD', budgetStatus: 'EXCEEDED' }));
  });

  test('generates split billing details for invoice packages', async () => {
    mockPrisma.invoiceRecord.create.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'SCI-001',
      invoiceType: 'PLATFORM',
      status: 'PENDING_APPROVAL',
      department: 'Finance',
      projectCode: 'PRJ-1',
      subtotal: 250,
      taxAmount: 0,
      totalAmount: 250,
      currency: 'USD',
      lineItems: [
        { label: 'Line A', quantity: 1, unitPrice: 100, amount: 100, department: 'Finance', projectCode: 'PRJ-1' },
        { label: 'Line B', quantity: 1, unitPrice: 150, amount: 150, department: 'Ops', projectCode: 'PRJ-2' }
      ],
      costCenter: null
    });
    mockPrisma.invoiceRecord.update.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'SCI-001',
      splitBreakdown: {
        'Finance::PRJ-1': 100,
        'Ops::PRJ-2': 150
      },
      lineItems: [],
      creditNotes: []
    });

    const service = await import('../procurement.service');
    const result = await service.createInvoiceRecord({
      currency: 'usd',
      lineItems: [
        { label: 'Line A', quantity: 1, unitPrice: 100, department: 'Finance', projectCode: 'PRJ-1' },
        { label: 'Line B', quantity: 1, unitPrice: 150, department: 'Ops', projectCode: 'PRJ-2' }
      ]
    });

    expect(mockPrisma.invoiceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splitBreakdown: {
            'Finance::PRJ-1': 100,
            'Ops::PRJ-2': 150
          }
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: 'inv-1' }));
  });
});
