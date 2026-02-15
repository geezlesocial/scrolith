import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Send, X } from 'lucide-react';
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { CommunityService } from '../../../services/community';
import { useNotification } from '../../../context/NotificationContext';
import { UploadedFile } from '../../../types';
import FilePickerModal from '../../../dashboard/shared/FilePickerModal';

const getMimeType = (file: any) =>
  String(file?.mime_type || file?.mimeType || file?.mimetype || file?.mime || '').toLowerCase();
const getFileType = (file: any) => String(file?.type || '').toLowerCase();
const isVideo = (file: any) => getFileType(file) === 'video' || getMimeType(file).startsWith('video/');
const isImage = (file: any) => getFileType(file) === 'image' || getMimeType(file).startsWith('image/');

export default function MobilePostScreen() {
  const ctx = useOutletContext<any>();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);

  const layout = ctx?.mobileLayout ?? null;
  const composer = (layout?.postComposer || layout?.post_composer || {}) as Record<string, any>;
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
  const [topic, setTopic] = useState('');
  const [place, setPlace] = useState('');

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

  const canPost = content.trim().length >= 1 || attachments.length > 0;

  const attachmentIds = useMemo(
    () => Array.from(new Set(attachments.map((f) => String(f.id || '').trim()).filter(Boolean))),
    [attachments]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((f) => String(f.id) !== String(id)));
  };

  const applyPostToDraft = (post: any) => {
    setContent(String(post?.content || '').trimStart());
    setVisibility(String(post?.visibility || defaultVisibility || 'public').toLowerCase());
    setGraphicWarning(Boolean(post?.graphicWarning ?? post?.graphic_warning ?? false));
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

  const submit = async () => {
    if (!canPost || busy) return;
    setBusy(true);
    try {
      if (isEditing) {
        const updated = await CommunityService.updatePost(editId, {
          content: content.trim(),
          attachmentFileIds: attachmentIds,
          attachments: attachmentIds,
          visibility: visibilityEnabled ? visibility : defaultVisibility,
          graphicWarning: graphicWarningEnabled ? graphicWarning : false,
          topic: topic.trim() || undefined,
          location: place.trim() || undefined
        } as any);

        // Ensure immediate local refresh even if realtime is delayed.
        window.dispatchEvent(new CustomEvent('community:post_updated', { detail: { post: updated } }));

        showNotification('success', 'Saved', 'Post updated.');
        navigate('/m/home');
        return;
      }

      const created = await CommunityService.createPost({
        content: content.trim(),
        attachmentFileIds: attachmentIds,
        attachments: attachmentIds,
        visibility: visibilityEnabled ? visibility : defaultVisibility,
        graphicWarning: graphicWarningEnabled ? graphicWarning : false,
        topic: topic.trim() || undefined,
        location: place.trim() || undefined
      } as any);

      window.dispatchEvent(new CustomEvent('community:post_created', { detail: { post: created } }));

      setContent('');
      setAttachments([]);
      setGraphicWarning(false);
      setTopic('');
      setPlace('');
      showNotification('success', 'Posted', 'Your update is live.');
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
              onClick={() => navigate('/m/home')}
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

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share an update with your network..."
          className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
          rows={5}
          disabled={busy || loadingPost}
        />

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
                {isVideo(file) ? (
                  <video src={file.url} className="h-44 w-full object-cover" controls preload="metadata" />
                ) : isImage(file) ? (
                  <img src={file.url} alt={file.name} className="h-44 w-full object-cover" />
                ) : (
                  <a href={file.url} className="block p-4 text-sm font-semibold text-slate-700 hover:underline">
                    {file.name}
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={busy || loadingPost}
          >
            <ImageIcon className="h-4 w-4" />
            Attach
          </button>

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
        {suggestedTopics.slice(0, 500).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="mobile_post_locations">
        {suggestedLocations.slice(0, 500).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <FilePickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filterType="all"
        allowUpload
        allowCamera
        onSelect={(file) => {
          setAttachments((prev) => {
            if (prev.some((x) => String(x.id) === String(file.id))) return prev;
            return [...prev, file];
          });
          setPickerOpen(false);
        }}
        title="Attach files"
      />
    </div>
  );
}
