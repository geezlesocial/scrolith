import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { AuthPagesConfig } from '../types';
import { CMSService } from '../services/cms';

const Login = () => {
  const { login } = useUser(); // Ensure login function accepts email and password only
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);

  const defaultLoginContent = {
    headline: 'Sign in to your account',
    subheadline: '',
    email_placeholder: 'Email address',
    password_placeholder: 'Password',
    submit_label: 'Sign in',
    footer_text: "Don't have an account?",
    footer_link_label: 'Sign up',
    footer_link_url: '/auth/signup'
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

  const loginContent = authConfig?.login ?? defaultLoginContent;
  const branding = authConfig?.branding ?? defaultBranding;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call login without a hardcoded role - the backend will determine the role
      const success = await login(email, password);
      
      if (success) {
        // The UserContext should now have the correct user role
        // Redirect based on the role stored in the context
        // This logic should ideally be handled in the UserContext or App component after login
        // For now, a simple redirect to home
        navigate('/');
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
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
                <img src={branding.logo_url} alt="Logo" className="h-10" />
              </a>
            </div>
          )}
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            {loginContent.headline}
          </h2>
          {loginContent.subheadline && (
            <p className="text-center text-sm text-gray-600">
              {loginContent.subheadline}
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={loginContent.email_placeholder || 'Email address'}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={loginContent.password_placeholder || 'Password'}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : loginContent.submit_label}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {loginContent.footer_text}{' '}
              <a href={loginContent.footer_link_url || '/auth/signup'} className="font-medium text-blue-600 hover:text-blue-500">
                {loginContent.footer_link_label}
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
