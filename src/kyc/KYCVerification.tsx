
import React, { useState } from 'react';
import { ShieldCheck, Upload, FileText, User, MapPin, Calendar, Smartphone, Globe, CheckCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';

const KYCVerification = () => {
  const { showNotification } = useNotification();
  const { user, updateUser } = useUser();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
      fullName: '',
      address: '',
      mobile: '',
      dob: '',
      nationality: '',
      document: null as File | null
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setFormData({ ...formData, document: e.target.files[0] });
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);

      // Simulate API Call
      await CMSService.submitKYC({
          id: `KYC-${Math.random().toString(36).substr(2, 9)}`,
          userId: user?.id || 'unknown',
          userName: user?.name || 'User',
          fullName: formData.fullName,
          address: formData.address,
          mobile: formData.mobile,
          dob: formData.dob,
          nationality: formData.nationality,
          type: 'ID Card',
          status: 'Pending',
          dateSubmitted: new Date().toISOString(),
          frontImage: 'https://via.placeholder.com/300x200?text=Uploaded+ID'
      });

      // Update User Context
      updateUser({ kycStatus: 'pending' });

      showNotification('success', 'KYC Submitted', 'Your verification documents have been sent for review.');
      setStep(2);
      setIsSubmitting(false);
  };

  if (step === 2 || user?.kycStatus === 'pending') {
      return (
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
              <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100">
                  <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <ShieldCheck className="w-10 h-10 text-yellow-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification In Progress</h2>
                  <p className="text-gray-600 mb-8 max-w-md mx-auto">
                      We have received your details. Our team is reviewing your documents. This process typically takes 24-48 hours.
                  </p>
                  <button onClick={() => window.location.href = '/'} className="text-blue-600 font-medium hover:underline">
                      Back to Dashboard
                  </button>
              </div>
          </div>
      );
  }

  if (user?.kycStatus === 'approved') {
      return (
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
              <div className="bg-white p-10 rounded-2xl shadow-sm border border-green-100">
                  <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">You are Verified!</h2>
                  <p className="text-gray-600">
                      Your identity has been confirmed. You now have full access to all platform features.
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900">Identity Verification</h1>
            <p className="text-gray-500 mt-2">Complete the form below to verify your identity and unlock all features.</p>
        </div>

        <div className="bg-white shadow rounded-xl p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input 
                                required
                                type="text" 
                                className="block w-full pl-10 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="As on ID"
                                value={formData.fullName}
                                onChange={e => setFormData({...formData, fullName: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Globe className="h-5 w-5 text-gray-400" />
                            </div>
                            <input 
                                required
                                type="text" 
                                className="block w-full pl-10 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Citizenship"
                                value={formData.nationality}
                                onChange={e => setFormData({...formData, nationality: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar className="h-5 w-5 text-gray-400" />
                            </div>
                            <input 
                                required
                                type="date" 
                                className="block w-full pl-10 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                value={formData.dob}
                                onChange={e => setFormData({...formData, dob: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Smartphone className="h-5 w-5 text-gray-400" />
                            </div>
                            <input 
                                required
                                type="tel" 
                                className="block w-full pl-10 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="+1 234 567 890"
                                value={formData.mobile}
                                onChange={e => setFormData({...formData, mobile: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Residential Address</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MapPin className="h-5 w-5 text-gray-400" />
                            </div>
                            <input 
                                required
                                type="text" 
                                className="block w-full pl-10 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Full Street Address"
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-4">Government Issued ID</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition relative">
                        <input 
                            type="file" 
                            required 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                            accept="image/*,.pdf"
                        />
                        <div className="pointer-events-none">
                            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                            {formData.document ? (
                                <p className="text-green-600 font-medium">{formData.document.name}</p>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-600">Click to upload Passport or Driver's License</p>
                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG or PDF up to 5MB</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Verification'}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default KYCVerification;
