import React, { useEffect, useMemo, useState } from 'react';

export type ContentInterestSignal = 'INTERESTED' | 'NOT_INTERESTED';
export type ContentInterestType = 'post' | 'scroll';

type SurveyCandidateItem = {
  id?: string | null;
  authorId?: string | null;
  initialSignal?: string | null;
};

type ContentInterestSurveyProps = {
  entityId: string;
  viewerId?: string | null;
  contentType: ContentInterestType;
  initialSignal?: string | null;
  enabled?: boolean;
  appearance?: 'light' | 'dark';
  className?: string;
  onSubmit: (signal: ContentInterestSignal) => Promise<void> | void;
};

const DEFAULT_SURVEY_CANDIDATE_LIMIT = 4;

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const normalizeSignal = (value: unknown): ContentInterestSignal | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'INTERESTED' || normalized === 'NOT_INTERESTED') return normalized as ContentInterestSignal;
  return null;
};

const SURVEY_COPY: Record<
  ContentInterestType,
  {
    prompt: string;
    interested: string;
    notInterested: string;
  }
> = {
  post: {
    prompt: 'Are you interested in this post?',
    interested: 'Sounds good! Expect more Posts like this coming your way.',
    notInterested: "Sounds good! We'll show you fewer posts like this for now."
  },
  scroll: {
    prompt: 'Are you interested in this Scroll?',
    interested: 'Sounds good! Expect more Scrolls like this coming your way.',
    notInterested: "Sounds good! We'll show you fewer Scrolls like this for now."
  }
};

export const pickInterestSurveyCandidateIds = (
  items: SurveyCandidateItem[],
  viewerId?: string | null,
  contentType: ContentInterestType = 'post',
  limit = DEFAULT_SURVEY_CANDIDATE_LIMIT
) => {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) return [];
  const maxCount = Math.max(1, Math.min(12, Math.floor(Number(limit) || DEFAULT_SURVEY_CANDIDATE_LIMIT)));

  const eligible = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || '').trim(),
      authorId: String(item?.authorId || '').trim(),
      signal: normalizeSignal(item?.initialSignal)
    }))
    .filter((item) => item.id && (!item.authorId || item.authorId !== normalizedViewerId) && !item.signal);

  if (!eligible.length) return [];

  const ranked = eligible
    .map((item) => ({
      id: item.id,
      hash: stableHash(`${normalizedViewerId}:${contentType}:${item.id}`)
    }))
    .sort((left, right) => left.hash - right.hash);

  return ranked.slice(0, maxCount).map((item) => item.id);
};

export const pickInterestSurveyCandidateId = (
  items: SurveyCandidateItem[],
  viewerId?: string | null,
  contentType: ContentInterestType = 'post'
) => pickInterestSurveyCandidateIds(items, viewerId, contentType, 1)[0] || null;

const ContentInterestSurvey: React.FC<ContentInterestSurveyProps> = ({
  entityId,
  viewerId,
  contentType,
  initialSignal,
  enabled = false,
  appearance = 'light',
  className = '',
  onSubmit
}) => {
  const normalizedEntityId = String(entityId || '').trim();
  const normalizedViewerId = String(viewerId || '').trim();
  const serverSignal = useMemo(() => normalizeSignal(initialSignal), [initialSignal]);
  const [submittedSignal, setSubmittedSignal] = useState<ContentInterestSignal | null>(null);
  const [busySignal, setBusySignal] = useState<ContentInterestSignal | null>(null);
  const [ackVisible, setAckVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubmittedSignal(null);
    setBusySignal(null);
    setAckVisible(false);
    setError(null);
  }, [contentType, normalizedEntityId]);

  useEffect(() => {
    if (!submittedSignal) return;
    setAckVisible(true);
    const timer = window.setTimeout(() => {
      setAckVisible(false);
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [submittedSignal]);

  const copy = SURVEY_COPY[contentType];
  const ackMessage =
    submittedSignal === 'INTERESTED'
      ? copy.interested
      : submittedSignal === 'NOT_INTERESTED'
        ? copy.notInterested
        : null;

  const canPrompt =
    enabled &&
    Boolean(normalizedEntityId) &&
    Boolean(normalizedViewerId) &&
    !serverSignal &&
    !submittedSignal;

  if (!ackVisible && !canPrompt) return null;

  const isDark = appearance === 'dark';
  const shellClassName = isDark
    ? 'rounded-[22px] border border-white/12 bg-black/38 px-3.5 py-3 text-white shadow-[0_18px_48px_-28px_rgba(15,23,42,0.95)] backdrop-blur-md'
    : 'rounded-[22px] border border-slate-200/80 bg-white/92 px-3.5 py-3 text-slate-900 shadow-sm';
  const promptClassName = isDark
    ? 'text-[15px] font-medium leading-snug text-white'
    : 'text-[15px] font-medium leading-snug text-slate-900';
  const ackClassName = isDark ? 'text-sm font-medium text-white/90' : 'text-sm font-medium text-slate-700';
  const secondaryTextClassName = isDark ? 'text-[11px] text-white/65' : 'text-[11px] text-slate-500';
  /** Equal width + height, never wrap — design-system survey buttons */
  const buttonBaseClassName =
    'inline-flex h-[42px] w-full min-w-0 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
  const interestedButtonClassName = isDark
    ? `${buttonBaseClassName} border-cyan-300/25 bg-cyan-400/14 text-cyan-50 hover:bg-cyan-400/20`
    : `${buttonBaseClassName} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`;
  const notInterestedButtonClassName = isDark
    ? `${buttonBaseClassName} border-white/15 bg-white/8 text-white/90 hover:bg-white/14`
    : `${buttonBaseClassName} border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100`;

  const submit = async (signal: ContentInterestSignal) => {
    if (busySignal) return;
    setBusySignal(signal);
    setError(null);
    try {
      await onSubmit(signal);
      setSubmittedSignal(signal);
    } catch (submitError: any) {
      setError(
        submitError?.response?.data?.error ||
          submitError?.response?.data?.message ||
          submitError?.message ||
          'Unable to update your content preferences right now.'
      );
    } finally {
      setBusySignal(null);
    }
  };

  return (
    <div
      className={`${shellClassName} ${className}`.trim()}
      data-testid="content-interest-survey"
      data-phase="21.1.2S"
      data-content-type={contentType}
      data-entity-id={normalizedEntityId}
      data-survey-state={ackVisible ? 'ack' : canPrompt ? 'prompt' : 'idle'}
    >
      {ackVisible && ackMessage ? (
        <div className="space-y-1.5">
          <p className={ackClassName}>{ackMessage}</p>
          <p className={secondaryTextClassName}>Thanks. Your recommendation preferences have been updated.</p>
        </div>
      ) : canPrompt ? (
        <div className="space-y-3">
          <p className={promptClassName}>{copy.prompt}</p>
          <div className="grid grid-cols-2 gap-2" data-testid="content-interest-actions">
            <button
              type="button"
              disabled={Boolean(busySignal)}
              onClick={() => void submit('INTERESTED')}
              className={interestedButtonClassName}
              data-testid="content-interest-yes"
              aria-label="Interested in this content"
            >
              {busySignal === 'INTERESTED' ? 'Saving...' : 'Interested'}
            </button>
            <button
              type="button"
              disabled={Boolean(busySignal)}
              onClick={() => void submit('NOT_INTERESTED')}
              className={notInterestedButtonClassName}
              data-testid="content-interest-no"
              aria-label="Not interested in this content"
            >
              {busySignal === 'NOT_INTERESTED' ? 'Saving...' : 'Not interested'}
            </button>
          </div>
          {error ? (
            <p className={secondaryTextClassName} role="alert" data-testid="content-interest-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(ContentInterestSurvey);
