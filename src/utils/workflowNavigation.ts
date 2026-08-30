import type { Contract } from '../types';

export const buildContractDashboardPath = (
  contractId: string,
  role: 'employer' | 'freelancer' = 'employer'
) => {
  const root = role === 'freelancer' ? '/freelancer/dashboard' : '/client/dashboard';
  const normalizedId = String(contractId || '').trim();
  const params = new URLSearchParams({ tab: 'contracts', contract: normalizedId, contract_id: normalizedId });
  return `${root}?${params.toString()}`;
};

export const getContractPaymentSummary = (contract: Pick<Contract, 'type' | 'earnings_pending' | 'milestones'> & {
  earningsPending?: number;
}) => {
  const milestones = Array.isArray(contract.milestones) ? contract.milestones : [];
  if (contract.type === 'fixed') {
    return {
      model: 'fixed' as const,
      paidAmount: milestones
        .filter((milestone) => milestone.status === 'paid')
        .reduce((total, milestone) => total + Number(milestone.amount || 0), 0),
      approvedAmount: milestones
        .filter((milestone) => milestone.status === 'approved')
        .reduce((total, milestone) => total + Number(milestone.amount || 0), 0),
      submittedAmount: milestones
        .filter((milestone) => milestone.status === 'submitted')
        .reduce((total, milestone) => total + Number(milestone.amount || 0), 0)
    };
  }

  return {
    model: 'hourly' as const,
    paidAmount: 0,
    approvedAmount: Number(contract.earningsPending ?? contract.earnings_pending ?? 0),
    submittedAmount: 0
  };
};
