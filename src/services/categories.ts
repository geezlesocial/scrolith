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

export interface Category {
  id: string;
  name: string;
  subcategories: Array<{
    id: string;
    name: string;
  }>;
}

export interface CategoriesResponse {
  categories: Category[];
}

export const categoriesApi = {
  getGigCategories: async (): Promise<CategoriesResponse> => {
    const response = await api.get<ApiResponse<CategoriesResponse>>('/categories/gigs');
    return handleApiResponse(response);
  },

  getJobCategories: async (): Promise<CategoriesResponse> => {
    const response = await api.get<ApiResponse<CategoriesResponse>>('/categories/jobs');
    return handleApiResponse(response);
  }
};

export const CategoriesService = {
  getJobCategories: async () => {
    const response = await api.get<ApiResponse<CategoriesResponse>>('/categories/jobs');
    return handleApiResponse(response);
  }
};
