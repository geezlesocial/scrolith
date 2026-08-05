import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import HumanVerificationService, {
  HumanVerificationChallenge,
  HumanVerificationEndpoint,
  HumanVerificationPublicSettings
} from '../../services/humanVerification';

export type ScrolithHumanVerificationProps = {
  endpoint: HumanVerificationEndpoint;
  /** Called when verified; token is null if verification not required */
  onVerified: (token: string | null) => void;
  onRequiredChange?: (required: boolean) => void;
  onError?: (message: string) => void;
  className?: string;
  autoLoad?: boolean;
  disabled?: boolean;
};

/**
 * Scrolith Human Verification — privacy-friendly CAPTCHA alternative.
 * Server generates challenges; correct answer never arrives on the client.
 */
const ScrolithHumanVerification: React.FC<ScrolithHumanVerificationProps> = ({
  endpoint,
  onVerified,
  onRequiredChange,
  onError,
  className = '',
  autoLoad = true,
  disabled = false
}) => {
  const baseId = useId();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [required, setRequired] = useState(false);
  const [challenge, setChallenge] = useState<HumanVerificationChallenge | null>(null);
  const [settings, setSettings] = useState<HumanVerificationPublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onVerified, onRequiredChange, onError });
  const loadSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const theme = settings?.theme;
  const branding = settings?.branding;
  const accent = theme?.accentColor || '#2563eb';
  const rounded = theme?.shape !== 'square';
  const radius = rounded ? 'rounded-xl' : 'rounded-md';

  useEffect(() => {
    callbacksRef.current = { onVerified, onRequiredChange, onError };
  }, [onError, onRequiredChange, onVerified]);

  const loadChallenge = useCallback(async () => {
    if (disabled) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const callbacks = callbacksRef.current;
    setLoading(true);
    setError(null);
    setVerified(false);
    setSelectedId(null);
    setChallenge(null);
    callbacks.onVerified(null);

    try {
      const result = await HumanVerificationService.createChallenge(endpoint);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;

      if (result.publicSettings) setSettings(result.publicSettings);

      if (!result.required) {
        setRequired(false);
        callbacksRef.current.onRequiredChange?.(false);
        setVerified(true);
        callbacksRef.current.onVerified(null);
        return;
      }

      setRequired(true);
      callbacksRef.current.onRequiredChange?.(true);

      if (result.error || !result.challenge) {
        const msg = result.error || 'Unable to load verification challenge.';
        setError(msg);
        callbacksRef.current.onError?.(msg);
        return;
      }

      setChallenge(result.challenge);
      startedAtRef.current = Date.now();
    } catch (err: any) {
      const msg = err?.message || 'Unable to load verification.';
      setError(msg);
      callbacksRef.current.onError?.(msg);
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) setLoading(false);
    }
  }, [disabled, endpoint]);

  useEffect(() => {
    if (autoLoad) void loadChallenge();
  }, [autoLoad, loadChallenge]);

  const handleSelect = async (optionId: string, value: string) => {
    if (!challenge || verifying || verified || disabled) return;
    setSelectedId(optionId);
    setVerifying(true);
    setError(null);

    try {
      const result = await HumanVerificationService.verifyChallenge({
        challengeToken: challenge.challengeToken,
        optionId,
        answer: value,
        startedAt: startedAtRef.current
      });

      if (!mountedRef.current) return;

      if (!result.success || !result.verificationToken) {
        const msg =
          result.error ||
          branding?.failureMessage ||
          'That was not correct. Please try again.';
        setError(msg);
        callbacksRef.current.onError?.(msg);
        setSelectedId(null);
        // Auto-refresh on expire / max attempts
        if (result.code === 'HV_EXPIRED' || result.code === 'HV_MAX_ATTEMPTS' || result.code === 'HV_ALREADY_USED') {
          await loadChallenge();
        } else if (typeof result.attemptsRemaining === 'number' && result.attemptsRemaining <= 0) {
          await loadChallenge();
        }
        return;
      }

      setVerified(true);
      setError(null);
      callbacksRef.current.onVerified(result.verificationToken);
    } catch (err: any) {
      const msg = err?.message || 'Verification failed.';
      setError(msg);
      callbacksRef.current.onError?.(msg);
    } finally {
      if (mountedRef.current) setVerifying(false);
    }
  };

  const visual = useMemo(() => {
    if (!challenge?.prompt?.visual) return null;
    if (Array.isArray(challenge.prompt.visual)) return challenge.prompt.visual.join(' ');
    return challenge.prompt.visual;
  }, [challenge]);

  // Not required and already resolved — render nothing (or compact success)
  if (!loading && !required && verified) {
    return null;
  }

  if (!loading && !required && !challenge) {
    return null;
  }

  return (
    <section
      className={`border border-slate-200 bg-white p-4 shadow-sm ${radius} ${className}`}
      style={{ borderColor: verified ? '#86efac' : undefined }}
      aria-labelledby={`${baseId}-title`}
      aria-describedby={`${baseId}-desc`}
      data-testid="scrolith-human-verification"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {branding?.showLogo !== false && (
            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center ${radius}`}
              style={{ backgroundColor: `${accent}15`, color: accent }}
              aria-hidden
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
          )}
          <div>
            <h3 id={`${baseId}-title`} className="text-sm font-semibold text-slate-900">
              {branding?.title || 'Scrolith Human Verification'}
            </h3>
            <p id={`${baseId}-desc`} className="mt-0.5 text-xs text-slate-500">
              {branding?.instructions || 'Complete this check to continue.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadChallenge()}
          disabled={loading || verifying || disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Refresh challenge"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading challenge…
        </div>
      )}

      {!loading && verified && (
        <div
          className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-3 text-sm font-medium text-green-700"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5" />
          {branding?.successMessage || 'Verified. You may continue.'}
        </div>
      )}

      {!loading && !verified && challenge && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {challenge.prompt.title}
              <span className="ml-2 font-normal normal-case text-slate-400">
                · {challenge.challengeType.replace(/_/g, ' ')} · {challenge.difficulty}
              </span>
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">{challenge.prompt.instruction}</p>
            {(challenge.prompt.display || visual) && (
              <p
                className="mt-2 text-center text-2xl font-bold tracking-wide text-slate-900"
                aria-hidden={Boolean(visual)}
              >
                {visual || challenge.prompt.display}
              </p>
            )}
          </div>

          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label="Answer options"
          >
            {challenge.options.map((opt) => {
              const isSelected = selectedId === opt.id;
              const isColor = challenge.challengeType === 'color';
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={verifying || disabled}
                  onClick={() => void handleSelect(opt.id, opt.value)}
                  className={`min-h-[48px] touch-manipulation px-3 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${radius} ${
                    isSelected
                      ? 'text-white shadow'
                      : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: accent, borderColor: accent }
                      : isColor
                        ? {
                            borderColor: opt.label.toLowerCase().includes('blue')
                              ? '#2563eb'
                              : undefined
                          }
                        : undefined
                  }
                  aria-pressed={isSelected}
                  aria-label={`Select ${opt.label}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {verifying && (
            <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking…
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        Privacy-friendly · No third-party tracking · Owned by Scrolith
      </p>
    </section>
  );
};

export default ScrolithHumanVerification;
