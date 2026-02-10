import React, { useState, useEffect } from 'react';
import { kycApi, KYCStatus, KYCSubmission, KYCDocument, CreateKYCSubmissionData } from '../../services/kyc';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';
import { ConfirmModal } from './ConfirmModal';
import { FilePickerModal } from './FilePickerModal';
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

export const KYCVerification: React.FC<KYCVerificationProps> = ({ role = 'freelancer' }) => {
  const { user, updateUser } = useUser();
  const { showNotification } = useNotification();

  const [kycStatus, setKycStatus] = useState<{ status: KYCStatus; submission?: KYCSubmission } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState<KYCDocument['type'] | null>(null);

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
    type: KYCDocument['type'];
    fileId: string;
    fileUrl?: string;
  }[]>([]);

  const loadKYCStatus = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const data = await kycApi.getKYCStatus();
      setKycStatus(data);

      // Pre-fill form if there's existing submission
      if (data.submission) {
        setPersonalInfo({
          ...data.submission.personalInfo,
          email: user.email || data.submission.personalInfo.email,
        });
        setDocuments(data.submission.documents.map(doc => ({
          type: doc.type,
          fileId: doc.fileId,
          fileUrl: doc.fileUrl,
        })));
      }
    } catch (error: any) {
      console.error('Failed to load KYC status:', error);
      setError(error.message || 'Failed to load KYC status');
      showNotification('error', 'Load Error', error.message || 'Failed to load KYC status');
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
        updateUser?.({
          kycStatus: nextStatus,
          kyc_status: nextStatus
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

  const handleFileSelect = (picked: any[] | any) => {
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (selectedDocumentType && file) {
      const fileId = file.id || file.fileId;
      const fileUrl = file.url || file.fileUrl;
      const existingDocIndex = documents.findIndex(doc => doc.type === selectedDocumentType);

      if (existingDocIndex >= 0) {
        // Update existing document
        const updatedDocs = [...documents];
        updatedDocs[existingDocIndex] = {
          type: selectedDocumentType,
          fileId,
          fileUrl,
        };
        setDocuments(updatedDocs);
      } else {
        // Add new document
        setDocuments([...documents, {
          type: selectedDocumentType,
          fileId,
          fileUrl,
        }]);
      }
    }
    setShowFilePicker(false);
    setSelectedDocumentType(null);
  };

  const handleSubmitKYC = async () => {
    // Validation
    if (!personalInfo.firstName || !personalInfo.lastName || !personalInfo.dateOfBirth) {
      showNotification('error', 'Validation Error', 'Please fill in all required personal information');
      return;
    }

    const hasIdentity = documents.some((doc) =>
      ['passport', 'drivers_license', 'national_id'].includes(doc.type)
    );
    const hasAddress = documents.some((doc) =>
      ['utility_bill', 'bank_statement', 'address_proof'].includes(doc.type)
    );
    if (!hasIdentity || !hasAddress) {
      showNotification('error', 'Validation Error', 'Please upload one identity document and one address proof');
      return;
    }

    setSubmitting(true);
    try {
      const submissionData: CreateKYCSubmissionData = {
        personalInfo,
        documents: documents.map(doc => ({
          type: doc.type,
          fileId: doc.fileId,
        })),
      };

      if (kycStatus?.submission) {
        // Update existing submission
        await kycApi.updateKYC(kycStatus.submission.id, submissionData);
        showNotification('success', 'KYC Updated', 'Your KYC information has been updated successfully');
      } else {
        // Create new submission
        await kycApi.submitKYC(submissionData);
        showNotification('success', 'KYC Submitted', 'Your KYC verification has been submitted successfully');
      }

      updateUser?.({ kycStatus: 'pending', kyc_status: 'pending' });
      setShowForm(false);
      loadKYCStatus();
    } catch (error: any) {
      showNotification('error', 'Submission Failed', error.message || 'Failed to submit KYC verification');
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
          <h1 className="text-2xl font-bold text-gray-900">KYC Verification</h1>
          <p className="mt-1 text-gray-600">Verify your identity to access all platform features</p>
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
        title={kycStatus?.status === 'requires_updates' ? 'Update KYC Information' : 'KYC Verification'}
        message="Please provide your personal information and upload required documents"
        onConfirm={handleSubmitKYC}
        onCancel={() => setShowForm(false)}
        confirmLabel={kycStatus?.submission ? 'Update Submission' : 'Submit for Verification'}
        cancelLabel="Cancel"
        variant="info"
        loading={submitting}
      >
        <div className="mt-6 space-y-6 max-h-96 overflow-y-auto">
          {/* Personal Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" />
              Personal Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={personalInfo.firstName}
                  onChange={(e) => setPersonalInfo({...personalInfo, firstName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={personalInfo.lastName}
                  onChange={(e) => setPersonalInfo({...personalInfo, lastName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  value={personalInfo.dateOfBirth}
                  onChange={(e) => setPersonalInfo({...personalInfo, dateOfBirth: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nationality
                </label>
                <input
                  type="text"
                  value={personalInfo.nationality}
                  onChange={(e) => setPersonalInfo({...personalInfo, nationality: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={personalInfo.phoneNumber}
                  onChange={(e) => setPersonalInfo({...personalInfo, phoneNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={personalInfo.email}
                  onChange={(e) => setPersonalInfo({...personalInfo, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2" />
              Address Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={personalInfo.address.street}
                  onChange={(e) => setPersonalInfo({
                    ...personalInfo,
                    address: {...personalInfo.address, street: e.target.value}
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={personalInfo.address.city}
                  onChange={(e) => setPersonalInfo({
                    ...personalInfo,
                    address: {...personalInfo.address, city: e.target.value}
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State/Province
                </label>
                <input
                  type="text"
                  value={personalInfo.address.state}
                  onChange={(e) => setPersonalInfo({
                    ...personalInfo,
                    address: {...personalInfo.address, state: e.target.value}
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={personalInfo.address.postalCode}
                  onChange={(e) => setPersonalInfo({
                    ...personalInfo,
                    address: {...personalInfo.address, postalCode: e.target.value}
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={personalInfo.address.country}
                  onChange={(e) => setPersonalInfo({
                    ...personalInfo,
                    address: {...personalInfo.address, country: e.target.value}
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Document Upload */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Document Upload
            </h4>
            <div className="space-y-4">
              {/* Identity Documents */}
              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Identity Documents (Choose one)</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['passport', 'drivers_license', 'national_id'].map((type) => {
                    const existingDoc = documents.find(doc => doc.type === type);
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setSelectedDocumentType(type as KYCDocument['type']);
                          setShowFilePicker(true);
                        }}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          existingDoc
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {existingDoc ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Upload className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium capitalize">
                            {type.replace('_', ' ')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Address Proof */}
              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Address Proof (Choose one)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['utility_bill', 'bank_statement'].map((type) => {
                    const existingDoc = documents.find(doc => doc.type === type);
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setSelectedDocumentType(type as KYCDocument['type']);
                          setShowFilePicker(true);
                        }}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          existingDoc
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {existingDoc ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Upload className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium capitalize">
                            {type.replace('_', ' ')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ConfirmModal>

      {/* File Picker Modal */}
      <FilePickerModal
        isOpen={showFilePicker}
        onClose={() => {
          setShowFilePicker(false);
          setSelectedDocumentType(null);
        }}
        onSelect={handleFileSelect}
        title={`Upload ${selectedDocumentType?.replace('_', ' ')}`}
        acceptedTypes="image/*,application/pdf"
      />
    </div>
  );
};

export default KYCVerification;
