
import { GcoinWallet, GcoinTransaction, GcoinSettings, GcoinConversionRequest } from '../types';

const WALLET_KEY = 'scrolith_gcoin_wallets';
const SETTINGS_KEY = 'scrolith_gcoin_settings';
const CONVERSION_KEY = 'scrolith_gcoin_conversions';

// Mock initial data
const INITIAL_WALLETS: GcoinWallet[] = [
    { 
        userId: 'u1', 
        recipientId: 'GZ-X4F7@2',
        balance: 150, 
        lifetimeEarned: 200, 
        transactions: [], 
        status: 'active', 
        fraudScore: 10,
        updatedAt: new Date().toISOString()
    },
    { 
        userId: 'u2', 
        recipientId: 'GZ-A9B3@7',
        balance: 5000, 
        lifetimeEarned: 5000, 
        transactions: [], 
        status: 'active', 
        fraudScore: 0,
        updatedAt: new Date().toISOString()
    }
];

const DEFAULT_SETTINGS: GcoinSettings = {
    conversionRate: 0.10, // $0.10 USD per 1 GC
    minWithdrawal: 50,
    conversionEnabled: true,
    userTransfersEnabled: true
};

// Format: GZ-[5-8 CHARS]@[1 DIGIT]
const generateRecipientId = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let idBody = '';
    const length = Math.floor(Math.random() * 4) + 5; // 5 to 8 chars
    for (let i = 0; i < length; i++) {
        idBody += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const checksum = Math.floor(Math.random() * 9);
    return `GZ-${idBody}@${checksum}`;
};

export const GcoinService = {
    
    // --- Wallet Management ---

    getWallet: async (userId: string, email?: string): Promise<GcoinWallet> => {
        return new Promise(resolve => {
            const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
            let wallet = wallets.find(w => w.userId === userId);
            
            if (!wallet) {
                // Auto-create wallet if missing
                wallet = { 
                    userId, 
                    recipientId: generateRecipientId(),
                    balance: 0, 
                    lifetimeEarned: 0, 
                    transactions: [], 
                    status: 'active', 
                    fraudScore: 0,
                    updatedAt: new Date().toISOString()
                };
                wallets.push(wallet);
                localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
            } else if (!wallet.recipientId) {
                // Migrate legacy wallet
                wallet.recipientId = generateRecipientId();
                localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
            }
            resolve(wallet);
        });
    },

    getAllWallets: async (): Promise<GcoinWallet[]> => {
        // prefer backend admin endpoint when available
        try {
            const res = await fetch('/api/admin/community/gcoin/wallets');
            if (res.ok) {
                const json = await res.json();
                if (json && json.success) return json.data;
            }
        } catch (e) { /* ignore and fallback */ }
        return JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
    },

    // --- Admin Action ---
    creditUser: async (identifier: string, amount: number, reason: string): Promise<{ success: boolean; message: string }> => {
        try {
            const res = await fetch('/api/admin/community/gcoin/credit', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ identifier, amount, reason }) });
            if (res.ok) {
                const json = await res.json();
                if (json && json.success) return { success: true, message: json.message || 'Credited via backend' };
            }
        } catch (e) { /* fallback */ }
        const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
        
        // Find by Recipient ID or Email (Mock email lookup by checking if ID looks like email or matches internal user)
        let target = wallets.find(w => w.recipientId === identifier || w.userId === identifier);
        
        // Mock Email Lookup
        if (!target && identifier.includes('@')) {
            if (identifier === 'alice@example.com') target = wallets.find(w => w.userId === 'client-1');
            else target = wallets.find(w => w.userId === 'u1');
        }

        if (!target) return { success: false, message: "User wallet not found." };
        if (target.status === 'frozen') return { success: false, message: "Wallet is frozen." };

        target.balance += amount;
        target.lifetimeEarned += amount;
        target.updatedAt = new Date().toISOString();

        target.transactions.unshift({
            id: `tx-admin-${Date.now()}`,
            userId: target.userId,
            userName: 'Admin',
            amount: amount,
            type: 'admin_adjustment',
            reason: reason || 'Admin Credit',
            timestamp: new Date().toISOString(),
            status: 'approved',
            source: 'admin_dashboard'
        } as any);

        localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
        return { success: true, message: `Successfully credited ${amount} GC to ${target.recipientId}` };
    },

    // --- User Transfer ---
    transfer: async (senderId: string, recipientIdentifier: string, amount: number, note: string): Promise<{ success: boolean; message: string }> => {
        const settings = await GcoinService.getSettings();
        if (!settings.userTransfersEnabled) return { success: false, message: "Transfers are currently disabled." };

        const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
        const sender = wallets.find(w => w.userId === senderId);
        
        if (!sender) return { success: false, message: "Sender wallet error." };
        if (sender.status !== 'active') return { success: false, message: "Your wallet is frozen." };
        if (sender.balance < amount) return { success: false, message: "Insufficient balance." };

        // Resolve Recipient
        let recipient = wallets.find(w => w.recipientId === recipientIdentifier);
        if (!recipient && recipientIdentifier.includes('@')) {
             // Mock email resolution
             if (recipientIdentifier === 'alice@example.com') recipient = wallets.find(w => w.userId === 'client-1');
        }

        if (!recipient) return { success: false, message: "Recipient not found. Check ID." };
        if (recipient.userId === sender.userId) return { success: false, message: "Cannot send to yourself." };
        if (recipient.status !== 'active') return { success: false, message: "Recipient wallet cannot receive funds." };

        // Execute Transfer
        sender.balance -= amount;
        sender.transactions.unshift({
            id: `tx-out-${Date.now()}`,
            userId: sender.userId,
            userName: 'Me',
            amount: -amount,
            type: 'transfer',
            reason: `Transfer to ${recipient.recipientId}: ${note}`,
            recipientId: recipient.recipientId,
            timestamp: new Date().toISOString(),
            status: 'approved'
        });

        recipient.balance += amount;
        recipient.lifetimeEarned += amount;
        recipient.transactions.unshift({
            id: `tx-in-${Date.now()}`,
            userId: recipient.userId,
            userName: 'Sender',
            amount: amount,
            type: 'transfer',
            reason: `Transfer from ${sender.recipientId}: ${note}`,
            referenceId: sender.recipientId,
            timestamp: new Date().toISOString(),
            status: 'approved'
        });

        // Simple Fraud Check (Velocity)
        const recentTx = recipient.transactions.filter(t => new Date(t.timestamp).getTime() > Date.now() - 3600000).length;
        if (recentTx > 20) {
            recipient.fraudScore += 30; // Flag for review
        }

        localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
        return { success: true, message: "Transfer successful." };
    },

    // --- System Actions ---
    checkAndAward: async (userId: string, type: 'like' | 'repost' | 'share', count: number): Promise<boolean> => {
        let amount = 0;
        let reason = '';
        
        // Logic for rewards
        if (type === 'like') { amount = 0.5; reason = 'Engagement Reward: Like'; }
        if (type === 'repost') { amount = 2; reason = 'Engagement Reward: Repost'; }

        if (amount > 0) {
            await GcoinService.addTransaction(userId, amount, 'reward', reason);
            return true;
        }
        return false;
    },

    addTransaction: async (userId: string, amount: number, type: GcoinTransaction['type'], reason: string, refId?: string): Promise<void> => {
        const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
        const idx = wallets.findIndex(w => w.userId === userId);
        
        if (idx !== -1) {
            const w = wallets[idx];
            w.balance += amount;
            if(amount > 0) w.lifetimeEarned += amount;
            w.updatedAt = new Date().toISOString();
            
            w.transactions.unshift({
                id: `gc-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                userId,
                userName: 'User',
                amount,
                type,
                reason,
                referenceId: refId,
                timestamp: new Date().toISOString(),
                status: 'approved'
            });
            localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
        }
    },

    // --- Conversion Logic ---

    getSettings: async (): Promise<GcoinSettings> => {
        try {
            const res = await fetch('/api/admin/community/gcoin/settings');
            if (res.ok) {
                const json = await res.json();
                if (json && json.success) return json.data;
            }
        } catch (e) { /* ignore */ }
        return new Promise(resolve => {
            const settings = localStorage.getItem(SETTINGS_KEY);
            resolve(settings ? JSON.parse(settings) : DEFAULT_SETTINGS);
        });
    },

    saveSettings: async (settings: GcoinSettings): Promise<void> => {
        try {
            await fetch('/api/admin/community/gcoin/settings', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(settings) });
            return;
        } catch (e) { /* fallback */ }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    },

    requestConversion: async (userId: string, amountGcoin: number): Promise<{ success: boolean; message: string }> => {
        const settings = await GcoinService.getSettings();
        if (!settings.conversionEnabled) return { success: false, message: "Conversions are currently disabled." };
        if (amountGcoin < settings.minWithdrawal) return { success: false, message: `Minimum withdrawal is ${settings.minWithdrawal} GC.` };

        const wallet = await GcoinService.getWallet(userId);
        if (wallet.balance < amountGcoin) return { success: false, message: "Insufficient Gcoin balance." };

        // Deduct immediately (hold)
        await GcoinService.addTransaction(userId, -amountGcoin, 'conversion', 'Conversion Request Held');

        const request: GcoinConversionRequest = {
            id: `cnv-${Date.now()}`,
            userId,
            userName: 'User', // In prod, fetch real name
            amountGcoin,
            amountFiat: amountGcoin * settings.conversionRate,
            status: 'pending',
            requestedAt: new Date().toISOString()
        };

        const requests: GcoinConversionRequest[] = JSON.parse(localStorage.getItem(CONVERSION_KEY) || '[]');
        requests.unshift(request);
        localStorage.setItem(CONVERSION_KEY, JSON.stringify(requests));

        return { success: true, message: "Conversion request submitted for approval." };
    },

    getConversionRequests: async (): Promise<GcoinConversionRequest[]> => {
        try {
            const res = await fetch('/api/admin/community/gcoin/conversions');
            if (res.ok) {
                const json = await res.json();
                if (json && json.success) return json.data;
            }
        } catch (e) { /* ignore */ }
        return JSON.parse(localStorage.getItem(CONVERSION_KEY) || '[]');
    },

    processConversion: async (requestId: string, action: 'approve' | 'reject', adminId: string): Promise<void> => {
        try {
            await fetch(`/api/admin/community/gcoin/conversions/${requestId}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action }) });
            return;
        } catch (e) { /* fallback to local */ }
        const requests: GcoinConversionRequest[] = JSON.parse(localStorage.getItem(CONVERSION_KEY) || '[]');
        const idx = requests.findIndex(r => r.id === requestId);
        
        if (idx === -1) throw new Error("Request not found");
        
        const req = requests[idx];
        req.status = action === 'approve' ? 'approved' : 'rejected';
        
        if (action === 'reject') {
            // Refund Gcoin
            await GcoinService.addTransaction(req.userId, req.amountGcoin, 'admin_adjustment', 'Conversion Rejected Refund');
        } else {
            console.log(`[Gcoin] Credited $${req.amountFiat} to user ${req.userId}`);
        }

        localStorage.setItem(CONVERSION_KEY, JSON.stringify(requests));
    },

    // --- Admin Management ---
    
    freezeWallet: async (userId: string): Promise<void> => {
        try {
            await fetch(`/api/admin/community/gcoin/adjust/${userId}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'freeze' }) });
            return;
        } catch (e) { /* fallback */ }
        const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
        const idx = wallets.findIndex(w => w.userId === userId);
        if (idx >= 0) {
            wallets[idx].status = 'frozen';
            localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
        }
    },

    unfreezeWallet: async (userId: string): Promise<void> => {
        try {
            await fetch(`/api/admin/community/gcoin/adjust/${userId}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'unfreeze' }) });
            return;
        } catch (e) { /* fallback */ }
        const wallets: GcoinWallet[] = JSON.parse(localStorage.getItem(WALLET_KEY) || JSON.stringify(INITIAL_WALLETS));
        const idx = wallets.findIndex(w => w.userId === userId);
        if (idx >= 0) {
            wallets[idx].status = 'active';
            wallets[idx].fraudScore = 0; // Reset score on manual unfreeze
            localStorage.setItem(WALLET_KEY, JSON.stringify(wallets));
        }
    },
    
    adminAdjustBalance: async (userId: string, amount: number, reason: string): Promise<void> => {
        try {
            await fetch(`/api/admin/community/gcoin/adjust/${userId}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ amount, reason }) });
            return;
        } catch (e) { /* fallback */ }
        await GcoinService.addTransaction(userId, amount, 'admin_adjustment', reason);
    }
};
