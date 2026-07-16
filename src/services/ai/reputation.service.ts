
import api from '../api';
import { TrustScore, HiringPrediction } from "../../types";

const unwrap = <T>(response: any): T => {
    if (response?.data?.data !== undefined) return response.data.data as T;
    if (response?.data !== undefined) return response.data as T;
    return response as T;
};

export const ReputationService = {
    getTrustScore: async (userId: string): Promise<TrustScore | null> => {
        try {
            const response = await api.get(`/users/${encodeURIComponent(userId)}/trust-score`);
            const data = unwrap<TrustScore | null>(response);
            return data ?? null;
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) return null;
            console.warn('Failed to load trust score', error);
            return null;
        }
    },

    predictHiringSuccess: async (freelancerId: string, jobId?: string): Promise<HiringPrediction> => {
        return new Promise(resolve => setTimeout(() => resolve({
            freelancerId,
            jobId,
            successProbability: 88,
            riskLevel: 'Low',
            topFactors: ['Matching Skills (95%)', 'High Repeat Hire Rate', 'Excellent Communication'],
            redFlags: []
        }), 500));
    }
};
