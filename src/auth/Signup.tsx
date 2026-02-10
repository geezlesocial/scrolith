import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { AuthPagesConfig, UserRole } from '../types';
import { Briefcase, User, Shield, Mail, Lock, UserPlus, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { CMSService } from '../services/cms';
import AuthSocialButtons from './AuthSocialButtons';
import { executeRecaptcha } from '../services/recaptcha';

const Signup = () => {
  const { register } = useUser(); // Use 'register' from context, not 'signup'
  const { settings } = useContent();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [role, setRole] = useState<UserRole>(UserRole.FREELANCER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const defaultSignupContent = {
    headline: 'Join Our Community',
    subheadline: '',
    submit_label: 'Create Account',
    terms_url: '/p/terms',
    privacy_url: '/p/privacy',
    footer_text: 'Already have an account?',
    footer_link_label: 'Sign in here',
    footer_link_url: '/auth/login'
  };

  const defaultBranding = {
    show_logo: true,
    logo_url: '',
    logo_link_url: '/'
  };

  useEffect(() => {
    let isMounted = true;
    const loadConfig = async () => {
      try {
        const data = await CMSService.getAuthPagesConfig();
        if (isMounted && data) {
          setAuthConfig(data);
        }
      } catch (err) {
        // Ignore and use defaults
      }
    };
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const signupContent = authConfig?.signup ?? defaultSignupContent;
  const branding = authConfig?.branding ?? defaultBranding;
  const socialConfig = authConfig?.social_auth;

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Name validation
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!emailRegex.test(formData.email)) newErrors.email = 'Please enter a valid email';

    // Password validation
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain letters and numbers';
    }

    // Confirm password
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Terms acceptance
    if (!acceptTerms) newErrors.terms = 'You must accept the terms and conditions';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const recaptchaConfig = (settings as any)?.integrations?.recaptcha || {};
      const legacySiteKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || '';
      const recaptchaEnabled = Boolean(recaptchaConfig?.enabled) || Boolean(legacySiteKey);
      const siteKey = String(recaptchaConfig?.siteKey || legacySiteKey || '').trim();
      const version = (recaptchaConfig?.version || 'v3') as 'v2' | 'v3';
      let recaptchaToken: string | undefined;

      if (recaptchaEnabled) {
        if (version !== 'v3') {
          setErrors({ submit: 'reCAPTCHA v3 is required for signup.' });
          setIsLoading(false);
          return;
        }
        if (!siteKey) {
          setErrors({ submit: 'reCAPTCHA site key is missing. Contact support.' });
          setIsLoading(false);
          return;
        }
        recaptchaToken = await executeRecaptcha(siteKey, 'signup');
      }

      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
      
      // Call register from context - pass email, name, password, and role
      const success = await register(formData.email, fullName, formData.password, role, recaptchaToken);

      if (success) {
        // Redirect based on role after successful registration
        if (role === UserRole.ADMIN) navigate('/admin');
        else if (role === UserRole.EMPLOYER) navigate('/client/dashboard');
        else navigate('/freelancer/dashboard');
      } else {
        setErrors({ submit: 'Signup failed. Please try again.' });
      }
    } catch (error: any) {
      setErrors({ submit: error?.message || 'Signup failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          {branding.show_logo && branding.logo_url ? (
            <a href={branding.logo_link_url || '/'} className="inline-flex">
              <img src={branding.logo_url} alt="Logo" className="h-12" />
            </a>
          ) : (
            <div className="w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-2xl text-white shadow-lg">
              <UserPlus className="w-7 h-7" />
            </div>
          )}
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">{signupContent.headline}</h2>
        {signupContent.subheadline && (
          <p className="mt-2 text-center text-sm text-gray-600">
            {signupContent.subheadline}
          </p>
        )}
        <p className="mt-2 text-center text-sm text-gray-600">
          {signupContent.footer_text}{' '}
          <Link to={signupContent.footer_link_url || '/auth/login'} className="font-semibold text-blue-600 hover:text-blue-500 transition-colors">
            {signupContent.footer_link_label}
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-gray-100">
          {errors.submit && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {errors.submit}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-3">Select your role</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole(UserRole.FREELANCER)}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl transition-all duration-200 ${
                    role === UserRole.FREELANCER
                      ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-6 h-6 mb-2" />
                  <span className="font-medium">Freelancer</span>
                  <span className="text-xs mt-1 text-gray-500">Find work</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.EMPLOYER)}
                  className={`flex flex-col items-center justify-center p-4 border-2 rounded-xl transition-all duration-200 ${
                    role === UserRole.EMPLOYER
                      ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Briefcase className="w-6 h-6 mb-2" />
                  <span className="font-medium">Employer</span>
                  <span className="text-xs mt-1 text-gray-500">Hire talent</span>
                </button>
              </div>
            </div>

            <AuthSocialButtons mode="signup" role={role} config={socialConfig || undefined} />

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  className={`block w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                    errors.firstName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.firstName}
                  onChange={(e) => {
                    setFormData({ ...formData, firstName: e.target.value });
                    if (errors.firstName) setErrors({ ...errors, firstName: '' });
                  }}
                  placeholder="John"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" /> {errors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  className={`block w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                    errors.lastName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.lastName}
                  onChange={(e) => {
                    setFormData({ ...formData, lastName: e.target.value });
                    if (errors.lastName) setErrors({ ...errors, lastName: '' });
                  }}
                  placeholder="Doe"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" /> {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  className={`block w-full pl-10 px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                    errors.email ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" /> {errors.email}
                </p>
              )}
            </div>

            {/* Password Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className={`block w-full pl-10 pr-10 px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    }`}
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (errors.password) setErrors({ ...errors, password: '' });
                    }}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password ? (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" /> {errors.password}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters with letters and numbers
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    className={`block w-full pl-10 pr-10 px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                      errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                    }}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" /> {errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => {
                    setAcceptTerms(e.target.checked);
                    if (errors.terms) setErrors({ ...errors, terms: '' });
                  }}
                  className="focus:ring-blue-500 h-5 w-5 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3">
                <label htmlFor="terms" className="text-sm text-gray-700">
                  I agree to the{' '}
                  <Link to={signupContent.terms_url || '/p/terms'} className="font-medium text-blue-600 hover:text-blue-500">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to={signupContent.privacy_url || '/p/privacy'} className="font-medium text-blue-600 hover:text-blue-500">
                    Privacy Policy
                  </Link>
                </label>
                {errors.terms && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" /> {errors.terms}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-t-2 border-white border-solid rounded-full animate-spin mr-2"></div>
                    Creating Account...
                  </>
                ) : (
                  signupContent.submit_label
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;
