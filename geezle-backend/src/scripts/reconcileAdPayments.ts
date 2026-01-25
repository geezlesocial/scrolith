// Use runtime require to avoid including the original script in TS compilation rootDir
const rp = require('../../scripts/reconcileAdPayments');
export const reconcileAdPayments = rp.reconcileAdPayments;
