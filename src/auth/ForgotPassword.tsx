import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { CMSService } from '../services/cms';
import { AuthPagesConfig } from '../types';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { useT } from '../i18n/useT';
import { resolveOptimizedStaticImageUrl, resolveResponsiveAssetUrl } from '../utils/assetUrl';
import ScrolithHumanVerification from '../components/human-verification/ScrolithHumanVerification';

const ForgotPassword = () => {
  const t = useT();
  const { showNotification } = useNotification();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);
  const [hvToken, setHvToken] = useState<string | null>(null);
  const [hvRequired, setHvRequired] = useState(false);

  const defaultContent = {
    headline: t('auth.forgot.headline', 'Forgot your password?'),
    subheadline: t('auth.forgot.subheadline', 'Enter your email address and we will send a reset link.'),
    email_placeholder: t('auth.forgot.email_placeholder', 'Email address'),
    submit_label: t('auth.forgot.submit_label', 'Send reset link'),
    footer_text: t('auth.forgot.footer_text', 'Remembered your password?'),
    footer_link_label: t('auth.forgot.footer_link_label', 'Back to sign in'),
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
      } catch {
        // Ignore and use defaults
      }
    };
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const forgotContent = (authConfig as any)?.forgot_password ?? defaultContent;
  const branding = authConfig?.branding ?? defaultBranding;
  const logoSrc = resolveResponsiveAssetUrl(
    resolveOptimizedStaticImageUrl(branding.logo_url),
    { width: 160, height: 48, fit: 'inside', quality: 72 }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (hvRequired && !hvToken) {
      setError(t('auth.forgot.hv_required', 'Please complete human verification to continue.'));
      return;
    }
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/forgot-password', {
        email,
        humanVerificationToken: hvToken || undefined
      });
      setSubmitted(true);
      showNotification(
        'success',
        t('auth.forgot.check_email_title', 'Check your email'),
        t('auth.forgot.check_email_message', 'If an account exists, a reset link has been sent.')
      );
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Unable to send reset email. Please try again later.';
      setError(message);
      setSubmitted(true);
      showNotification('alert', 'Request failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="space-y-3">
          {branding.show_logo && branding.logo_url && (
            <div className="flex justify-center">
              <a href={branding.logo_link_url || '/'}>
                <img src={logoSrc} alt="Logo" width="160" height="48" loading="eager" decoding="async" className="h-10 w-auto" />
              </a>
            </div>
          )}
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            {forgotContent.headline}
          </h2>
          {forgotContent.subheadline && (
            <p className="text-center text-sm text-gray-600">
              {forgotContent.subheadline}
            </p>
          )}
        </div>

        <div className="mt-8 space-y-6">
          {submitted && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">
                {t('auth.forgot.sent_message', 'If an account exists for this email, a reset link has been sent.')}
              </div>
            </div>
          )}
          {error && !submitted && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="sr-only">{t('auth.forgot.email_placeholder', 'Email address')}</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none rounded-md relative block w-full px-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder={forgotContent.email_placeholder || t('auth.forgot.email_placeholder', 'Email address')}
                />
              </div>
            </div>

            <ScrolithHumanVerification
              endpoint="forgot_password"
              onVerified={setHvToken}
              onRequiredChange={setHvRequired}
            />

            <div>
              <button
                type="submit"
                disabled={loading || (hvRequired && !hvToken)}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Sending...' : forgotContent.submit_label}
              </button>
            </div>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {forgotContent.footer_text}{' '}
              <Link to={forgotContent.footer_link_url || '/auth/login'} className="font-medium text-blue-600 hover:text-blue-500">
                {forgotContent.footer_link_label}
              </Link>
            </p>
          </div>

          <div className="flex justify-center">
            <Link to="/auth/login" className="text-xs text-gray-500 hover:text-gray-700 flex items-center">
              <ArrowLeft className="w-3 h-3 mr-1" /> {t('auth.forgot.footer_link_label', 'Back to sign in')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
