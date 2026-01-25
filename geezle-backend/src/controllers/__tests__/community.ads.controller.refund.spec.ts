import { rejectAd } from '../community.ads.controller';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) }
  }));
});

const mockUpdate = jest.fn();
const mockFindMany = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../utils/prismaClient', () => ({
  communityAd: { update: jest.fn() },
  adPayment: {
    findMany: (...args: any[]) => mockFindMany(...args),
    update: (...args: any[]) => mockUpdate(...args),
    create: (...args: any[]) => mockCreate(...args)
  }
}));

describe('rejectAd refund flow', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
  });

  test('marks payments refunded and creates refund records when refund=true', async () => {
    const payments = [{ id: 'p1', transactionId: 'pi_1', amount: 25, currency: 'USD' }];
    mockFindMany.mockResolvedValueOnce(payments);

    const req: any = {
      params: { id: 'ad123' },
      body: { refund: true },
      app: { get: () => ({ emit: () => {} }) }
    };

    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await rejectAd(req, res);

    // original payment marked refunded
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'refunded' } });

    // refund record created with negative amount
    expect(mockCreate).toHaveBeenCalledWith({ data: {
      adId: 'ad123',
      transactionId: 're_1',
      amount: -25,
      currency: 'USD',
      status: 'refunded'
    } });

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
