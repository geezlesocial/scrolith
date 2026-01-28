export class WalletService {
  static async getSummary(userId: string) {
    return { balance: '0', available: '0', userId };
  }

  static async getTransactions(opts: { userId: string; page: number; limit: number }) {
    const items = [] as any[];
    return { items, total: 0 };
  }
}

export default WalletService;
