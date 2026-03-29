import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, SendIcon as Send, XIcon as X } from '../../../components/icons/ShellIcons';
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { CommunityService } from '../../../services/community';
import { useNotification } from '../../../context/NotificationContext';
import { useUser } from '../../../context/UserContext';
import { UploadedFile } from '../../../types';
import MentionHashtagTextarea from '../../../community/components/MentionHashtagTextarea';
import { AIService, type PostEnhanceMode } from '../../../services/ai/ai.service';
import { FileService } from '../../../services/files';
import { Camera, Download, Loader2, Paperclip } from 'lucide-react';
import { downloadToDevice } from '../../../utils/deviceDownload';
import {
  postAiInsightPreferenceToBoolean,
  resolvePostAiInsightPreference,
  resolveStoredPostAiInsightPreference,
  type PostAiInsightPreference
} from '../../../utils/postAiControls';

const getMimeType = (file: any) =>
  String(file?.mime_type || file?.mimeType || file?.mimetype || file?.mime || '').toLowerCase();
const getFileType = (file: any) => String(file?.type || '').toLowerCase();
const isVideo = (file: any) => getFileType(file) === 'video' || getMimeType(file).startsWith('video/');
const isImage = (file: any) => getFileType(file) === 'image' || getMimeType(file).startsWith('image/');
const POST_UPLOAD_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar';

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
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingAttachmentCount, setUploadingAttachmentCount] = useState(0);
  const [uploadingAttachmentLabel, setUploadingAttachmentLabel] = useState('');
  const [loadingPost, setLoadingPost] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRunningMode, setAiRunningMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiSuggestionMode, setAiSuggestionMode] = useState<PostEnhanceMode | null>(null);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [aiOriginalText, setAiOriginalText] = useState('');
  const [aiCompareView, setAiCompareView] = useState<'compare' | 'ai'>('compare');

  const layout = mobileLayout ?? ctx?.mobileLayout ?? null;
  const composer = (layout?.postComposer || layout?.post_composer || {}) as Record<string, any>;
  const postCard = (layout?.postCard || layout?.post_card || {}) as Record<string, any>;
  const mentionsEnabled = postCard.mentionsEnabled !== false;
  const hashtagsEnabled = postCard.hashtagsEnabled !== false;
  const visibilityEnabled = composer.visibilityEnabled !== false;
  const allowedVisibilities = useMemo(() => {
    const raw = composer.allowedVisibilities || composer.allowed_visibilities;
    const list = Array.isArray(raw) ? raw.map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean) : [];
    const fallback = ['public', 'network', 'friends', 'private'];
    const merged = Array.from(new Set((list.length ? list : fallback).filter(Boolean)));
    return merged;
  }, [composer.allowedVisibilities, composer.allowed_visibilities]);
  const defaultVisibility = String(composer.defaultVisibility || composer.default_visibility || 'public')
    .trim()
    .toLowerCase();
  const graphicWarningEnabled = composer.graphicWarningEnabled !== false;
  const graphicWarningLabel = String(composer.graphicWarningLabel || composer.graphic_warning_label || 'Graphic warning').trim();

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
    // Keep composer defaults in sync if admin changes settings while user is on this screen.
    setVisibility((prev) => (allowedVisibilities.includes(prev) ? prev : (allowedVisibilities[0] || defaultVisibility || 'public')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedVisibilities.join('|'), defaultVisibility]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const canPost = (content.trim().length >= 1 || attachments.length > 0) && uploadingAttachmentCount === 0;

  const attachmentIds = useMemo(
    () => Array.from(new Set(attachments.map((f) => String(f.id || '').trim()).filter(Boolean))),
    [attachments]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((f) => String(f.id) !== String(id)));
  };

  const handleAttachmentDownload = useCallback(
    async (file: UploadedFile) => {
      const url = String(file?.url || '').trim();
      if (!url) {
        showNotification('warning', 'Download', 'Attachment URL is not available.');
        return;
      }
      try {
        const result = await downloadToDevice({
          url,
          fileName: file?.name,
          mimeType: String(file?.mimeType || file?.mime_type || '')
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

  const appendAttachment = useCallback((file: UploadedFile) => {
    setAttachments((prev) => {
      if (prev.some((entry) => String(entry.id) === String(file.id))) return prev;
      return [...prev, file];
    });
  }, []);

  const uploadFilesFromDevice = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploadingAttachmentCount(files.length);
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setUploadingAttachmentLabel(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
          const uploaded = await FileService.uploadFile(file, 'community' as any, {
            role: user?.role,
            visibility: visibility === 'private' ? 'private' : 'public',
            userId: user?.id
          });
          appendAttachment(uploaded);
        }
      } catch (error: any) {
        showNotification(
          'error',
          'Attachments',
          error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to upload attachment.'
        );
      } finally {
        setUploadingAttachmentCount(0);
        setUploadingAttachmentLabel('');
      }
    },
    [appendAttachment, showNotification, user?.id, user?.role, visibility]
  );

  const handleInputFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.currentTarget.value = '';
      void uploadFilesFromDevice(files);
    },
    [uploadFilesFromDevice]
  );

  const applyPostToDraft = (post: any) => {
    setContent(String(post?.content || '').trimStart());
    setVisibility(String(post?.visibility || defaultVisibility || 'public').toLowerCase());
    setGraphicWarning(Boolean(post?.graphicWarning ?? post?.graphic_warning ?? false));
    setIsAIEnhanced(Boolean(post?.isAIEnhanced ?? post?.is_ai_enhanced ?? false));
    setAiInsightPreference(resolveStoredPostAiInsightPreference(post?.aiInsightEnabled ?? post?.ai_insight_enabled));
    setTopic(String(post?.topic || '').trim());
    setPlace(String(post?.location || '').trim());

    const postAttachments = Array.isArray(post?.attachments) ? post.attachments : [];
    const normalized: UploadedFile[] = postAttachments
      .map((att: any) => {
        const id = String(att?.id || '').trim();
        if (!id) return null;
        const url = String(att?.url || att?.downloadUrl || att?.download_url || '').trim();
        const name = String(att?.name || att?.originalName || att?.original_name || url || 'Attachment').trim();
        const mimeType = String(att?.mimeType || att?.mime_type || '').trim();
        const type = String(att?.type || '').trim() || (mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('image/') ? 'image' : 'file');
        return {
          id,
          user_id: String(post?.authorId || post?.authorUserId || post?.author_id || post?.userId || ''),
          name,
          type,
          size: Number(att?.size || 0) || 0,
          url,
          category: (att?.category || 'other') as any,
          created_at: String(att?.created_at || att?.createdAt || post?.createdAt || new Date().toISOString()),
          mime_type: mimeType,
          mimeType
        } as UploadedFile;
      })
      .filter(Boolean) as UploadedFile[];

    setAttachments(normalized);
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
    setAiOriginalText('');
    setAiCompareView('compare');
  };

  const runPostAi = async (mode: PostEnhanceMode) => {
    const text = String(content || '').trim();
    if (!text) {
      showNotification('warning', 'AI Assistant', 'Write some text first, then run AI enhancement.');
      return;
    }
    if (aiLoading || busy) return;

    setAiLoading(true);
    setAiRunningMode(mode);
    try {
      const result = await AIService.enhancePostDraft({ text, mode });
      const enhancedText = String(result?.enhancedText || '').trim();
      if (!enhancedText) {
        showNotification('warning', 'AI Assistant', 'No suggestion was returned. Please try again.');
        return;
      }
      setAiOriginalText(content);
      setAiSuggestion(enhancedText);
      setAiSuggestionMode(mode);
      setAiCompareView('compare');
      setAiSuggestionOpen(true);
    } catch (error: any) {
      showNotification(
        'error',
        'AI Assistant',
        error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Unable to enhance text right now.'
      );
    } finally {
      setAiLoading(false);
      setAiRunningMode(null);
    }
  };

  const applyAiSuggestionReplace = () => {
    if (!aiSuggestion) return;
    setContent(aiSuggestion);
    closeAiSuggestionModal();
  };

  const applyAiSuggestionInsert = () => {
    if (!aiSuggestion) return;
    const base = String(content || '').trim();
    setContent(base ? `${base}\n\n${aiSuggestion}` : aiSuggestion);
    closeAiSuggestionModal();
  };

  const submit = async () => {
    if (!canPost || busy) return;
    if (uploadingAttachmentCount > 0) {
      showNotification('warning', 'Attachments', 'Wait for attachment uploads to finish before posting.');
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
          aiInsightEnabled: postAiInsightPreferenceToBoolean(resolvePostAiInsightPreference(aiInsightPreference, 'off')),
          topic: topic.trim() || undefined,
          location: place.trim() || undefined
        } as any);

        // Ensure immediate local refresh even if realtime is delayed.
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

      setContent('');
      setAttachments([]);
      setGraphicWarning(false);
      setIsAIEnhanced(false);
      setAiInsightPreference('auto');
      setTopic('');
      setPlace('');
      showNotification('success', 'Posted', 'Your update is live.');
      if (onClose) closeComposer();
    } catch (e: any) {
      showNotification('error', isEditing ? 'Save failed' : 'Post failed', e?.response?.data?.error || e?.message || 'Unable to post right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-3 py-4">
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
                setAiInsightPreference(resolvePostAiInsightPreference(e.target.value, isEditing ? 'off' : 'auto'))
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
            {hashtagsEnabled ? '#tags' : '#tags (disabled)'} and {mentionsEnabled ? '@mentions' : '@mentions (disabled)'} supported
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
            <p className="mt-2 text-[11px] text-slate-500">When AI is used, content remains user-authored.</p>
          </div>
        </div>

        {attachments.length ? (
          <div className="mt-3 grid gap-2">
            {attachments.slice(0, 6).map((file) => (
              <div key={file.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1 text-slate-500 hover:text-slate-700"
                  aria-label="Remove attachment"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleAttachmentDownload(file)}
                  className="absolute left-2 top-2 z-10 rounded-full bg-white/90 p-1 text-slate-500 hover:text-slate-700"
                  aria-label="Download attachment"
                >
                  <Download className="h-4 w-4" />
                </button>
                {isVideo(file) ? (
                  <video src={file.url} className="h-44 w-full object-cover" controls preload="metadata" />
                ) : isImage(file) ? (
                  <img src={file.url} alt={file.name} className="h-44 w-full object-cover" />
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAttachmentDownload(file)}
                    className="block w-full p-4 text-left text-sm font-semibold text-slate-700 hover:underline"
                  >
                    {file.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {uploadingAttachmentCount > 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{uploadingAttachmentLabel || 'Uploading attachments...'}</span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={POST_UPLOAD_ACCEPT}
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
              disabled={busy || loadingPost || uploadingAttachmentCount > 0}
            >
              <Paperclip className="h-4 w-4" />
              Files
            </button>
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={busy || loadingPost || uploadingAttachmentCount > 0}
            >
              <ImageIcon className="h-4 w-4" />
              Photos & Videos
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={busy || loadingPost || uploadingAttachmentCount > 0}
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

      {aiSuggestionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">AI Draft Suggestion</h3>
                <p className="text-[11px] text-slate-500">
                  {aiSuggestionMode
                    ? `Mode: ${postAiActions.find((entry) => entry.mode === aiSuggestionMode)?.label || aiSuggestionMode}`
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
                  aiCompareView === 'compare' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'
                }`}
              >
                Compare version
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

            {aiCompareView === 'compare' ? (
              <div className="mt-3 grid gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Original</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{aiOriginalText || '(empty)'}</pre>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">AI Version</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{aiSuggestion || '(empty)'}</pre>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <pre className="whitespace-pre-wrap text-sm text-emerald-900">{aiSuggestion || '(empty)'}</pre>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAiSuggestionModal}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionInsert}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Insert Below
              </button>
              <button
                type="button"
                onClick={applyAiSuggestionReplace}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase text-white"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="mobile_post_topics">
        {suggestedTopics.slice(0, 500).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="mobile_post_locations">
        {suggestedLocations.slice(0, 500).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

    </div>
  );
}
