import api from "./api";

export type JobStatus = 'draft' | 'submitted' | 'under_review' | 'active' | 'paused' | 'closed' | 'rejected';

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  budget: {
    type: 'fixed' | 'hourly';
    minAmount?: number;
    maxAmount?: number;
  };
  status: JobStatus;
  proposalsCount: number;
  attachments: string[];
  tags: string[];
  skills: string[];
  createdAt: string;
  updatedAt: string;
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

export interface CreateJobData {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  budget: {
    type: 'fixed' | 'hourly';
    minAmount?: number;
    maxAmount?: number;
  };
  attachments: string[];
  tags: string[];
  skills: string[];
}

export const jobsApi = {
  getJobs: async (params: {
    ownerId?: string;
    status?: JobStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<JobsResponse> => {
    const response = await api.get('/jobs', { params });
    return response.data.data;
  },

  createJob: async (data: CreateJobData): Promise<Job> => {
    const response = await api.post('/jobs', data);
    return response.data.data;
  },

  updateJob: async (id: string, data: Partial<CreateJobData>): Promise<Job> => {
    const response = await api.put(`/jobs/${id}`, data);
    return response.data.data;
  },

  deleteJob: async (id: string): Promise<void> => {
    await api.delete(`/jobs/${id}`);
  },

  submitJob: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/submit`);
  },

  pauseJob: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/pause`);
  },

  activateJob: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/activate`);
  },

  closeJob: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/close`);
  },
};