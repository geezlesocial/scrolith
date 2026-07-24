import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, SendIcon as Send, XIcon as X } from '../../../components/icons/ShellIcons';
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { CommunityService } from '../../../services/community';
import { useNotification } from '../../../context/NotificationContext';
import { useUser } from '../../../context/UserContext';
import type { UploadedFile } from '../../../types';
import MentionHashtagTextarea from '../../../community/components/MentionHashtagTextarea';
import { AIService, type PostEnhanceMode } from '../../../services/ai/ai.service';
import { FileService } from '../../../services/files';
import { Camera, Download, Loader2, Paperclip } from 'lucide-react';
import { downloadToDevice } from '../../../utils/deviceDownload';
import { getRecoverableActionMessage } from '../../../mobile/runtime/requestRecovery';
import {
  postAiInsightPreferenceToBoolean,
  resolvePostAiInsightPreference,
  resolveStoredPostAiInsightPreference,
  type PostAiInsightPreference
} from '../../../utils/postAiControls';
import { MOBILE_MODAL_CARD_CLASS, MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';
import {
  canPublishWithAttachments,
  COMPOSER_UPLOAD_ACCEPT,
  COMPOSER_UPLOAD_MAX_RETRIES,
  createLocalAttachment,
  generateLocalVideoPoster,
  revokeAttachmentPreviews,
  validateComposerFile,
  type ComposerAttachmentPreview
} from '../../../components/composer/composerAttachments';
import ComposerMediaPreviewGrid from '../../../components/composer/ComposerMediaPreviewGrid';
import AIComposerAssist from '../../../components/ai/AIComposerAssist';

const postAiActions: Array<{ mode: PostEnhanceMode; label: string }> = [
  { mode: 'grammar', label: 'Improve Grammar' },
  { mode: 'rephrase', label: 'Rephrase' },
  { mode: 'professional', label: 'Make Professional' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'expand', label: 'Expand' }
];

export default function MobilePostScreen({
  mobileLayout,
  onClose
}: {
  mobileLayout?: any;
  onClose?: () => void;
} = {}) {
  const ctx = useOutletContext<any>();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();
  const { user } = useUser();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<ComposerAttachmentPreview[]>([]);
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const mediaCountRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRunningMode, setAiRunningMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiSuggestionMode, setAiSuggestionMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [aiSuggestionWarning, setAiSuggestionWarning] = useState<string | null>(null);
  const [aiOriginalText, setAiOriginalText] = useState('');
  const [aiCompareView, setAiCompareView] = useState<'compare' | 'ai'>('compare');
  const [statusMessage, setStatusMessage] = useState('');

  const layout = mobileLayout ?? ctx?.mobileLayout ?? null;
  const composer = (layout?.postComposer || layout?.post_composer || {}) as Record<string, any>;
  const postCard = (layout?.postCard || layout?.post_card || {}) as Record<string, any>;
  const mentionsEnabled = postCard.mentionsEnabled !== false;
  const hashtagsEnabled = postCard.hashtagsEnabled !== false;
  const visibilityEnabled = composer.visibilityEnabled !== false;
  const allowedVisibilities = useMemo(() => {
    const raw = composer.allowedVisibilities || composer.allowed_visibilities;
    const list = Array.isArray(raw)
      ? raw.map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const fallback = ['public', 'network', 'friends', 'private'];
    return Array.from(new Set((list.length ? list : fallback).filter(Boolean)));
  }, [composer.allowedVisibilities, composer.allowed_visibilities]);
  const defaultVisibility = String(composer.defaultVisibility || composer.default_visibility || 'public')
    .trim()
    .toLowerCase();
  const graphicWarningEnabled = composer.graphicWarningEnabled !== false;
  const graphicWarningLabel = String(
    composer.graphicWarningLabel || composer.graphic_warning_label || 'Graphic warning'
  ).trim();

  const [visibility, setVisibility] = useState<string>(defaultVisibility);
  const [graphicWarning, setGraphicWarning] = useState(false);
  const [isAIEnhanced, setIsAIEnhanced] = useState(false);
  const [aiInsightPreference, setAiInsightPreference] = useState<PostAiInsightPreference>('auto');
  const [topic, setTopic] = useState('');
  const [place, setPlace] = useState('');

  const closeComposer = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    navigate('/m/home');
  }, [navigate, onClose]);

  const suggestedTopics = useMemo(() => {
    const raw = composer.topics || composer.topicList || composer.topic_list;
    const list = Array.isArray(raw) ? raw : [];
    return Array.from(new Set(list.map((t: any) => String(t || '').trim()).filter(Boolean)));
  }, [composer.topics, composer.topicList, composer.topic_list]);

  const suggestedLocations = useMemo(() => {
    const raw = composer.locations || composer.locationList || composer.location_list;
    const list = Array.isArray(raw) ? raw : [];
    return Array.from(new Set(list.map((t: any) => String(t || '').trim()).filter(Boolean)));
  }, [composer.locations, composer.locationList, composer.location_list]);

  const editId = useMemo(() => String(searchParams.get('edit') || '').trim(), [searchParams]);
  const isEditing = Boolean(editId);
  const statePost = useMemo(() => {
    const st: any = routerLocation.state || {};
    return st?.post || st?.editingPost || null;
  }, [routerLocation.state]);

  useEffect(() => {
    setVisibility((prev) =>
      allowedVisibilities.includes(prev) ? prev : allowedVisibilities[0] || defaultVisibility || 'public'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedVisibilities.join('|'), defaultVisibility]);

  useEffect(() => {
    return () => {
      mediaRef.current.forEach((item) => revokeAttachmentPreviews(item));
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const uploadingCount = media.filter((m) => m.uploading).length;
  const canPost =
    (content.trim().length >= 1 || media.some((m) => m.id)) &&
    canPublishWithAttachments(media).ok;

  const attachmentIds = useMemo(
    () => Array.from(new Set(media.map((f) => String(f.id || '').trim()).filter(Boolean))),
    [media]
  );

  const updateMedia = useCallback((localId: string, patch: Partial<ComposerAttachmentPreview>) => {
    setMedia((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        return { ...item, ...patch };
      })
    );
  }, []);

  const removeAttachment = useCallback((localId: string) => {
    setMedia((prev) => {
      const target = prev.find((m) => m.localId === localId);
      if (target) revokeAttachmentPreviews(target);
      const next = prev.filter((m) => m.localId !== localId);
      mediaCountRef.current = next.length;
      return next;
    });
    setStatusMessage('Attachment removed.');
  }, []);

  const handleAttachmentDownload = useCallback(
    async (item: ComposerAttachmentPreview) => {
      const url = String(item?.url || item?.localPreviewUrl || '').trim();
      if (!url || url.startsWith('blob:')) {
        showNotification('warning', 'Download', 'Attachment is still uploading or URL is unavailable.');
        return;
      }
      try {
        const result = await downloadToDevice({
          url,
          fileName: item?.name,
          mimeType: String(item?.mimeType || '')
        });
        showNotification(
          'success',
          'Download',
          result.native ? `Saved to ${result.path || 'your device'}.` : 'Download started.'
        );
      } catch (error: any) {
        showNotification('error', 'Download', error?.message || 'Unable to download attachment.');
      }
    },
    [showNotification]
  );

  const uploadOneFile = useCallback(
    async (file: File, opts?: { existingLocalId?: string; retryCount?: number }) => {
      if (!user) {
        showNotification('warning', 'Attachments', 'Sign in to upload files.');
        return;
      }
      const existingLocalId = opts?.existingLocalId;
      const retryCount = opts?.retryCount ?? 0;

      if (!existingLocalId) {
        const validation = validateComposerFile(file, { currentCount: mediaCountRef.current });
        if (validation.ok === false) {
          showNotification('warning', 'Attachments', validation.reason);
          return;
        }
        mediaCountRef.current += 1;
        const localItem = createLocalAttachment(file, validation.kind);
        setMedia((prev) => [...prev, localItem]);
        if (validation.kind === 'video') {
          void generateLocalVideoPoster(file).then((poster) => {
            if (poster) updateMedia(localItem.localId, { localPosterUrl: poster, thumbnailUrl: poster });
          });
        }
        return uploadOneFile(file, { existingLocalId: localItem.localId, retryCount: 0 });
      }

      const localId = existingLocalId;
      updateMedia(localId, { uploading: true, progress: 0, error: undefined, retryCount, file });
      setStatusMessage(
        retryCount > 0 ? `Retrying ${file.name}…` : `Uploading ${file.name}…`
      );

      try {
        const uploaded = await FileService.uploadFile(file, 'community' as any, {
          role: user?.role,
          visibility: visibility === 'private' ? 'private' : 'public',
          userId: user?.id,
          onProgress: (percent: number) => {
            updateMedia(localId, { progress: percent, uploading: true });
            setStatusMessage(`Uploading ${file.name}: ${percent}%`);
          },
          onRetry: (attempt: number) => {
            setStatusMessage(`Retrying ${file.name} after network issue (${attempt})…`);
          }
        });
        const remoteUrl = String(uploaded.url || '').trim();
        updateMedia(localId, {
          id: String(uploaded.id || ''),
          ...(remoteUrl ? { url: remoteUrl } : {}),
          type:
            uploaded.type === 'video'
              ? 'video'
              : uploaded.type === 'image'
                ? 'image'
                : 'document',
          mimeType: uploaded.mimeType || uploaded.mime_type,
          thumbnailUrl: uploaded.thumbnailUrl || uploaded.thumbnail_url,
          duration: uploaded.duration,
          uploading: false,
          progress: 100,
          error: undefined,
          file: undefined
        });
        setStatusMessage(`${file.name} ready.`);
      } catch (error: any) {
        const message = getRecoverableActionMessage('Attachment upload', error);
        if (retryCount < COMPOSER_UPLOAD_MAX_RETRIES) {
          window.setTimeout(() => {
            void uploadOneFile(file, { existingLocalId: localId, retryCount: retryCount + 1 });
          }, 450 * (retryCount + 1));
          return;
        }
        updateMedia(localId, { uploading: false, error: message, progress: 0 });
        setStatusMessage(`${file.name} failed.`);
        showNotification('error', 'Attachments', message);
      }
    },
    [showNotification, updateMedia, user, visibility]
  );

  const retryAttachment = useCallback(
    (localId: string) => {
      const item = mediaRef.current.find((m) => m.localId === localId);
      if (!item?.file) {
        showNotification('warning', 'Attachments', 'Original file is no longer available. Please re-add it.');
        return;
      }
      void uploadOneFile(item.file, {
        existingLocalId: localId,
        retryCount: Number(item.retryCount || 0)
      });
    },
    [showNotification, uploadOneFile]
  );

  const handleInputFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.currentTarget.value = '';
      files.forEach((file) => {
        void uploadOneFile(file);
      });
    },
    [uploadOneFile]
  );

  const applyPostToDraft = (post: any) => {
    setContent(String(post?.content || '').trimStart());
    setVisibility(String(post?.visibility || defaultVisibility || 'public').toLowerCase());
    setGraphicWarning(Boolean(post?.graphicWarning ?? post?.graphic_warning ?? false));
    setIsAIEnhanced(Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false));
    setAiInsightPreference(
      resolveStoredPostAiInsightPreference(post?.aiInsightEnabled ?? post?.ai_insight_enabled)
    );
    setTopic(String(post?.topic || '').trim());
    setPlace(String(post?.location || '').trim());

    const postAttachments = Array.isArray(post?.attachments) ? post.attachments : [];
    const normalized: ComposerAttachmentPreview[] = postAttachments
      .map((att: any) => {
        const id = String(att?.id || '').trim();
        if (!id) return null;
        const url = String(att?.url || att?.downloadUrl || att?.download_url || '').trim();
        const name = String(att?.name || att?.originalName || att?.original_name || url || 'Attachment').trim();
        const mimeType = String(att?.mimeType || att?.mime_type || '').trim();
        const typeRaw = String(att?.type || '').trim().toLowerCase();
        const type =
          typeRaw === 'video' || mimeType.startsWith('video/')
            ? 'video'
            : typeRaw === 'image' || mimeType.startsWith('image/')
              ? 'image'
              : 'document';
        return {
          localId: `existing-${id}`,
          id,
          url,
          name,
          type,
          mimeType,
          size: Number(att?.size || 0) || 0,
          uploading: false,
          progress: 100
        } as ComposerAttachmentPreview;
      })
      .filter(Boolean) as ComposerAttachmentPreview[];

    mediaRef.current.forEach((item) => revokeAttachmentPreviews(item));
    mediaCountRef.current = normalized.length;
    setMedia(normalized);
  };

  useEffect(() => {
    if (!isEditing) return;

    const fromState = statePost && String(statePost?.id || '').trim() === editId ? statePost : null;
    if (fromState) {
      applyPostToDraft(fromState);
      return;
    }

    let cancelled = false;
    setLoadingPost(true);
    CommunityService.getPostById(editId)
      .then((post) => {
        if (cancelled) return;
        if (!post) return;
        applyPostToDraft(post);
      })
      .catch((e: any) => {
        if (cancelled) return;
        showNotification(
          'error',
          'Edit post',
          e?.response?.data?.error || e?.message || 'Unable to load post for editing.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingPost(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isEditing]);

  const closeAiSuggestionModal = () => {
    setAiSuggestionOpen(false);
    setAiSuggestion('');
    setAiSuggestionMode(null);
    setAiSuggestionWarning(null);
    setAiOriginalText('');
    setAiCompareView('compare');
  };

  const runPostAi = async (mode: PostEnhanceMode) => {
    const text = String(content || '').trim();
    if (!text) {
      showNotification('warning', 'Scrolitha', 'Write some text first, then run Scrolitha enhancement.');
      return;
    }
    if (aiLoading || busy) return;

    setAiLoading(true);
    setAiRunningMode(mode);
    try {
      const result = await AIService.enhancePostDraft({ text, mode });
      const enhancedText = String(result?.enhancedText || '').trim();
      if (!enhancedText) {
        showNotification('warning', 'Scrolitha', 'No suggestion was returned. Please try again.');
        return;
      }
      setAiOriginalText(content);
      setAiSuggestion(enhancedText);
      setAiSuggestionMode(mode);
      setAiCompareView('compare');
      if (result.fallbackUsed || result.usedFallback || result.warning) {
        setAiSuggestionWarning(
          result.warning ||
            'Scrolitha used backup processing for this suggestion. Please review before applying.'
        );
      } else {
        setAiSuggestionWarning(null);
      }
      setAiSuggestionOpen(true);
    } catch (error: any) {
      showNotification(
        'error',
        'Scrolitha',
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Unable to enhance text right now.'
      );
    } finally {
      setAiLoading(false);
      setAiRunningMode(null);
    }
  };

  const applyAiSuggestionReplace = () => {
    if (!aiSuggestion) return;
    setContent(aiSuggestion);
    setIsAIEnhanced(true);
    closeAiSuggestionModal();
  };

  const applyAiSuggestionInsert = () => {
    if (!aiSuggestion) return;
    const base = String(content || '').trim();
    setContent(base ? `${base}\n\n${aiSuggestion}` : aiSuggestion);
    setIsAIEnhanced(true);
    closeAiSuggestionModal();
  };

  const submit = async () => {
    if (!canPost || busy) return;
    const attachGate = canPublishWithAttachments(media);
    if (!attachGate.ok) {
      showNotification('warning', 'Attachments', attachGate.reason);
      return;
    }
    setBusy(true);
    try {
      if (isEditing) {
        const updated = await CommunityService.updatePost(editId, {
          content: content.trim(),
          attachmentFileIds: attachmentIds,
          attachments: attachmentIds,
          visibility: visibilityEnabled ? visibility : defaultVisibility,
          graphicWarning: graphicWarningEnabled ? graphicWarning : false,
          isAIEnhanced,
          aiInsightEnabled: postAiInsightPreferenceToBoolean(
            resolvePostAiInsightPreference(aiInsightPreference, 'off')
          ),
          topic: topic.trim() || undefined,
          location: place.trim() || undefined
        } as any);

        window.dispatchEvent(new CustomEvent('community:post_updated', { detail: { post: updated } }));

        showNotification('success', 'Saved', 'Post updated.');
        closeComposer();
        return;
      }

      const created = await CommunityService.createPost({
        content: content.trim(),
        attachmentFileIds: attachmentIds,
        attachments: attachmentIds,
        visibility: visibilityEnabled ? visibility : defaultVisibility,
        graphicWarning: graphicWarningEnabled ? graphicWarning : false,
        isAIEnhanced,
        aiInsightEnabled: postAiInsightPreferenceToBoolean(aiInsightPreference),
        topic: topic.trim() || undefined,
        location: place.trim() || undefined
      } as any);

      window.dispatchEvent(new CustomEvent('community:post_created', { detail: { post: created } }));

      media.forEach((item) => revokeAttachmentPreviews(item));
      mediaCountRef.current = 0;
      setContent('');
      setMedia([]);
      setGraphicWarning(false);
      setIsAIEnhanced(false);
      setAiInsightPreference('auto');
      setTopic('');
      setPlace('');
      setStatusMessage('');
      showNotification('success', 'Posted', 'Your update is live.');
      if (onClose) closeComposer();
    } catch (e: any) {
      showNotification(
        'error',
        isEditing ? 'Save failed' : 'Post failed',
        getRecoverableActionMessage(isEditing ? 'Post update' : 'Post publish', e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">{isEditing ? 'Edit post' : 'Create post'}</div>
          {isEditing ? (
            <button
              type="button"
              onClick={closeComposer}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
              disabled={busy || loadingPost}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {(visibilityEnabled || graphicWarningEnabled) ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {visibilityEnabled ? (
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <span className="text-slate-500">Visibility</span>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(String(e.target.value || 'public'))}
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none"
                >
                  {allowedVisibilities.map((v) => (
                    <option key={v} value={v}>
                      {v === 'public'
                        ? 'Public'
                        : v === 'network'
                          ? 'Network'
                          : v === 'friends'
                            ? 'Friends'
                            : v === 'private'
                              ? 'Only me'
                              : v.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {graphicWarningEnabled ? (
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={graphicWarning}
                  onChange={(e) => setGraphicWarning(e.target.checked)}
                />
                <span>{graphicWarningLabel}</span>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={isAIEnhanced}
              onChange={(e) => setIsAIEnhanced(e.target.checked)}
              disabled={busy || loadingPost}
            />
            <span>Mark as AI-enhanced</span>
          </label>
          <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            <span className="text-slate-500">Scrolitha AI insight</span>
            <select
              value={aiInsightPreference}
              onChange={(e) =>
                setAiInsightPreference(
                  resolvePostAiInsightPreference(e.target.value, isEditing ? 'off' : 'auto')
                )
              }
              className="mt-1 w-full bg-transparent text-xs font-semibold text-slate-900 outline-none"
              disabled={busy || loadingPost}
            >
              {isEditing ? null : <option value="auto">Automatic</option>}
              <option value="on">Generate for this post</option>
              <option value="off">Do not generate</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {isEditing
            ? 'This setting updates whether Scrolitha keeps AI insight on this post.'
            : 'Automatic preserves your current Scrolitha insight settings for new posts.'}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">Topic</div>
            <input
              value={topic}
              onChange={(e) => setTopic(String(e.target.value || ''))}
              list="mobile_post_topics"
              placeholder="Select or type"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
              disabled={busy || loadingPost}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">Location</div>
            <input
              value={place}
              onChange={(e) => setPlace(String(e.target.value || ''))}
              list="mobile_post_locations"
              placeholder="Region / country / city"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
              disabled={busy || loadingPost}
            />
          </div>
        </div>

        <div className="mt-3">
          <MentionHashtagTextarea
            value={content}
            onChange={(nextValue) => setContent(nextValue)}
            placeholder="Share an update with your network..."
            mentionsEnabled={mentionsEnabled}
            hashtagsEnabled={hashtagsEnabled}
            disabled={busy || loadingPost}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          />
          <div className="mt-2 text-[11px] text-slate-500">
            {hashtagsEnabled ? '#tags' : '#tags (disabled)'} and{' '}
            {mentionsEnabled ? '@mentions' : '@mentions (disabled)'} supported
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              {postAiActions.map((action) => (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => void runPostAi(action.mode)}
                  disabled={aiLoading || busy || loadingPost}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
                >
                  {aiRunningMode === action.mode && aiLoading ? 'Working...' : action.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <AIComposerAssist
                value={content}
                surface="post-mobile"
                compact
                disabled={busy || loadingPost || aiLoading}
                onApplyDraft={(draft, meta) => {
                  if (meta?.replace === false) {
                    const base = String(content || '').trim();
                    setContent(base ? `${base}\n\n${draft}` : draft);
                  } else {
                    setContent(draft);
                  }
                  setIsAIEnhanced(true);
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              AI drafts never auto-post. Review every suggestion before applying.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <ComposerMediaPreviewGrid
            media={media}
            onRemove={removeAttachment}
            onRetry={retryAttachment}
            onOpenPreview={(item) => {
              if (item.id && item.url && !String(item.url).startsWith('blob:')) {
                void handleAttachmentDownload(item);
              }
            }}
            emptyLabel="Add photos, videos, or files — previews appear while uploading."
          />
        </div>

        {uploadingCount > 0 || statusMessage ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            {uploadingCount > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            <span className="sr-only" role="status" aria-live="polite">
              {statusMessage}
            </span>
            <span>{statusMessage || `Uploading ${uploadingCount} attachment(s)…`}</span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={COMPOSER_UPLOAD_ACCEPT}
            className="hidden"
            onChange={handleInputFiles}
          />
          <input
            ref={mediaInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={handleInputFiles}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={handleInputFiles}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={busy || loadingPost}
            >
              <Paperclip className="h-4 w-4" />
              Files
            </button>
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={busy || loadingPost}
            >
              <ImageIcon className="h-4 w-4" />
              Photos & Videos
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={busy || loadingPost}
            >
              <Camera className="h-4 w-4" />
              Camera
            </button>
          </div>

          <button
            type="button"
            disabled={!canPost || busy || loadingPost}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {busy ? (isEditing ? 'Saving...' : 'Posting...') : isEditing ? 'Save' : 'Post'}
          </button>
        </div>
      </div>

      <datalist id="mobile_post_topics">
        {suggestedTopics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="mobile_post_locations">
        {suggestedLocations.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {aiSuggestionOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3">
          <div className={MOBILE_MODAL_CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">AI Draft Suggestion</h3>
                <p className="text-[11px] text-slate-500">
                  {aiSuggestionMode
                    ? `Mode: ${
                        postAiActions.find((entry) => entry.mode === aiSuggestionMode)?.label ||
                        aiSuggestionMode
                      }`
                    : 'Review before applying'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAiSuggestionModal}
                className="rounded-full border border-slate-200 p-1 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAiCompareView('compare')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  aiCompareView === 'compare'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-700'
                }`}
              >
                Compare
              </button>
              <button
                type="button"
                onClick={() => setAiCompareView('ai')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  aiCompareView === 'ai' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'
                }`}
              >
                AI only
              </button>
            </div>

            {aiSuggestionWarning ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {aiSuggestionWarning}
              </p>
            ) : null}

            <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto">
              {aiCompareView === 'compare' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Original
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{aiOriginalText}</p>
                </div>
              ) : null}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                  AI suggestion
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{aiSuggestion}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAiSuggestionModal}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionInsert}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Insert below
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionReplace}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Replace text
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
