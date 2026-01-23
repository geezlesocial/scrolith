import api from './api';
import { Contract, TimeEntry, ContractStatus } from '../types';

export interface ActiveTrackingSession {
  sessionId: string;
  contractId: string;
  contractTitle: string;
  freelancerId: string;
  freelancerName: string;
  startedAt: string;
  elapsedSeconds?: number;
  status: 'active';
}

export interface TimeEntryListResponse {
  items: TimeEntry[];
  total: number;
}

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const ContractService = {
  getContracts: async (userId: string, role: 'client' | 'freelancer' | 'admin'): Promise<Contract[]> => {
    const response = await api.get('/contracts', { params: { userId, role } });
    const data = extractData<Contract[]>(response);
    return Array.isArray(data) ? data : [];
  },

  getContractById: async (id: string): Promise<Contract | null> => {
    const response = await api.get(`/contracts/${id}`);
    const data = extractData<Contract | null>(response);
    return data ?? null;
  },

  createContract: async (contract: Partial<Contract>): Promise<Contract> => {
    const response = await api.post('/contracts', contract);
    return extractData<Contract>(response);
  },

  updateStatus: async (id: string, status: ContractStatus): Promise<void> => {
    await api.patch(`/contracts/${id}/status`, { status });
  },

  startTracking: async (contractId: string): Promise<void> => {
    await api.post(`/contracts/${contractId}/tracking/start`, {});
  },

  stopTracking: async (contractId: string, notes: string, screenshots: string[] = []): Promise<TimeEntry> => {
    const response = await api.post(`/contracts/${contractId}/tracking/stop`, { notes, screenshots });
    return extractData<TimeEntry>(response);
  },

  getTimeEntries: async (contractId: string): Promise<TimeEntry[]> => {
    const response = await api.get(`/contracts/${contractId}/time-entries`);
    const data = extractData<TimeEntry[]>(response);
    return Array.isArray(data) ? data : [];
  },

  logTime: async (entry: Partial<TimeEntry>): Promise<TimeEntry> => {
    if (!entry.contractId) {
      throw new Error('contractId is required');
    }
    const response = await api.post(`/contracts/${entry.contractId}/time-entries`, entry);
    return extractData<TimeEntry>(response);
  },

  approveTimeEntry: async (id: string): Promise<void> => {
    await api.post(`/contracts/time-entries/${id}/approve`, {});
  },

  payContractDue: async (contractId: string): Promise<number> => {
    const response = await api.post(`/contracts/${contractId}/pay`, {});
    const data = extractData<{ amount?: number }>(response);
    return data?.amount ?? 0;
  },

  getActiveTrackingSessions: async (): Promise<ActiveTrackingSession[]> => {
    const response = await api.get('/contracts/tracking/active', { params: { role: 'admin' } });
    const data = extractData<ActiveTrackingSession[] | { items?: ActiveTrackingSession[] }>(response);
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  },

  forceStopTrackingSession: async (sessionId: string, notes?: string): Promise<TimeEntry> => {
    const response = await api.post(
      `/contracts/tracking/${sessionId}/force-stop`,
      { notes },
      { params: { role: 'admin' } }
    );
    return extractData<TimeEntry>(response);
  },

  getAllTimeEntries: async (
    params?: Record<string, string | number | undefined>
  ): Promise<TimeEntryListResponse> => {
    const response = await api.get('/contracts/time-entries', {
      params: { role: 'admin', ...(params || {}) }
    });
    const data = extractData<TimeEntryListResponse | TimeEntry[]>(response);
    if (Array.isArray(data)) {
      return { items: data, total: data.length };
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: data?.total ?? items.length };
  }
};
