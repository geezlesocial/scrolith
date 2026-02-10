
import { Wallet, WalletTransaction, PlatformFinancials, WithdrawalRequest, Escrow, TransactionType, EscrowStatus, GlobalCommissionSettings } from '../types';
import { fraudService } from './ai';

// Mock Storage
const WALLETS_KEY = 'scrolith_wallets';
const TRANSACTIONS_KEY = 'scrolith_transactions';
const WITHDRAWALS_KEY = 'scrolith_withdrawals';
const ESCROWS_KEY = 'scrolith_escrows'; // New key for Escrows
const COMMISSIONS_KEY = 'scrolith_commission_settings';

const INITIAL_WALLET: Wallet = {
    id: 'w-init',
    userId: '',
    availableBalance: 0,
    pendingClearance: 0,
    escrowBalance: 0,
    frozen: false,
    currency: 'USD',
    updatedAt: new Date().toISOString()
};

const DEFAULT_COMMISSION_SETTINGS: GlobalCommissionSettings = {
    freelancerFeeType: 'percentage',
    freelancerFeeValue: 20, // 20%
    employerFeeType: 'percentage',
    employerFeeValue: 0, // 0%
    minimumFee: 2 // $2 minimum
};

export const WalletService = {
    
    // --- Data Management ---
    
    getAllWallets: async (): Promise<Wallet[]> => {
        try {
            const stored = localStorage.getItem(WALLETS_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    },

    getWallet: async (userId: string): Promise<Wallet> => {
        const wallets = await WalletService.getAllWallets();
        let wallet = wallets.find(w => w.userId === userId);
        
        if (!wallet) {
            wallet = { ...INITIAL_WALLET, id: `w-${userId}`, userId };
            wallets.push(wallet);
            localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets));
        }
        return wallet;
    },

    getAllTransactions: async (): Promise<WalletTransaction[]> => {
        try {
            const stored = localStorage.getItem(TRANSACTIONS_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    },

    getUserTransactions: async (walletId: string): Promise<WalletTransaction[]> => {
        const txs = await WalletService.getAllTransactions();
        return txs.filter(t => t.walletId === walletId).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    getAllEscrows: async (): Promise<Escrow[]> => {
        try {
            const stored = localStorage.getItem(ESCROWS_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    },

    getUserEscrows: async (userId: string, role: 'client' | 'freelancer'): Promise<Escrow[]> => {
        const escrows = await WalletService.getAllEscrows();
        return escrows.filter(e => role === 'client' ? e.clientId === userId : e.freelancerId === userId);
    },

    // --- Core Actions ---

    recordTransaction: async (tx: WalletTransaction): Promise<void> => {
        const txs = await WalletService.getAllTransactions();
        txs.unshift(tx);
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));
    },

    updateWallet: async (wallet: Wallet): Promise<void> => {
        const wallets = await WalletService.getAllWallets();
        const index = wallets.findIndex(w => w.id === wallet.id);
        if (index >= 0) {
            wallets[index] = { ...wallet, updatedAt: new Date().toISOString() };
        } else {
            wallets.push(wallet);
        }
        localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets));
    },

    updateEscrow: async (escrow: Escrow): Promise<void> => {
        const escrows = await WalletService.getAllEscrows();
        const index = escrows.findIndex(e => e.id === escrow.id);
        if (index >= 0) {
            escrows[index] = escrow;
        } else {
            escrows.push(escrow);
        }
        localStorage.setItem(ESCROWS_KEY, JSON.stringify(escrows));
    },

    // --- Commission Settings Management ---

    getCommissionSettings: async (): Promise<GlobalCommissionSettings> => {
        try {
            const stored = localStorage.getItem(COMMISSIONS_KEY);
            return stored ? JSON.parse(stored) : DEFAULT_COMMISSION_SETTINGS;
        } catch {
            return DEFAULT_COMMISSION_SETTINGS;
        }
    },

    saveCommissionSettings: async (settings: GlobalCommissionSettings): Promise<void> => {
        return new Promise(resolve => {
            localStorage.setItem(COMMISSIONS_KEY, JSON.stringify(settings));
            setTimeout(resolve, 300);
        });
    },

    // --- Business Logic (Escrow & Payments) ---

    // 1. Fund Escrow (Client pays -> Escrow State)
    fundEscrow: async (clientId: string, freelancerId: string, orderId: string, amount: number): Promise<Escrow> => {
        const clientWallet = await WalletService.getWallet(clientId);
        
        // Calculate fees based on current settings
        const settings = await WalletService.getCommissionSettings();
        let freelancerFee = settings.freelancerFeeType === 'percentage' 
            ? amount * (settings.freelancerFeeValue / 100) 
            : settings.freelancerFeeValue;
        
        // Ensure minimum
        if (freelancerFee < settings.minimumFee) freelancerFee = settings.minimumFee;

        const escrow: Escrow = {
            id: `esc-${Date.now()}`,
            orderId,
            clientId,
            clientName: 'Client', // Fetch real name in prod
            freelancerId,
            freelancerName: 'Freelancer',
            amount,
            commission: freelancerFee, 
            status: EscrowStatus.HELD,
            fundedAt: new Date().toISOString()
        };

        // If paying from existing balance
        if (clientWallet.availableBalance >= amount) {
            clientWallet.availableBalance -= amount;
            clientWallet.escrowBalance += amount; // Track platform-wide held funds
            await WalletService.updateWallet(clientWallet);
            
            await WalletService.recordTransaction({
                id: `tx-esc-hold-${Date.now()}`,
                walletId: clientWallet.id,
                type: TransactionType.ESCROW_HOLD,
                amount: -amount,
                status: 'cleared',
                referenceId: orderId,
                description: `Funds held in Escrow for Order #${orderId}`,
                createdAt: new Date().toISOString()
            });
        } 
        // Else logic for Payment Gateway -> Wallet would happen here

        await WalletService.updateEscrow(escrow);
        return escrow;
    },

    // 2. Release Escrow (Milestone Approved -> Freelancer gets paid)
    releaseEscrow: async (escrowId: string, releasedBy: 'client' | 'admin'): Promise<void> => {
        const escrows = await WalletService.getAllEscrows();
        const escrow = escrows.find(e => e.id === escrowId);
        if (!escrow || escrow.status !== EscrowStatus.HELD) return;

        const freelancerWallet = await WalletService.getWallet(escrow.freelancerId);
        
        // Calculate Payout
        const platformFee = escrow.commission;
        const payoutAmount = escrow.amount - platformFee;

        // Update Wallet: Funds move from "Held" (abstract) to Freelancer "Pending Clearance"
        freelancerWallet.pendingClearance += payoutAmount;
        await WalletService.updateWallet(freelancerWallet);

        // Record Freelancer Credit
        await WalletService.recordTransaction({
            id: `tx-esc-rel-${Date.now()}`,
            walletId: freelancerWallet.id,
            type: TransactionType.ESCROW_RELEASE,
            amount: payoutAmount,
            status: 'pending', // Clearance period
            referenceId: escrow.orderId,
            description: `Payment released for Order #${escrow.orderId}`,
            createdAt: new Date().toISOString()
        });

        // Record Fee
        await WalletService.recordTransaction({
            id: `tx-fee-${Date.now()}`,
            walletId: freelancerWallet.id, // Log fee against freelancer usually
            type: TransactionType.FEE,
            amount: -platformFee,
            status: 'cleared',
            referenceId: escrow.orderId,
            description: `Platform Fee for Order #${escrow.orderId}`,
            createdAt: new Date().toISOString()
        });

        // Update Escrow State
        escrow.status = EscrowStatus.RELEASED;
        escrow.releasedAt = new Date().toISOString();
        await WalletService.updateEscrow(escrow);
    },

    // 3. Refund Escrow (Dispute or Cancel -> Client gets money back)
    refundEscrow: async (escrowId: string, refundedBy: 'admin' | 'automation'): Promise<void> => {
        const escrows = await WalletService.getAllEscrows();
        const escrow = escrows.find(e => e.id === escrowId);
        if (!escrow || escrow.status !== EscrowStatus.HELD) return;

        const clientWallet = await WalletService.getWallet(escrow.clientId);

        // Return funds to Client
        clientWallet.availableBalance += escrow.amount;
        clientWallet.escrowBalance -= escrow.amount; // Reduce platform hold if tracked there
        await WalletService.updateWallet(clientWallet);

        await WalletService.recordTransaction({
            id: `tx-ref-${Date.now()}`,
            walletId: clientWallet.id,
            type: TransactionType.REFUND,
            amount: escrow.amount,
            status: 'cleared',
            referenceId: escrow.orderId,
            description: `Refund for Order #${escrow.orderId}`,
            createdAt: new Date().toISOString()
        });

        escrow.status = EscrowStatus.REFUNDED;
        await WalletService.updateEscrow(escrow);
    },

    // --- Admin Overrides ---

    adminFreezeWallet: async (userId: string, reason: string): Promise<void> => {
        const wallet = await WalletService.getWallet(userId);
        wallet.frozen = true;
        await WalletService.updateWallet(wallet);
        // Log handled in component or specialized audit service
    },

    adminUnfreezeWallet: async (userId: string): Promise<void> => {
        const wallet = await WalletService.getWallet(userId);
        wallet.frozen = false;
        await WalletService.updateWallet(wallet);
    },

    adminReverseTransaction: async (txId: string, adminId: string): Promise<void> => {
        const txs = await WalletService.getAllTransactions();
        const txIndex = txs.findIndex(t => t.id === txId);
        if (txIndex === -1) return;

        const tx = txs[txIndex];
        if (tx.status === 'reversed') return;

        // Reverse effect on wallet
        const wallet = await WalletService.getWallet(tx.walletId); // Assuming walletId exists in wallet lookup
        if (!wallet) return; // Should not happen

        // Simple reversal logic: flip sign
        if (tx.status === 'cleared') {
            wallet.availableBalance -= tx.amount; 
        } else if (tx.status === 'pending') {
            wallet.pendingClearance -= tx.amount;
        }
        await WalletService.updateWallet(wallet);

        // Mark TX as reversed
        txs[txIndex].status = 'reversed';
        txs[txIndex].adminNote = `Reversed by Admin ${adminId}`;
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(txs));

        // Create compensating TX entry
        await WalletService.recordTransaction({
            id: `tx-rev-${Date.now()}`,
            walletId: tx.walletId,
            type: TransactionType.ADJUSTMENT,
            amount: -tx.amount,
            status: 'cleared',
            referenceId: tx.id,
            description: `Reversal of ${tx.referenceId || 'Transaction'}`,
            adminNote: `Action by Admin`,
            createdAt: new Date().toISOString()
        });
    },

    // --- Withdrawal with AI Risk Scoring (Updated) ---

    requestWithdrawal: async (userId: string, amount: number, method: string): Promise<{ success: boolean; message: string; alert?: any }> => {
        const wallet = await WalletService.getWallet(userId);
        
        if (wallet.frozen) return { success: false, message: "Wallet is frozen." };
        if (wallet.availableBalance < amount) return { success: false, message: "Insufficient funds." };

        // 1. AI Risk Analysis using enhanced service
        const mockMetadata = {
            velocityScore: 20, // Mock: Low velocity
            avgAmount: 150,    // Mock: Average history
            disputeRate: 2,    // Mock: Low disputes
            isIpMismatch: false
        };

        const fraudCheck = await fraudService.calculateTransactionRisk(userId, amount, mockMetadata);
        
        // 2. Handle Critical Risk
        if (fraudCheck.level === 'Critical') {
            wallet.frozen = true;
            await WalletService.updateWallet(wallet);
            return { success: false, message: "Transaction blocked due to high risk. Wallet frozen.", alert: fraudCheck };
        }

        // 3. Process Request
        wallet.availableBalance -= amount;
        await WalletService.updateWallet(wallet);

        const requestStatus: WithdrawalRequest['status'] = fraudCheck.score < 40 ? 'approved' : 'pending';

        const withdrawal: WithdrawalRequest = {
            id: `wd-${Date.now()}`,
            userId,
            userName: 'User', 
            userRole: 'freelancer',
            amount,
            method,
            details: 'Requested via Dashboard',
            status: requestStatus,
            requestedAt: new Date().toISOString(),
            riskScore: fraudCheck.score,
            riskLevel: fraudCheck.level
        };

        const stored = localStorage.getItem(WITHDRAWALS_KEY);
        const withdrawals = stored ? JSON.parse(stored) : [];
        withdrawals.push(withdrawal);
        localStorage.setItem(WITHDRAWALS_KEY, JSON.stringify(withdrawals));

        await WalletService.recordTransaction({
            id: `tx-wd-${Date.now()}`,
            walletId: wallet.id,
            type: TransactionType.WITHDRAWAL,
            amount: -amount,
            status: requestStatus === 'approved' ? 'cleared' : 'pending',
            description: `Withdrawal Request (${fraudCheck.level} Risk)`,
            createdAt: new Date().toISOString()
        });

        return { 
            success: true, 
            message: requestStatus === 'approved' ? "Withdrawal processed instantly." : "Withdrawal under review.",
            alert: fraudCheck.score > 20 ? fraudCheck : undefined
        };
    },

    getPlatformFinancials: async (): Promise<PlatformFinancials> => {
        const wallets = await WalletService.getAllWallets();
        const escrows = await WalletService.getAllEscrows();
        
        return {
            totalEscrow: escrows.filter(e => e.status === EscrowStatus.HELD).reduce((acc, e) => acc + e.amount, 0),
            totalClearedUserFunds: wallets.reduce((acc, w) => acc + w.availableBalance, 0),
            totalPendingClearance: wallets.reduce((acc, w) => acc + w.pendingClearance, 0),
            platformRevenue: 15420.50, // Mock cumulative
            refundPool: 5000.00 // Mock pool
        };
    }
};
