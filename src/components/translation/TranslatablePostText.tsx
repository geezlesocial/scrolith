import React, { useEffect, useMemo, useState } from 'react';
import ExpandablePreviewText from '../common/ExpandablePreviewText';
import MentionText from '../../community/components/MentionText';
import { useI18n } from '../../i18n/I18nProvider';
import { ContentTranslationService, type PostTranslationResult } from '../../services/contentTranslation';
import { postCardTextBlockClass, postCardType } from '../enterprise/postCardDesign';

type TranslatablePost = {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  sourceLanguage?: string | null;
  translationVersion?: string | null;
};

type TranslatablePostTextProps = {
  post: TranslatablePost | null;
  viewerId?: string | null;
  viewerUsername?: string | null;
  mentionToken?: string;
  expandable?: boolean;
  titleClassName?: string;
  contentClassName?: string;
  contentWrapperClassName?: string;
  buttonClassName?: string;
  translationRowClassName?: string;
  onTitleClick?: () => void;
  onContentClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onContentKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  tl: 'Tagalog',
  ha: 'Hausa',
  sw: 'Swahili',
  zh: 'Chinese',
  ar: 'Arabic'
};

const normalizeLocale = (value: unknown, fallback = 'en') => {
  const locale = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return locale || fallback;
};

const baseLocale = (value: unknown) => normalizeLocale(value).split('-')[0];

const formatLocaleLabel = (value: unknown) => {
  const normalized = baseLocale(value);
  return LANGUAGE_LABELS[normalized] || normalized.toUpperCase();
};

const extractErrorMessage = (error: any) =>
  String(error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Translation failed');

const TranslatablePostText: React.FC<TranslatablePostTextProps> = ({
  post,
  viewerId,
  viewerUsername,
  mentionToken,
  expandable = true,
  titleClassName = '',
  contentClassName = '',
  contentWrapperClassName = '',
  buttonClassName = '',
  translationRowClassName = '',
  onTitleClick,
  onContentClick,
  onContentKeyDown
}) => {
  const { locale } = useI18n();
  const [translation, setTranslation] = useState<PostTranslationResult | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTranslation(null);
    setShowTranslation(false);
    setLoading(false);
    setError('');
  }, [post?.id, post?.translationVersion, locale]);

  const canTranslate = useMemo(() => {
    if (!post?.id) return false;
    if (!String(post.title || '').trim() && !String(post.content || '').trim()) return false;
    const source = String(post.sourceLanguage || '').trim();
    if (source && baseLocale(source) === baseLocale(locale)) return false;
    return true;
  }, [locale, post?.content, post?.id, post?.sourceLanguage, post?.title]);

  const displayTitle = showTranslation ? translation?.translatedTitle || post?.title || '' : post?.title || '';
  const displayContent = showTranslation ? translation?.translatedContent || post?.content || '' : post?.content || '';

  const handleToggleTranslation = async () => {
    if (!canTranslate || !post?.id) return;
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await ContentTranslationService.getPostTranslation(post.id, locale, post.translationVersion);
      setTranslation(result);
      setShowTranslation(true);
    } catch (translationError: any) {
      setError(extractErrorMessage(translationError));
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) => (
    <MentionText
      text={text}
      mentionToken={mentionToken}
      viewerId={viewerId || undefined}
      viewerUsername={viewerUsername || undefined}
    />
  );

  const resolvedTitleClass = titleClassName || `${postCardType.title} text-left [overflow-wrap:anywhere]`;
  const resolvedBodyClass =
    contentWrapperClassName || `cursor-pointer ${postCardType.body} [overflow-wrap:anywhere]`;

  return (
    <div className={postCardTextBlockClass} data-testid="translatable-post-text">
      {displayTitle ? (
        onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className={resolvedTitleClass}
          >
            {displayTitle}
          </button>
        ) : (
          <div className={resolvedTitleClass}>{displayTitle}</div>
        )
      ) : null}

      {displayContent ? (
        onContentClick ? (
          <div
            className={resolvedBodyClass}
            role="button"
            tabIndex={0}
            onClick={onContentClick}
            onKeyDown={(event) => {
              if (onContentKeyDown) {
                onContentKeyDown(event);
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
          >
            {expandable ? (
              <ExpandablePreviewText
                text={displayContent}
                useLineClamp
                moreLabel="More..."
                buttonClassName={buttonClassName}
                renderText={(visibleText) => renderContent(visibleText)}
              />
            ) : (
              <div className={contentClassName || postCardType.body}>{renderContent(displayContent)}</div>
            )}
          </div>
        ) : expandable ? (
          <div className={resolvedBodyClass}>
            <ExpandablePreviewText
              text={displayContent}
              useLineClamp
              moreLabel="More..."
              buttonClassName={buttonClassName}
              renderText={(visibleText) => renderContent(visibleText)}
            />
          </div>
        ) : (
          <div className={contentClassName || postCardType.body}>{renderContent(displayContent)}</div>
        )
      ) : null}

      {canTranslate ? (
        <div className={`flex flex-wrap items-center gap-2 text-xs ${translationRowClassName}`.trim()}>
          <button
            type="button"
            onClick={handleToggleTranslation}
            disabled={loading}
            className="font-semibold text-slate-700 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Translating...' : showTranslation ? 'Show original' : error ? 'Retry translation' : 'See translation'}
          </button>
          <span className="text-slate-400">&middot;</span>
          <span className="text-slate-500">
            {showTranslation && translation
              ? `Translated from ${formatLocaleLabel(translation.sourceLanguage)}`
              : `Post language: ${formatLocaleLabel(post?.sourceLanguage || 'unknown')}`}
          </span>
          {error ? <span className="text-rose-600">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

export default TranslatablePostText;
