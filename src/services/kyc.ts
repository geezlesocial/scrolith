import api from './api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const getHttpStatus = (error: any): number | undefined => {
  const value = Number(error?.response?.status);
  return Number.isFinite(value) ? value : undefined;
};

const isNotFoundError = (error: any) => getHttpStatus(error) === 404;

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

const fetchConfigFromEndpoint = async (endpoint: string): Promise<KYCFormConfig> => {
  const response = await api.get<ApiResponse<KYCFormConfig>>(endpoint);
  const data = handleApiResponse<any>(response);
  return normalizeKycFormConfig(data);
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
  type: 'passport' | 'drivers_license' | 'national_id' | 'utility_bill' | 'bank_statement' | 'address_proof' | 'selfie_with_id';
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
    type: KYCDocument['type'] | string;
    fileId: string;
  }[];
}

export type KYCPersonalFieldKey =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'nationality'
  | 'phoneNumber'
  | 'email'
  | 'address.street'
  | 'address.city'
  | 'address.state'
  | 'address.postalCode'
  | 'address.country';

export interface KYCPersonalFieldConfig {
  key: KYCPersonalFieldKey | string;
  section: 'personal' | 'contact' | 'address' | string;
  label: string;
  type: 'text' | 'date' | 'email' | 'tel' | string;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  order: number;
}

export interface KYCDocumentOptionConfig {
  key: KYCDocument['type'] | string;
  label: string;
  description?: string;
  required: boolean;
  cameraOnly: boolean;
  accept: string;
}

export interface KYCDocumentGroupConfig {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  minRequired: number;
  options: KYCDocumentOptionConfig[];
}

export interface KYCFormConfig {
  version: number;
  copy: {
    title: string;
    subtitle: string;
    introMessage: string;
    personalSectionTitle: string;
    addressSectionTitle: string;
    documentsSectionTitle: string;
    submitLabel: string;
    updateLabel: string;
  };
  personalFields: KYCPersonalFieldConfig[];
  documentGroups: KYCDocumentGroupConfig[];
}

const DEFAULT_KYC_FORM_CONFIG: KYCFormConfig = {
  version: 1,
  copy: {
    title: 'KYC Verification',
    subtitle: 'Verify your identity to access all platform features.',
    introMessage: 'Please provide your personal information and upload required documents.',
    personalSectionTitle: 'Personal Information',
    addressSectionTitle: 'Address Information',
    documentsSectionTitle: 'Document Upload',
    submitLabel: 'Submit for Verification',
    updateLabel: 'Update Submission'
  },
  personalFields: [
    { key: 'firstName', section: 'personal', label: 'First Name', type: 'text', required: true, enabled: true, order: 10 },
    { key: 'lastName', section: 'personal', label: 'Last Name', type: 'text', required: true, enabled: true, order: 20 },
    { key: 'dateOfBirth', section: 'personal', label: 'Date of Birth', type: 'date', required: true, enabled: true, order: 30 },
    { key: 'nationality', section: 'personal', label: 'Nationality', type: 'text', required: false, enabled: true, order: 40 },
    { key: 'phoneNumber', section: 'contact', label: 'Phone Number', type: 'tel', required: false, enabled: true, order: 50 },
    { key: 'email', section: 'contact', label: 'Email', type: 'email', required: false, enabled: true, order: 60 },
    { key: 'address.street', section: 'address', label: 'Street Address', type: 'text', required: false, enabled: true, order: 70 },
    { key: 'address.city', section: 'address', label: 'City', type: 'text', required: false, enabled: true, order: 80 },
    { key: 'address.state', section: 'address', label: 'State/Province', type: 'text', required: false, enabled: true, order: 90 },
    { key: 'address.postalCode', section: 'address', label: 'Postal Code', type: 'text', required: false, enabled: true, order: 100 },
    { key: 'address.country', section: 'address', label: 'Country', type: 'text', required: false, enabled: true, order: 110 }
  ],
  documentGroups: [
    {
      key: 'identity',
      label: 'Identity Documents',
      description: 'Choose one government-issued identity document.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'passport', label: 'Passport', description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'drivers_license', label: "Driver's License", description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'national_id', label: 'National ID', description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'address',
      label: 'Address Proof',
      description: 'Provide one document that proves your current address.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'utility_bill', label: 'Utility Bill', description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'bank_statement', label: 'Bank Statement', description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'address_proof', label: 'Address Proof', description: '', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'selfie',
      label: 'Selfie Holding ID',
      description: 'Capture a live selfie while holding your ID. Gallery upload is disabled.',
      required: true,
      minRequired: 1,
      options: [
        { key: 'selfie_with_id', label: 'Selfie Holding ID', description: '', required: true, cameraOnly: true, accept: 'image/*' }
      ]
    }
  ]
};

const asArray = <T = any>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeKycFormConfig = (raw: any): KYCFormConfig => {
  const copy = raw?.copy || {};
  const normalizedCopy = {
    title: String(copy.title ?? DEFAULT_KYC_FORM_CONFIG.copy.title),
    subtitle: String(copy.subtitle ?? DEFAULT_KYC_FORM_CONFIG.copy.subtitle),
    introMessage: String(copy.introMessage ?? DEFAULT_KYC_FORM_CONFIG.copy.introMessage),
    personalSectionTitle: String(copy.personalSectionTitle ?? DEFAULT_KYC_FORM_CONFIG.copy.personalSectionTitle),
    addressSectionTitle: String(copy.addressSectionTitle ?? DEFAULT_KYC_FORM_CONFIG.copy.addressSectionTitle),
    documentsSectionTitle: String(copy.documentsSectionTitle ?? DEFAULT_KYC_FORM_CONFIG.copy.documentsSectionTitle),
    submitLabel: String(copy.submitLabel ?? DEFAULT_KYC_FORM_CONFIG.copy.submitLabel),
    updateLabel: String(copy.updateLabel ?? DEFAULT_KYC_FORM_CONFIG.copy.updateLabel)
  };
  const personalFields = asArray<KYCPersonalFieldConfig>(raw?.personalFields).length
    ? asArray<KYCPersonalFieldConfig>(raw?.personalFields)
    : DEFAULT_KYC_FORM_CONFIG.personalFields;
  const documentGroups = asArray<KYCDocumentGroupConfig>(raw?.documentGroups).length
    ? asArray<KYCDocumentGroupConfig>(raw?.documentGroups)
    : DEFAULT_KYC_FORM_CONFIG.documentGroups;
  return {
    version: Number(raw?.version ?? DEFAULT_KYC_FORM_CONFIG.version),
    copy: normalizedCopy,
    personalFields: personalFields
      .map((field, index) => {
        const fallback = DEFAULT_KYC_FORM_CONFIG.personalFields[index] || DEFAULT_KYC_FORM_CONFIG.personalFields[0];
        return {
          key: String(field?.key ?? fallback?.key ?? ''),
          section: String(field?.section ?? fallback?.section ?? 'personal'),
          label: String(field?.label ?? fallback?.label ?? 'Field'),
          type: String(field?.type ?? fallback?.type ?? 'text'),
          placeholder: String(field?.placeholder ?? fallback?.placeholder ?? ''),
          required: Boolean(field?.required ?? fallback?.required),
          enabled: Boolean(field?.enabled ?? fallback?.enabled ?? true),
          order: Number(field?.order ?? fallback?.order ?? 0)
        };
      })
      .filter((field) => field.key),
    documentGroups: documentGroups
      .map((group, index) => {
        const fallbackGroup = DEFAULT_KYC_FORM_CONFIG.documentGroups[index] || DEFAULT_KYC_FORM_CONFIG.documentGroups[0];
        const options = asArray<KYCDocumentOptionConfig>(group?.options).length
          ? asArray<KYCDocumentOptionConfig>(group?.options)
          : asArray<KYCDocumentOptionConfig>(fallbackGroup?.options);
        return {
          key: String(group?.key ?? fallbackGroup?.key ?? ''),
          label: String(group?.label ?? fallbackGroup?.label ?? 'Document Group'),
          description: String(group?.description ?? fallbackGroup?.description ?? ''),
          required: Boolean(group?.required ?? fallbackGroup?.required),
          minRequired: Math.max(0, Number(group?.minRequired ?? fallbackGroup?.minRequired ?? 0)),
          options: options
            .map((option, optionIndex) => {
              const fallbackOption = asArray<KYCDocumentOptionConfig>(fallbackGroup?.options)[optionIndex] || asArray<KYCDocumentOptionConfig>(fallbackGroup?.options)[0];
              return {
                key: String(option?.key ?? fallbackOption?.key ?? ''),
                label: String(option?.label ?? fallbackOption?.label ?? 'Document'),
                description: String(option?.description ?? fallbackOption?.description ?? ''),
                required: Boolean(option?.required ?? fallbackOption?.required),
                cameraOnly: Boolean(option?.cameraOnly ?? fallbackOption?.cameraOnly),
                accept: String(option?.accept ?? fallbackOption?.accept ?? 'image/*,application/pdf')
              };
            })
            .filter((option) => option.key)
        };
      })
      .filter((group) => group.key && group.options.length > 0)
  };
};

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
    selfie?: KYCDocument['type'][];
  }> => {
    const response = await api.get<ApiResponse<{
      identity: KYCDocument['type'][];
      address: KYCDocument['type'][];
      selfie?: KYCDocument['type'][];
    }>>('/kyc/document-types');
    return handleApiResponse(response);
  },

  getKYCFormConfig: async (): Promise<KYCFormConfig> => {
    return fetchConfigFromEndpoint('/kyc/form-config');
  },

  getKYCFormConfigAdmin: async (): Promise<KYCFormConfig> => {
    const adminEndpoints = ['/admin/kyc/form-config', '/admin/kyc/config'];
    for (const endpoint of adminEndpoints) {
      try {
        return await fetchConfigFromEndpoint(endpoint);
      } catch (error: any) {
        if (!isNotFoundError(error)) throw error;
      }
    }

    // Read-only fallback for environments that expose user config but not admin config.
    return fetchConfigFromEndpoint('/kyc/form-config');
  },

  updateKYCFormConfigAdmin: async (payload: Partial<KYCFormConfig>): Promise<KYCFormConfig> => {
    const adminEndpoints = ['/admin/kyc/form-config', '/admin/kyc/config'];
    let hadNotFound = false;

    for (const endpoint of adminEndpoints) {
      try {
        const response = await api.post<ApiResponse<KYCFormConfig>>(endpoint, payload);
        const data = handleApiResponse<any>(response);
        return normalizeKycFormConfig(data);
      } catch (error: any) {
        if (!isNotFoundError(error)) throw error;
        hadNotFound = true;
      }
    }

    if (hadNotFound) {
      throw new Error('Admin KYC form config endpoint is unavailable (404).');
    }

    throw new Error('Failed to update KYC form configuration.');
  }
};
