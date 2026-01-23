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

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  budget: {
    type: 'fixed' | 'hourly';
    amount: number;
    minAmount?: number;
    maxAmount?: number;
  };
  status: string;
  proposalsCount: number;
  attachments: string[];
  tags: string[];
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobData {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  budget: Job['budget'];
  attachments: string[];
  tags: string[];
  skills: string[];
  requirements?: string[];
  deadline?: string;
}

export interface JobsResponse {
  jobs: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const jobsApi = {
  getJobs: async (params: {
    ownerId?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<JobsResponse> => {
    const response = await api.get<ApiResponse<JobsResponse>>('/jobs', { params });
    return handleApiResponse(response);
  },

  createJob: async (data: CreateJobData): Promise<Job> => {
    const response = await api.post<ApiResponse<Job>>('/jobs', data);
    return handleApiResponse(response);
  },

  updateJob: async (id: string, data: Partial<CreateJobData>): Promise<Job> => {
    const response = await api.put<ApiResponse<Job>>(`/jobs/${id}`, data);
    return handleApiResponse(response);
  },

  deleteJob: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/jobs/${id}`);
    handleApiResponse(response);
  },

  submitJob: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/jobs/${id}/submit`);
    handleApiResponse(response);
  },

  pauseJob: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/jobs/${id}/pause`);
    handleApiResponse(response);
  },

  activateJob: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/jobs/${id}/activate`);
    handleApiResponse(response);
  },

  closeJob: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/jobs/${id}/close`);
    handleApiResponse(response);
  }
};

export const JobsService = {
  listMine: async (): Promise<Job[]> => {
    const response = await api.get<ApiResponse<Job[] | JobsResponse>>('/jobs', { params: { ownerId: 'me' } });
    const data = handleApiResponse<Job[] | JobsResponse>(response);
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.jobs) ? data.jobs : [];
  },
  getById: async (id: string): Promise<Job | null> => {
    const response = await api.get<ApiResponse<Job>>(`/jobs/${id}`);
    const data = handleApiResponse<Job>(response);
    return data ?? null;
  },
  create: async (payload: CreateJobData): Promise<Job> => {
    const response = await api.post<ApiResponse<Job>>('/jobs', payload);
    return handleApiResponse(response);
  },
  update: async (id: string, payload: Partial<CreateJobData>): Promise<Job> => {
    const response = await api.put<ApiResponse<Job>>(`/jobs/${id}`, payload);
    return handleApiResponse(response);
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/jobs/${id}`);
  },
  submit: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/submit`, {});
  },
  pause: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/pause`, {});
  },
  activate: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/activate`, {});
  },
  close: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/close`, {});
  },
  invalidateCache: () => {}
};
