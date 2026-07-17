import React, { useMemo, useState, useEffect } from 'react';
import {
  kycApi,
  KYCStatus,
  KYCSubmission,
  KYCDocument,
  CreateKYCSubmissionData,
  KYCFormConfig,
  KYCPersonalFieldConfig,
  KYCDocumentOptionConfig
} from '../../services/kyc';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';
import { ConfirmModal } from './ConfirmModal';
import {
  ShieldCheck,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  MapPin,
  Phone,
  Mail,
  Calendar,
  RefreshCw,
  Edit,
  Eye,
  Loader2
} from 'lucide-react';

interface KYCVerificationProps {
  role?: 'freelancer' | 'employer';
}

const FALLBACK_KYC_FORM_CONFIG: KYCFormConfig = {
  version: 1,
  copy: {
    title: 'KYC Verification',
    subtitle: 'Verify your identity to access all platform features.',
    introMessage: 'Please provide your personal information and upload required documents',
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
    { key: 'email', section: 'contact', label: 'Email', type: 'email', required: false, enabled: false, order: 60 },
    { key: 'address.street', section: 'address', label: 'Street Address', type: 'text', required: false, enabled: true, order: 70 },
    { key: 'address.city', section: 'address', label: 'City', type: 'text', required: false, enabled: true, order: 80 },
    { key: 'address.state', section: 'address', label: 'State/Province', type: 'text', required: false, enabled: true, order: 90 },
    { key: 'address.postalCode', section: 'address', label: 'Postal Code', type: 'text', required: false, enabled: true, order: 100 },
    { key: 'address.country', section: 'address', label: 'Country', type: 'text', required: false, enabled: true, order: 110 }
  ],
  documentGroups: [
    {
      key: 'identity',
      label: 'Identity Documents (Choose one)',
      description: '',
      required: true,
      minRequired: 1,
      options: [
        { key: 'passport', label: 'Passport', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'drivers_license', label: "Driver's License", required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'national_id', label: 'National ID', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'address',
      label: 'Address Proof (Choose one)',
      description: '',
      required: true,
      minRequired: 1,
      options: [
        { key: 'utility_bill', label: 'Utility Bill', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'bank_statement', label: 'Bank Statement', required: false, cameraOnly: false, accept: 'image/*,application/pdf' },
        { key: 'address_proof', label: 'Address Proof', required: false, cameraOnly: false, accept: 'image/*,application/pdf' }
      ]
    },
    {
      key: 'selfie',
      label: 'Selfie Holding ID (Required)',
      description: 'Capture from your camera only',
      required: true,
      minRequired: 1,
      options: [
        { key: 'selfie_with_id', label: 'Selfie Holding ID', required: true, cameraOnly: true, accept: 'image/*' }
      ]
    }
  ]
};

export const KYCVerification: React.FC<KYCVerificationProps> = ({ role = 'freelancer' }) => {
  const { user, updateUser } = useUser();
  const { showNotification } = useNotification();

  const [kycStatus, setKycStatus] = useState<{ status: KYCStatus; submission?: KYCSubmission } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<KYCFormConfig>(FALLBACK_KYC_FORM_CONFIG);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
  const [selectedDocumentConfig, setSelectedDocumentConfig] = useState<KYCDocumentOptionConfig | null>(null);

  const [personalInfo, setPersonalInfo] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    nationality: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    },
    phoneNumber: '',
    email: '',
  });

  const [documents, setDocuments] = useState<{
    type: string;
    documentId: string;
    fileId?: string;
    fileUrl?: string | null;
    scanStatus?: string | null;
  }[]>([]);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const secureFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const sortedPersonalFields = useMemo(
    () =>
      [...(formConfig?.personalFields || [])]
        .filter((field) => field?.enabled !== false)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [formConfig]
  );

  const getFieldConfig = (key: string, fallback: Partial<KYCPersonalFieldConfig>) => {
    const configured = sortedPersonalFields.find((field) => String(field.key) === key);
    if (configured) return configured;
    return {
      key,
      section: fallback.section || 'personal',
      label: fallback.label || key,
      type: fallback.type || 'text',
      placeholder: fallback.placeholder || '',
      required: Boolean(fallback.required),
      enabled: fallback.enabled !== false,
      order: Number(fallback.order || 0)
    } as KYCPersonalFieldConfig;
  };

  const getPersonalFieldValue = (key: string): string => {
    switch (key) {
      case 'firstName':
        return personalInfo.firstName || '';
      case 'lastName':
        return personalInfo.lastName || '';
      case 'dateOfBirth':
        return personalInfo.dateOfBirth || '';
      case 'nationality':
        return personalInfo.nationality || '';
      case 'phoneNumber':
        return personalInfo.phoneNumber || '';
      case 'email':
        return personalInfo.email || '';
      case 'address.street':
        return personalInfo.address.street || '';
      case 'address.city':
        return personalInfo.address.city || '';
      case 'address.state':
        return personalInfo.address.state || '';
      case 'address.postalCode':
        return personalInfo.address.postalCode || '';
      case 'address.country':
        return personalInfo.address.country || '';
      default:
        return '';
    }
  };

  const setPersonalFieldValue = (key: string, value: string) => {
    switch (key) {
      case 'firstName':
        setPersonalInfo((prev) => ({ ...prev, firstName: value }));
        break;
      case 'lastName':
        setPersonalInfo((prev) => ({ ...prev, lastName: value }));
        break;
      case 'dateOfBirth':
        setPersonalInfo((prev) => ({ ...prev, dateOfBirth: value }));
        break;
      case 'nationality':
        setPersonalInfo((prev) => ({ ...prev, nationality: value }));
        break;
      case 'phoneNumber':
        setPersonalInfo((prev) => ({ ...prev, phoneNumber: value }));
        break;
      case 'email':
        setPersonalInfo((prev) => ({ ...prev, email: value }));
        break;
      case 'address.street':
        setPersonalInfo((prev) => ({ ...prev, address: { ...prev.address, street: value } }));
        break;
      case 'address.city':
        setPersonalInfo((prev) => ({ ...prev, address: { ...prev.address, city: value } }));
        break;
      case 'address.state':
        setPersonalInfo((prev) => ({ ...prev, address: { ...prev.address, state: value } }));
        break;
      case 'address.postalCode':
        setPersonalInfo((prev) => ({ ...prev, address: { ...prev.address, postalCode: value } }));
        break;
      case 'address.country':
        setPersonalInfo((prev) => ({ ...prev, address: { ...prev.address, country: value } }));
        break;
      default:
        break;
    }
  };

  const loadKYCStatus = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const [data, config] = await Promise.all([
        kycApi.getKYCStatus(),
        kycApi.getKYCFormConfig().catch(() => FALLBACK_KYC_FORM_CONFIG)
      ]);
      setKycStatus(data);
      setFormConfig(config || FALLBACK_KYC_FORM_CONFIG);

      // Pre-fill form if there's existing submission
      if (data.submission) {
        setPersonalInfo({
          firstName: data.submission.personalInfo?.firstName || '',
          lastName: data.submission.personalInfo?.lastName || '',
          dateOfBirth: data.submission.personalInfo?.dateOfBirth || '',
          nationality: data.submission.personalInfo?.nationality || '',
          phoneNumber: data.submission.personalInfo?.phoneNumber || '',
          email: '',
          address: {
            street: data.submission.personalInfo?.address?.street || '',
            city: data.submission.personalInfo?.address?.city || '',
            state: data.submission.personalInfo?.address?.state || '',
            postalCode: data.submission.personalInfo?.address?.postalCode || '',
            country: data.submission.personalInfo?.address?.country || ''
          }
        });
        setDocuments(
          data.submission.documents.map((doc) => ({
            type: doc.type,
            documentId: doc.id,
            fileId: doc.fileId,
            fileUrl: null,
            scanStatus: doc.scanStatus
          }))
        );
        setConsentAccepted(false);
      }
    } catch (error: any) {
      console.error('Failed to load KYC status:', error);
      setError(error.message || 'Failed to load KYC status');
      showNotification('error', 'Load Error', error.message || 'Failed to load KYC status');
      setFormConfig(FALLBACK_KYC_FORM_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKYCStatus();
  }, [user]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.userId && user?.id && detail.userId !== user.id) return;
      const nextStatus = detail.status;
      if (nextStatus) {
        const isVerified = nextStatus === 'approved' || nextStatus === 'verified';
        updateUser?.({
          kycStatus: nextStatus,
          kyc_status: nextStatus,
          isVerified,
          is_verified: isVerified
        });
        if (nextStatus === 'approved') {
          showNotification('success', 'KYC Approved', 'Your verification was approved.');
        } else if (nextStatus === 'rejected') {
          showNotification('error', 'KYC Rejected', detail.rejectionReason || 'Your verification was rejected.');
        } else if (nextStatus === 'under_review' || nextStatus === 'pending') {
          showNotification('info', 'KYC Update', 'Your verification status was updated.');
        }
      }
      loadKYCStatus();
    };
    window.addEventListener('kyc.updated', handler as EventListener);
    return () => window.removeEventListener('kyc.updated', handler as EventListener);
  }, [user?.id, updateUser, showNotification]);

  const friendlyUploadError = (error: any) => {
    const code = String(error?.response?.data?.code || error?.code || '').toUpperCase();
    const message = String(error?.response?.data?.error || error?.message || 'Upload failed');
    if (code === 'MALWARE_DETECTED') return 'File failed security scanning and cannot be accepted.';
    if (code === 'SCANNER_UNAVAILABLE') return 'Security scanner is temporarily unavailable. Please try again later.';
    if (code === 'FILE_TOO_LARGE') return 'File is too large. Maximum size is 10MB.';
    if (code === 'UNSUPPORTED_TYPE' || code === 'MIME_MAGIC_MISMATCH') return 'Unsupported file type. Use JPEG, PNG, WEBP, or PDF.';
    if (code === 'DOCUMENT_OWNERSHIP') return 'Document ownership validation failed.';
    if (code === 'CONSENT_REQUIRED') return 'You must accept the KYC consent statement before submitting.';
    if (code === 'RATE_LIMIT') return 'Too many attempts. Please wait and try again.';
    return message;
  };

  const handleSecureFileChosen = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    const type = selectedDocumentType;
    if (!file || !type) return;
    setUploadingType(type);
    try {
      const uploaded = await kycApi.uploadSecureDocument(type, file, file.name);
      const next = {
        type,
        documentId: uploaded.documentId,
        scanStatus: uploaded.scanStatus
      };
      setDocuments((prev) => {
        const idx = prev.findIndex((doc) => doc.type === type);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = next;
          return copy;
        }
        return [...prev, next];
      });
      showNotification('success', 'Upload complete', 'Document passed security checks and is ready to attach.');
    } catch (error: any) {
      showNotification('error', 'Upload failed', friendlyUploadError(error));
    } finally {
      setUploadingType(null);
      setSelectedDocumentType(null);
      setSelectedDocumentConfig(null);
      if (secureFileInputRef.current) secureFileInputRef.current.value = '';
    }
  };

  const openSecureUpload = (type: string, option?: KYCDocumentOptionConfig) => {
    setSelectedDocumentType(type);
    setSelectedDocumentConfig(option || null);
    // Prefer native file input for private KYC path (not generic FilePicker public media)
    window.setTimeout(() => secureFileInputRef.current?.click(), 0);
  };

  const handleSubmitKYC = async () => {
    const requiredFields = sortedPersonalFields.filter(
      (field) => field.enabled !== false && field.required && String(field.key) !== 'email'
    );
    for (const field of requiredFields) {
      const value = getPersonalFieldValue(String(field.key));
      if (!String(value || '').trim()) {
        showNotification('error', 'Validation Error', `${field.label} is required.`);
        return;
      }
    }

    const documentGroups = Array.isArray(formConfig?.documentGroups) ? formConfig.documentGroups : [];
    for (const group of documentGroups) {
      const options = Array.isArray(group.options) ? group.options : [];
      const selectedCount = options.filter((option) =>
        documents.some((doc) => String(doc.type) === String(option.key))
      ).length;
      const requiredOption = options.find(
        (option) => option.required && !documents.some((doc) => String(doc.type) === String(option.key))
      );
      if (requiredOption) {
        showNotification('error', 'Validation Error', `${requiredOption.label} is required.`);
        return;
      }
      const minimum = Math.max(Number(group.minRequired || 0), group.required ? 1 : 0);
      if (group.required && selectedCount < minimum) {
        showNotification('error', 'Validation Error', `Please upload required documents in "${group.label}".`);
        return;
      }
    }

    if (!consentAccepted) {
      showNotification('error', 'Consent required', 'Please accept the KYC consent statement before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const policyVersion = formConfig?.consent?.policyVersion || 'kyc-consent-v1';
      const submissionData: CreateKYCSubmissionData = {
        personalInfo: {
          firstName: personalInfo.firstName,
          lastName: personalInfo.lastName,
          dateOfBirth: personalInfo.dateOfBirth,
          nationality: personalInfo.nationality,
          phoneNumber: personalInfo.phoneNumber,
          address: personalInfo.address
        },
        documents: documents.map((doc) => ({
          type: doc.type as any,
          documentId: doc.documentId
        })),
        consentAccepted: true,
        consentPolicyVersion: policyVersion,
        sourceSurface: 'kyc_form'
      };

      if (kycStatus?.submission) {
        await kycApi.updateKYC(kycStatus.submission.id, submissionData);
        showNotification('success', 'KYC Updated', 'Your KYC information has been updated successfully');
      } else {
        await kycApi.submitKYC(submissionData);
        showNotification('success', 'KYC Submitted', 'Your KYC verification has been submitted successfully');
      }

      updateUser?.({ kycStatus: 'pending', kyc_status: 'pending', isVerified: false, is_verified: false });
      setShowForm(false);
      setConsentAccepted(false);
      loadKYCStatus();
    } catch (error: any) {
      showNotification('error', 'Submission Failed', friendlyUploadError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: KYCStatus) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'under_review':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'requires_updates':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: KYCStatus) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'under_review':
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'requires_updates':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-gray-600" />;
    }
  };

  const firstNameField = getFieldConfig('firstName', { section: 'personal', label: 'First Name', type: 'text', required: true, enabled: true, order: 10 });
  const lastNameField = getFieldConfig('lastName', { section: 'personal', label: 'Last Name', type: 'text', required: true, enabled: true, order: 20 });
  const dateOfBirthField = getFieldConfig('dateOfBirth', { section: 'personal', label: 'Date of Birth', type: 'date', required: true, enabled: true, order: 30 });
  const nationalityField = getFieldConfig('nationality', { section: 'personal', label: 'Nationality', type: 'text', required: false, enabled: true, order: 40 });
  const phoneNumberField = getFieldConfig('phoneNumber', { section: 'contact', label: 'Phone Number', type: 'tel', required: false, enabled: true, order: 50 });
  const emailField = getFieldConfig('email', { section: 'contact', label: 'Email', type: 'email', required: false, enabled: true, order: 60 });
  const streetField = getFieldConfig('address.street', { section: 'address', label: 'Street Address', type: 'text', required: false, enabled: true, order: 70 });
  const cityField = getFieldConfig('address.city', { section: 'address', label: 'City', type: 'text', required: false, enabled: true, order: 80 });
  const stateField = getFieldConfig('address.state', { section: 'address', label: 'State/Province', type: 'text', required: false, enabled: true, order: 90 });
  const postalCodeField = getFieldConfig('address.postalCode', { section: 'address', label: 'Postal Code', type: 'text', required: false, enabled: true, order: 100 });
  const countryField = getFieldConfig('address.country', { section: 'address', label: 'Country', type: 'text', required: false, enabled: true, order: 110 });
  const documentGroups = Array.isArray(formConfig?.documentGroups) && formConfig.documentGroups.length
    ? formConfig.documentGroups
    : FALLBACK_KYC_FORM_CONFIG.documentGroups;

  if (error && !kycStatus) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadKYCStatus}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{formConfig?.copy?.title || 'KYC Verification'}</h1>
          <p className="mt-1 text-gray-600">{formConfig?.copy?.subtitle || 'Verify your identity to access all platform features'}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={loadKYCStatus}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Status
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {loading ? (
          <Skeleton type="card" />
        ) : kycStatus ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon(kycStatus.status)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Verification Status: <span className="capitalize">{kycStatus.status.replace('_', ' ')}</span>
                </h3>
                <p className="text-gray-600">
                  {kycStatus.status === 'approved' && 'Your identity has been verified successfully.'}
                  {kycStatus.status === 'pending' && 'Your verification is being processed.'}
                  {kycStatus.status === 'under_review' && 'Your documents are under review by our team.'}
                  {kycStatus.status === 'rejected' && 'Your verification was rejected. Please check the details below.'}
                  {kycStatus.status === 'requires_updates' && 'Additional information or documents are required.'}
                  {kycStatus.status === 'not_submitted' && 'Complete your KYC verification to unlock all features.'}
                </p>
              </div>
            </div>
            <StatusBadge status={kycStatus.status} type="kyc" />
          </div>
        ) : null}

        {/* Action Button */}
        {kycStatus && (
          <div className="mt-6 flex justify-end">
            {kycStatus.status === 'not_submitted' || kycStatus.status === 'requires_updates' ? (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Upload className="w-4 h-4 mr-2" />
                {kycStatus.status === 'not_submitted' ? 'Start Verification' : 'Update Information'}
              </button>
            ) : kycStatus.status === 'rejected' ? (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <Edit className="w-4 h-4 mr-2" />
                Resubmit Documents
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Rejection Details */}
      {kycStatus?.submission?.rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Rejection Reason</h3>
              <p className="text-sm text-red-700 mt-1">{kycStatus.submission.rejectionReason}</p>
            </div>
          </div>
        </div>
      )}

      {/* KYC Form Modal */}
      <ConfirmModal
        isOpen={showForm}
        title={kycStatus?.status === 'requires_updates' ? `Update ${formConfig?.copy?.title || 'KYC Information'}` : formConfig?.copy?.title || 'KYC Verification'}
        message={formConfig?.copy?.introMessage || 'Please provide your personal information and upload required documents'}
        onConfirm={handleSubmitKYC}
        onCancel={() => setShowForm(false)}
        confirmLabel={kycStatus?.submission ? (formConfig?.copy?.updateLabel || 'Update Submission') : (formConfig?.copy?.submitLabel || 'Submit for Verification')}
        cancelLabel="Cancel"
        variant="info"
        loading={submitting}
      >
        <div className="mt-6 space-y-6 max-h-96 overflow-y-auto">
          {/* Personal Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" />
              {formConfig?.copy?.personalSectionTitle || 'Personal Information'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {firstNameField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {firstNameField.label}{firstNameField.required ? ' *' : ''}
                  </label>
                  <input
                    type={firstNameField.type || 'text'}
                    value={getPersonalFieldValue('firstName')}
                    onChange={(e) => setPersonalFieldValue('firstName', e.target.value)}
                    placeholder={firstNameField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(firstNameField.required)}
                  />
                </div>
              )}
              {lastNameField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {lastNameField.label}{lastNameField.required ? ' *' : ''}
                  </label>
                  <input
                    type={lastNameField.type || 'text'}
                    value={getPersonalFieldValue('lastName')}
                    onChange={(e) => setPersonalFieldValue('lastName', e.target.value)}
                    placeholder={lastNameField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(lastNameField.required)}
                  />
                </div>
              )}
              {dateOfBirthField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dateOfBirthField.label}{dateOfBirthField.required ? ' *' : ''}
                  </label>
                  <input
                    type={dateOfBirthField.type || 'date'}
                    value={getPersonalFieldValue('dateOfBirth')}
                    onChange={(e) => setPersonalFieldValue('dateOfBirth', e.target.value)}
                    placeholder={dateOfBirthField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(dateOfBirthField.required)}
                  />
                </div>
              )}
              {nationalityField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {nationalityField.label}{nationalityField.required ? ' *' : ''}
                  </label>
                  <input
                    type={nationalityField.type || 'text'}
                    value={getPersonalFieldValue('nationality')}
                    onChange={(e) => setPersonalFieldValue('nationality', e.target.value)}
                    placeholder={nationalityField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(nationalityField.required)}
                  />
                </div>
              )}
              {phoneNumberField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {phoneNumberField.label}{phoneNumberField.required ? ' *' : ''}
                  </label>
                  <input
                    type={phoneNumberField.type || 'tel'}
                    value={getPersonalFieldValue('phoneNumber')}
                    onChange={(e) => setPersonalFieldValue('phoneNumber', e.target.value)}
                    placeholder={phoneNumberField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(phoneNumberField.required)}
                  />
                </div>
              )}
              {emailField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {emailField.label}{emailField.required ? ' *' : ''}
                  </label>
                  <input
                    type={emailField.type || 'email'}
                    value={getPersonalFieldValue('email')}
                    onChange={(e) => setPersonalFieldValue('email', e.target.value)}
                    placeholder={emailField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(emailField.required)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Address Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2" />
              {formConfig?.copy?.addressSectionTitle || 'Address Information'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streetField.enabled !== false && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {streetField.label}{streetField.required ? ' *' : ''}
                  </label>
                  <input
                    type={streetField.type || 'text'}
                    value={getPersonalFieldValue('address.street')}
                    onChange={(e) => setPersonalFieldValue('address.street', e.target.value)}
                    placeholder={streetField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(streetField.required)}
                  />
                </div>
              )}
              {cityField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {cityField.label}{cityField.required ? ' *' : ''}
                  </label>
                  <input
                    type={cityField.type || 'text'}
                    value={getPersonalFieldValue('address.city')}
                    onChange={(e) => setPersonalFieldValue('address.city', e.target.value)}
                    placeholder={cityField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(cityField.required)}
                  />
                </div>
              )}
              {stateField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {stateField.label}{stateField.required ? ' *' : ''}
                  </label>
                  <input
                    type={stateField.type || 'text'}
                    value={getPersonalFieldValue('address.state')}
                    onChange={(e) => setPersonalFieldValue('address.state', e.target.value)}
                    placeholder={stateField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(stateField.required)}
                  />
                </div>
              )}
              {postalCodeField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {postalCodeField.label}{postalCodeField.required ? ' *' : ''}
                  </label>
                  <input
                    type={postalCodeField.type || 'text'}
                    value={getPersonalFieldValue('address.postalCode')}
                    onChange={(e) => setPersonalFieldValue('address.postalCode', e.target.value)}
                    placeholder={postalCodeField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(postalCodeField.required)}
                  />
                </div>
              )}
              {countryField.enabled !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {countryField.label}{countryField.required ? ' *' : ''}
                  </label>
                  <input
                    type={countryField.type || 'text'}
                    value={getPersonalFieldValue('address.country')}
                    onChange={(e) => setPersonalFieldValue('address.country', e.target.value)}
                    placeholder={countryField.placeholder || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    required={Boolean(countryField.required)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Document Upload */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              {formConfig?.copy?.documentsSectionTitle || 'Document Upload'}
            </h4>
            <div className="space-y-4">
              {documentGroups.map((group) => {
                const options = Array.isArray(group.options) ? group.options : [];
                const columnsClass = options.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
                return (
                  <div key={group.key}>
                    <h5 className="text-sm font-semibold text-gray-700 mb-2">
                      {group.label}
                      {group.required ? ' *' : ''}
                    </h5>
                    {group.description ? (
                      <p className="text-xs text-gray-500 mb-2">{group.description}</p>
                    ) : null}
                    <div className={`grid grid-cols-1 ${columnsClass} gap-3`}>
                      {options.map((option) => {
                        const existingDoc = documents.find((doc) => String(doc.type) === String(option.key));
                        return (
                          <button
                            key={option.key}
                            type="button"
                            disabled={Boolean(uploadingType)}
                            onClick={() => openSecureUpload(String(option.key), option)}
                            className={`p-3 border rounded-lg text-left transition-colors ${
                              existingDoc ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                            } disabled:opacity-60`}
                          >
                            <div className="flex items-center space-x-2">
                              {uploadingType === String(option.key) ? (
                                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                              ) : existingDoc ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Upload className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="text-sm font-medium">{option.label}</span>
                            </div>
                            {existingDoc?.scanStatus === 'CLEAN' ? (
                              <p className="mt-2 text-xs text-green-700">Security scan passed</p>
                            ) : null}
                            {option.cameraOnly ? (
                              <p className="mt-2 text-xs text-amber-700">Camera-only capture required</p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mandatory consent — not pre-checked, not marketing */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
              />
              <span className="text-sm text-gray-800">
                {formConfig?.copy?.consentLabel ||
                  'I confirm that the information and documents I provide are accurate, that they will be reviewed by authorized administrators, and that automated security checks may be performed. Final approval is issued only by an authorized administrator.'}
                <span className="block mt-1 text-xs text-gray-500">
                  Policy version: {formConfig?.consent?.policyVersion || 'kyc-consent-v1'}
                </span>
              </span>
            </label>
          </div>
        </div>
      </ConfirmModal>

      {/* Private KYC file input — never generic public media upload */}
      <input
        ref={secureFileInputRef}
        type="file"
        className="hidden"
        accept={selectedDocumentConfig?.accept || 'image/jpeg,image/png,image/webp,application/pdf'}
        capture={selectedDocumentConfig?.cameraOnly ? 'user' : undefined}
        onChange={(event) => void handleSecureFileChosen(event.target.files)}
      />
    </div>
  );
};

export default KYCVerification;
