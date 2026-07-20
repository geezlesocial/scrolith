import React, { useEffect, useMemo, useState } from 'react';
import ExpandablePreviewText from '../common/ExpandablePreviewText';
import MentionText from '../../community/components/MentionText';
import { useI18n } from '../../i18n/I18nProvider';
import { ContentTranslationService, type PostTranslationResult } from '../../services/contentTranslation';
import { LanguagePreferencesService, type UserLanguagePreferences } from '../../services/languagePreferences';
import { evaluateTranslationDecision } from '../../utils/translationDecisionPolicy';
import { formatLanguageLabel } from '../../utils/supportedLanguages';
import { postCardTextBlockClass, postCardType } from '../enterprise/postCardDesign';

type TranslatablePost = {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  sourceLanguage?: string | null;
  languageDetectionStatus?: string | null;
  isMixedLanguage?: boolean | null;
  detectedLanguageCodes?: string[] | null;
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

const extractErrorMessage = (error: any) =>
  String(error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Translation failed');

let prefsCache: UserLanguagePreferences | null = null;
let prefsInflight: Promise<UserLanguagePreferences | null> | null = null;

const loadLanguagePrefs = async () => {
  if (prefsCache) return prefsCache;
  if (prefsInflight) return prefsInflight;
  prefsInflight = LanguagePreferencesService.getMine()
    .then((prefs) => {
      prefsCache = prefs;
      return prefs;
    })
    .catch(() => null)
    .finally(() => {
      prefsInflight = null;
    });
  return prefsInflight;
};

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
  const [prefs, setPrefs] = useState<UserLanguagePreferences | null>(prefsCache);

  useEffect(() => {
    setTranslation(null);
    setShowTranslation(false);
    setLoading(false);
    setError('');
  }, [post?.id, post?.translationVersion, locale]);

  useEffect(() => {
    let active = true;
    if (!viewerId) return;
    void loadLanguagePrefs().then((value) => {
      if (active) setPrefs(value);
    });
    return () => {
      active = false;
    };
  }, [viewerId]);

  const decision = useMemo(() => {
    return evaluateTranslationDecision({
      viewerUnderstoodLanguages: prefs?.understoodLanguages || [],
      viewerPreferredTranslationLanguage: prefs?.preferredTranslationLanguage || locale,
      viewerSuggestionsEnabled: prefs?.languageSuggestionsEnabled,
      viewerAutoTranslateEnabled: prefs?.autoTranslateEnabled,
      viewerPreferencesConfirmed: prefs?.languagePreferencesConfirmed,
      postLanguageCode: post?.sourceLanguage,
      detectedLanguageCodes: post?.detectedLanguageCodes || [],
      isMixedLanguage: Boolean(post?.isMixedLanguage),
      languageDetectionStatus: post?.languageDetectionStatus,
      translationAvailable: true
    });
  }, [locale, post, prefs]);

  const canTranslate = useMemo(() => {
    if (!post?.id) return false;
    if (!String(post.title || '').trim() && !String(post.content || '').trim()) return false;
    if (post.languageDetectionStatus === 'no_linguistic_content') return false;
    return decision.showTranslationAction;
  }, [decision.showTranslationAction, post]);

  useEffect(() => {
    if (!canTranslate || !decision.autoTranslate || !post?.id || showTranslation || translation) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await ContentTranslationService.getPostTranslation(
          post.id!,
          decision.targetLanguage || locale,
          post.translationVersion
        );
        if (!cancelled) {
          setTranslation(result);
          setShowTranslation(true);
        }
      } catch {
        // keep manual action available
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canTranslate, decision.autoTranslate, decision.targetLanguage, locale, post?.id, post?.translationVersion, showTranslation, translation]);

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
        <div
          className={`flex flex-wrap items-center gap-2 text-xs ${translationRowClassName} ${
            decision.recommendTranslation ? '' : 'opacity-80'
          }`.trim()}
          data-translation-reason={decision.reason}
        >
          <button
            type="button"
            onClick={handleToggleTranslation}
            disabled={loading}
            className={`font-semibold hover:underline disabled:cursor-not-allowed disabled:opacity-60 ${
              decision.recommendTranslation
                ? 'text-blue-700 hover:text-blue-900'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {loading
              ? 'Translating...'
              : showTranslation
                ? 'Show original'
                : error
                  ? 'Retry translation'
                  : decision.recommendTranslation
                    ? 'See translation'
                    : 'Translate'}
          </button>
          {(() => {
            const status = String(post?.languageDetectionStatus || '').toLowerCase();
            const label = formatLanguageLabel(post?.sourceLanguage || '');
            if (status === 'no_linguistic_content') return null;
            if (!label && (status === 'detection_failed' || status === 'low_confidence' || !post?.sourceLanguage)) {
              return (
                <>
                  <span className="text-slate-400">&middot;</span>
                  <span className="text-slate-500">Language unresolved</span>
                </>
              );
            }
            if (!label) return null;
            return (
              <>
                <span className="text-slate-400">&middot;</span>
                <span className="text-slate-500" dir="auto">
                  {showTranslation && translation
                    ? `Translated from ${formatLanguageLabel(translation.sourceLanguage || post?.sourceLanguage)}`
                    : post?.isMixedLanguage
                      ? `Mixed languages · primary ${label}`
                      : `Post language: ${label}`}
                </span>
              </>
            );
          })()}
          {error ? <span className="text-rose-600">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

export default TranslatablePostText;
