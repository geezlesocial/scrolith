"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeReconciliationResources = void 0;
exports.reconcileAdPayments = reconcileAdPayments;
const stripe_1 = __importDefault(require("stripe"));
const prismaClient_1 = __importStar(require("../src/utils/prismaClient"));
let disconnectPromise;
const closeReconciliationResources = async () => {
    if (!disconnectPromise) {
        disconnectPromise = (0, prismaClient_1.disconnectPrisma)();
    }
    return disconnectPromise;
};
exports.closeReconciliationResources = closeReconciliationResources;
async function reconcileAdPayments() {
    console.log('Starting ad payment reconciliation...');
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isTest = (process.env.NODE_ENV || '') === 'test';
    if (!stripeKey && !isTest) {
        console.warn('Stripe secret key not set; skipping ad payment reconciliation.');
        return;
    }
    const stripe = new stripe_1.default(stripeKey, { apiVersion: '2023-10-16' });
    try {
        const pending = await prismaClient_1.default.adPayment.findMany({ where: { status: 'pending' }, take: 200, orderBy: { createdAt: 'asc' } });
        console.log(`Found ${pending.length} pending AdPayment(s)`);
        for (const p of pending) {
            if (!p.transactionId) {
                console.log(`AdPayment ${p.id} has no transactionId; skipping`);
                continue;
            }
            try {
                const pi = await stripe.paymentIntents.retrieve(p.transactionId);
                const amt = (pi.amount_received || pi.amount || 0) / 100;
                const currency = (pi.currency || 'usd').toUpperCase();
                if (pi.status === 'succeeded' || pi.status === 'requires_capture' || pi.status === 'processing') {
                    await prismaClient_1.default.$transaction([
                        prismaClient_1.default.adPayment.update({ where: { id: p.id }, data: { status: 'completed', amount: amt, currency } }),
                        prismaClient_1.default.communityAd.update({ where: { id: p.adId }, data: { status: 'PAID', paymentTransactionId: p.transactionId } })
                    ]);
                    console.log(`AdPayment ${p.id} reconciled as completed`);
                }
                else if (pi.status === 'canceled' || pi.status === 'requires_payment_method' || pi.status === 'requires_action') {
                    await prismaClient_1.default.adPayment.update({ where: { id: p.id }, data: { status: 'failed', amount: amt, currency } });
                    console.log(`AdPayment ${p.id} marked failed (status=${pi.status})`);
                }
                else {
                    console.log(`AdPayment ${p.id} still pending (stripe status=${pi.status})`);
                }
            }
            catch (err) {
                console.error(`Error reconciling AdPayment ${p.id}:`, err?.message || err);
            }
        }
    }
    catch (err) {
        console.error('Reconciliation job error:', err?.message || err);
    }
}
if (require.main === module) {
    let shuttingDown = false;
    const shutdown = async (exitCode) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        try {
            await (0, exports.closeReconciliationResources)();
        }
        finally {
            process.exit(exitCode);
        }
    };
    const handleSignal = () => { void shutdown(1); };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
    reconcileAdPayments()
        .then(() => shutdown(0))
        .catch(async (error) => {
        console.error('[ad-payment-reconcile] reconciliation failed:', error?.message || error);
        await shutdown(1);
    });
}
//# sourceMappingURL=reconcileAdPayments.js.map