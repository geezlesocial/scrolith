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
  // Phase 20.2: file URLs are never public for KYC; keep null
  fileUrl: doc.file_url ?? doc.fileUrl ?? null,
  status: doc.status,
  rejectionReason: doc.rejection_reason ?? doc.rejectionReason,
  uploadedAt: doc.uploaded_at ?? doc.uploadedAt,
  scanStatus: doc.scan_status ?? doc.scanStatus ?? null,
  quarantineStatus: doc.quarantine_status ?? doc.quarantineStatus ?? null,
  secureView: Boolean(doc.secure_view ?? doc.secureView),
  contentType: doc.content_type ?? doc.contentType ?? null,
  sizeBytes: doc.size_bytes ?? doc.sizeBytes ?? null,
  metadataStripped: Boolean(doc.metadata_stripped ?? doc.metadataStripped)
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
  consentPolicyVersion: submission.consent_policy_version ?? submission.consentPolicyVersion,
  consentAcceptedAt: submission.consent_accepted_at ?? submission.consentAcceptedAt,
  resubmissionCount: Number(submission.resubmission_count ?? submission.resubmissionCount ?? 0),
  createdAt: submission.created_at ?? submission.createdAt,
  updatedAt: submission.updated_at ?? submission.updatedAt
});

const toSubmissionPayload = (data: CreateKYCSubmissionData | Partial<CreateKYCSubmissionData>) => ({
  personal_info: data.personalInfo,
  personalInfo: data.personalInfo,
  documents: Array.isArray(data.documents)
    ? data.documents
        .map((doc) => {
          const documentId = String(doc.documentId || doc.fileId || '').trim();
          return {
            type: doc.type,
            document_id: documentId,
            documentId
          };
        })
        .filter((doc) => Boolean(doc.document_id))
    : undefined,
  consent_accepted: data.consentAccepted === true,
  consentAccepted: data.consentAccepted === true,
  consent_policy_version: data.consentPolicyVersion,
  consentPolicyVersion: data.consentPolicyVersion,
  source_surface: data.sourceSurface || 'kyc_form',
  sourceSurface: data.sourceSurface || 'kyc_form'
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
  consentPolicyVersion?: string;
  consentAcceptedAt?: string;
  resubmissionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface KYCDocument {
  id: string;
  type: 'passport' | 'drivers_license' | 'national_id' | 'utility_bill' | 'bank_statement' | 'address_proof' | 'selfie_with_id' | string;
  fileId: string;
  fileUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  rejectionReason?: string;
  uploadedAt: string;
  scanStatus?: string | null;
  quarantineStatus?: string | null;
  secureView?: boolean;
  contentType?: string | null;
  sizeBytes?: number | null;
  metadataStripped?: boolean;
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
  email?: string;
}

export interface CreateKYCSubmissionData {
  personalInfo: PersonalInfo;
  documents: {
    type: KYCDocument['type'] | string;
    /** Secure KYC document id from POST /kyc/uploads */
    documentId?: string;
    /** @deprecated use documentId — kept only for type compatibility */
    fileId?: string;
  }[];
  consentAccepted: boolean;
  consentPolicyVersion: string;
  sourceSurface?: string;
}

export interface KYCSecureUploadResult {
  documentId: string;
  type: string;
  status: string;
  quarantineStatus?: string;
  scanStatus?: string;
  contentType?: string;
  sizeBytes?: number;
  metadataStripped?: boolean;
  correlationId?: string;
}

export interface KYCSecureViewResult {
  documentId: string;
  contentType?: string;
  expiresInSeconds?: number;
  signedUrl?: string | null;
  streamPath?: string | null;
  download?: boolean;
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
    consentLabel?: string;
  };
  personalFields: KYCPersonalFieldConfig[];
  documentGroups: KYCDocumentGroupConfig[];
  consent?: {
    policyVersion: string;
    purpose: string;
    required: boolean;
  };
  security?: {
    biometricsEnabled?: boolean;
    automatedFinalApproval?: boolean;
    maxFilesPerSubmission?: number;
    maxResubmissions?: number;
  };
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
    updateLabel: String(copy.updateLabel ?? DEFAULT_KYC_FORM_CONFIG.copy.updateLabel),
    consentLabel: String(
      copy.consentLabel ??
        'I confirm that the information and documents I provide are accurate, that they will be reviewed by authorized administrators, and that automated security checks may be performed. Final approval is issued only by an authorized administrator.'
    )
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
        const key = String(field?.key ?? fallback?.key ?? '');
        return {
          key,
          section: String(field?.section ?? fallback?.section ?? 'personal'),
          label: String(field?.label ?? fallback?.label ?? 'Field'),
          type: String(field?.type ?? fallback?.type ?? 'text'),
          placeholder: String(field?.placeholder ?? fallback?.placeholder ?? ''),
          required: key === 'email' ? false : Boolean(field?.required ?? fallback?.required),
          enabled: key === 'email' ? Boolean(field?.enabled) : Boolean(field?.enabled ?? fallback?.enabled ?? true),
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
      .filter((group) => group.key && group.options.length > 0),
    consent: {
      policyVersion: String(raw?.consent?.policyVersion || 'kyc-consent-v1'),
      purpose: String(raw?.consent?.purpose || 'identity_verification_review'),
      required: true
    },
    security: {
      biometricsEnabled: false,
      automatedFinalApproval: false,
      maxFilesPerSubmission: Number(raw?.security?.maxFilesPerSubmission || 12),
      maxResubmissions: Number(raw?.security?.maxResubmissions || 8)
    }
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

  /** Phase 20.2 private KYC upload — never uses generic public media upload. */
  uploadSecureDocument: async (
    type: string,
    file: File | Blob,
    filename?: string
  ): Promise<KYCSecureUploadResult> => {
    const form = new FormData();
    form.append('type', type);
    form.append('document_type', type);
    form.append('file', file, filename || (file as File).name || 'document');
    const response = await api.post<ApiResponse<KYCSecureUploadResult>>('/kyc/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000
    });
    const raw = handleApiResponse<any>(response) || {};
    // Normalize snake/camel shapes so submit always receives a durable documentId.
    const documentId = String(
      raw.documentId || raw.document_id || raw.id || raw.data?.documentId || raw.data?.id || ''
    ).trim();
    if (!documentId) {
      throw new Error('KYC upload succeeded but no document id was returned. Please try again.');
    }
    return {
      documentId,
      type: String(raw.type || type),
      status: String(raw.status || 'pending'),
      quarantineStatus: raw.quarantineStatus || raw.quarantine_status,
      scanStatus: raw.scanStatus || raw.scan_status,
      contentType: raw.contentType || raw.content_type,
      sizeBytes: raw.sizeBytes ?? raw.size_bytes,
      metadataStripped: Boolean(raw.metadataStripped ?? raw.metadata_stripped),
      correlationId: raw.correlationId || raw.correlation_id
    };
  },

  /** @deprecated retired — use uploadSecureDocument */
  uploadDocument: async (_type: KYCDocument['type'], _fileId: string): Promise<{ documentId: string }> => {
    throw new Error('Generic KYC media attachment is retired. Use secure KYC upload.');
  },

  viewDocumentSecure: async (documentId: string): Promise<KYCSecureViewResult> => {
    const response = await api.get<ApiResponse<KYCSecureViewResult>>(
      `/admin/kyc/documents/${encodeURIComponent(documentId)}/view`
    );
    return handleApiResponse(response);
  },

  updateKYCStatus: async (
    id: string,
    status: string,
    reason: string,
    reasonCode?: string
  ): Promise<KYCSubmission> => {
    const response = await api.post<ApiResponse<KYCSubmission>>(`/admin/kyc/${id}/status`, {
      status,
      notes: reason,
      reason,
      reason_code: reasonCode
    });
    const payload = handleApiResponse<any>(response);
    return mapSubmission(payload);
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
