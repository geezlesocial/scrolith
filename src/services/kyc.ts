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

const mapDocument = (doc: any): KYCDocument => ({
  id: doc.id,
  type: doc.type,
  fileId: doc.file_id ?? doc.fileId,
  fileUrl: doc.file_url ?? doc.fileUrl,
  status: doc.status,
  rejectionReason: doc.rejection_reason ?? doc.rejectionReason,
  uploadedAt: doc.uploaded_at ?? doc.uploadedAt
});

const mapSubmission = (submission: any): KYCSubmission => ({
  id: submission.id,
  userId: submission.user_id ?? submission.userId,
  status: submission.status,
  submittedAt: submission.submitted_at ?? submission.submittedAt,
  reviewedAt: submission.reviewed_at ?? submission.reviewedAt,
  reviewedBy: submission.reviewed_by ?? submission.reviewedBy,
  rejectionReason: submission.rejection_reason ?? submission.rejectionReason,
  documents: Array.isArray(submission.documents) ? submission.documents.map(mapDocument) : [],
  personalInfo: submission.personal_info ?? submission.personalInfo,
  createdAt: submission.created_at ?? submission.createdAt,
  updatedAt: submission.updated_at ?? submission.updatedAt
});

const toSubmissionPayload = (data: CreateKYCSubmissionData | Partial<CreateKYCSubmissionData>) => ({
  personal_info: data.personalInfo,
  documents: Array.isArray(data.documents)
    ? data.documents.map((doc) => ({ type: doc.type, file_id: doc.fileId }))
    : undefined
});

export type KYCStatus = 'not_submitted' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'requires_updates';

export interface KYCSubmission {
  id: string;
  userId: string;
  status: KYCStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  documents: KYCDocument[];
  personalInfo: PersonalInfo;
  createdAt: string;
  updatedAt: string;
}

export interface KYCDocument {
  id: string;
  type: 'passport' | 'drivers_license' | 'national_id' | 'utility_bill' | 'bank_statement' | 'address_proof';
  fileId: string;
  fileUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  uploadedAt: string;
}

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phoneNumber: string;
  email: string;
}

export interface CreateKYCSubmissionData {
  personalInfo: PersonalInfo;
  documents: {
    type: KYCDocument['type'];
    fileId: string;
  }[];
}

export const kycApi = {
  getKYCStatus: async (): Promise<{ status: KYCStatus; submission?: KYCSubmission }> => {
    const response = await api.get<ApiResponse<{ status: KYCStatus; submission?: KYCSubmission }>>('/kyc/me');
    const data = handleApiResponse<any>(response);
    return {
      status: data.status,
      submission: data.submission ? mapSubmission(data.submission) : undefined
    };
  },

  submitKYC: async (data: CreateKYCSubmissionData): Promise<KYCSubmission> => {
    const response = await api.post<ApiResponse<KYCSubmission>>('/kyc/submit', toSubmissionPayload(data));
    const payload = handleApiResponse<any>(response);
    return mapSubmission(payload);
  },

  updateKYC: async (id: string, data: Partial<CreateKYCSubmissionData>): Promise<KYCSubmission> => {
    const response = await api.put<ApiResponse<KYCSubmission>>(`/kyc/${id}`, toSubmissionPayload(data));
    const payload = handleApiResponse<any>(response);
    return mapSubmission(payload);
  },

  uploadDocument: async (type: KYCDocument['type'], fileId: string): Promise<{ documentId: string }> => {
    const response = await api.post<ApiResponse<{ documentId: string }>>('/kyc/documents', {
      type,
      file_id: fileId,
    });
    return handleApiResponse(response);
  },

  getDocumentTypes: async (): Promise<{
    identity: KYCDocument['type'][];
    address: KYCDocument['type'][];
  }> => {
    const response = await api.get<ApiResponse<{
      identity: KYCDocument['type'][];
      address: KYCDocument['type'][];
    }>>('/kyc/document-types');
    return handleApiResponse(response);
  }
};
