import api from './api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

const mapProposal = (p: any): Proposal => ({
  id: p.id,
  jobId: p.job_id ?? p.jobId ?? '',
  jobTitle: p.job_title ?? p.jobTitle ?? p.job?.title ?? '',
  freelancerId: p.freelancer_id ?? p.freelancerId ?? p.freelancer?.id ?? '',
  freelancerName: p.freelancer_name ?? p.freelancerName ?? p.freelancer?.name ?? '',
  freelancerAvatar: p.freelancer_avatar ?? p.freelancerAvatar ?? p.freelancer?.avatar ?? undefined,
  coverLetter: p.cover_letter ?? p.coverLetter ?? '',
  proposedAmount: Number(p.proposed_amount ?? p.proposedAmount ?? p.amount ?? 0),
  proposedTimeline: Number(p.proposed_timeline ?? p.proposedTimeline ?? p.delivery_days ?? 0),
  attachments: Array.isArray(p.attachments) ? p.attachments : [],
  status: p.status ?? 'pending',
  contractId: p.contract_id ?? p.contractId ?? undefined,
  createdAt: p.created_at ?? p.createdAt ?? '',
  updatedAt: p.updated_at ?? p.updatedAt ?? ''
});

const mapProposalsResponse = (payload: any): ProposalsResponse => {
  const proposalsRaw = Array.isArray(payload?.proposals) ? payload.proposals : Array.isArray(payload) ? payload : [];
  const pagination = payload?.pagination || {
    page: 1,
    limit: proposalsRaw.length,
    total: proposalsRaw.length,
    pages: 1
  };

  return {
    proposals: proposalsRaw.map(mapProposal),
    pagination
  };
};

export interface Proposal {
  id: string;
  jobId: string;
  jobTitle: string;
  freelancerId: string;
  freelancerName: string;
  freelancerAvatar?: string;
  coverLetter: string;
  proposedAmount: number;
  proposedTimeline: number; // in days
  attachments: string[];
  status: 'pending' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';
  contractId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalsResponse {
  proposals: Proposal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AcceptProposalData {
  message?: string;
  startDate?: string;
}

export const proposalsApi = {
  getProposals: async (params: {
    jobId?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<ProposalsResponse> => {
    const response = await api.get<ApiResponse<ProposalsResponse>>('/proposals', { params });
    const data = handleApiResponse<any>(response);
    return mapProposalsResponse(data);
  },

  getProposal: async (id: string): Promise<Proposal> => {
    const response = await api.get<ApiResponse<Proposal>>(`/proposals/${id}`);
    const data = handleApiResponse<any>(response);
    return mapProposal(data);
  },

  acceptProposal: async (id: string, data?: AcceptProposalData): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/accept`, data);
    handleApiResponse(response);
  },

  rejectProposal: async (id: string, reason?: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/reject`, { reason });
    handleApiResponse(response);
  },

  shortlistProposal: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/shortlist`);
    handleApiResponse(response);
  },

  unshortlistProposal: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/unshortlist`);
    handleApiResponse(response);
  },

  messageFreelancer: async (id: string, message: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/message`, { message });
    handleApiResponse(response);
  },
  // Freelancer: list my proposals
  getMyProposals: async (params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<ProposalsResponse> => {
    const response = await api.get<ApiResponse<ProposalsResponse>>('/proposals/me', { params });
    const data = handleApiResponse<any>(response);
    return mapProposalsResponse(data);
  },
  // Optional: Freelancer withdraw proposal (if backend supports)
  withdrawProposal: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/proposals/${id}/withdraw`);
    handleApiResponse(response);
  },
  // Backwards-compatible adapter used by some UI pages
  getFreelancerProposals: async (): Promise<ProposalsResponse> => {
    try {
      const resp = await api.get<ApiResponse<ProposalsResponse>>('/proposals/my');
      const data = handleApiResponse<any>(resp);
      return mapProposalsResponse(data);
    } catch (e) {
      return proposalsApi.getProposals();
    }
  }
};
