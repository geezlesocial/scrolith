import React, { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import { AuthService } from '../services/authService';
import { resolveAuthenticatedEntryPath } from '../utils/authRedirect';
import api from '../services/api';

/**
 * Phase 25B — OAuth frontend completion.
 *
 * Accepts a short-lived one-time `code` from the backend provider callback,
 * exchanges it for a session JWT via POST /auth/oauth/exchange, then strips
 * sensitive query params from the address bar.
 *
 * Legacy `token` query param is still accepted temporarily for in-flight
 * sessions but is never logged and is cleared from the URL immediately.
 */
const OAuthCallback = () => {
  const [message, setMessage] = useState('Completing sign-in…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const exchangeCode = params.get('code') || hashParams.get('code') || '';
    const legacyToken = params.get('token') || hashParams.get('token') || '';
    const error = params.get('error') || hashParams.get('error') || '';
    const redirectRaw = params.get('redirect') || hashParams.get('redirect') || '';

    // Immediately remove sensitive query parameters from history.
    try {
      const clean = `${window.location.pathname}`;
      window.history.replaceState({}, document.title, clean);
    } catch {
      // ignore
    }

    const sanitizeRedirect = (value: string) => {
      const raw = String(value || '').trim();
      if (!raw.startsWith('/')) return '/';
      if (raw.startsWith('//')) return '/';
      if (raw.includes('\\')) return '/';
      if (/javascript:|data:|vbscript:/i.test(raw)) return '/';
      if (raw.startsWith('/auth/oauth/callback')) return '/';
      return raw.slice(0, 512) || '/';
    };

    const next = sanitizeRedirect(redirectRaw);

    if (error) {
      let decoded = error;
      try {
        decoded = decodeURIComponent(error);
      } catch {
        decoded = error;
      }
      setMessage(decoded || 'We couldn’t complete your sign-in.');
      return;
    }

    const finish = async (token: string) => {
      try {
        await AuthService.setToken(token);
        setMessage('Sign-in completed');
        const me = await AuthService.getCurrentUser();
        if (me) {
          window.location.replace(
            me.followOnboardingRequired ? resolveAuthenticatedEntryPath(me) : next
          );
          return;
        }
      } catch {
        // Navigation will re-trigger auth bootstrap
      }
      window.location.replace(next);
    };

    const run = async () => {
      try {
        if (exchangeCode) {
          const response = await api.post(
            '/auth/oauth/exchange',
            { code: exchangeCode },
            { __skipRetry: true } as any
          );
          const token = String(response?.data?.token || response?.data?.data?.token || '').trim();
          if (!token) {
            setMessage('We couldn’t complete your sign-in.');
            return;
          }
          await finish(token);
          return;
        }

        if (legacyToken) {
          // Temporary compatibility path — do not log the token.
          await finish(legacyToken);
          return;
        }

        setMessage('We couldn’t complete your sign-in.');
      } catch {
        setMessage('We couldn’t complete your sign-in.');
      }
    };

    void run();
  }, []);

  const failed = /couldn|could not|error|failed|invalid|expired/i.test(message);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center space-y-4 max-w-sm">
        {!failed && <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto" aria-hidden />}
        <p className="text-sm text-gray-700" role="status">
          {message}
        </p>
        {failed && (
          <a
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Return to login
          </a>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
