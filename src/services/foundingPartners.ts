import api from './api';

const unwrap = <T,>(response: any): T => (response?.data?.data ?? response?.data ?? response) as T;

export type FoundingPartnerProgram = {
  name: string; status: string; capacity: number; enrolledCount: number; remainingCapacity: number;
  profitSharePercent: string; termYears: number; enrollmentFee: string; currency: string; termsVersion: string;
};

export const FoundingPartnersService = {
  getProgram: async () => unwrap<FoundingPartnerProgram>(await api.get('/founding-partners/program')),
  getMine: async () => unwrap<any>(await api.get('/founding-partners/me')),
  startCheckout: async (payload: any) => unwrap<any>(await api.post('/founding-partners/enrollment/checkout', payload, { headers: { 'Idempotency-Key': payload.idempotencyKey } }))
};
