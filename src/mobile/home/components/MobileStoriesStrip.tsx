import React, { useEffect, useMemo, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Edit3, Eye, Image as ImageIcon, Loader2, MoreVertical, Plus, Trash2, Type, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../../../context/UserContext';
import { useNotification } from '../../../context/NotificationContext';
import { CommunityService } from '../../../services/community';
import { getDefaultStoryTextDraft, getStoryTextStyle, storyTextFonts, storyTextThemes } from '../../../community/storyStyles';
import { UploadedFile } from '../../../types';
import FilePickerModal from '../../../dashboard/shared/FilePickerModal';

type StoryKind = 'text' | 'image' | 'video';
type StoryVisibility = 'public' | 'private';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeVisibility = (value: any): StoryVisibility => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'private' ? 'private' : 'public';
};

const resolveStoryType = (story: any): StoryKind => {
  const raw = String(story?.type || '').trim().toLowerCase();
  if (raw === 'video') return 'video';
  if (raw === 'image') return 'image';
  return 'text';
};

const resolveStoryOwnerId = (story: any) =>
  String(story?.authorId || story?.userId || story?.user_id || story?.author?.id || '').trim();

const resolveStoryContent = (story: any) =>
  String(story?.content ?? story?.caption ?? story?.text ?? story?.storyText ?? story?.story_text ?? '').trim();

const isStoryActive = (story: any) => {
  if (!story?.expiresAt) return true;
  const expiresAt = new Date(story.expiresAt).getTime();
  return Number.isNaN(expiresAt) ? true : expiresAt > Date.now();
};

const resolveStoryMediaUrl = (story: any) => {
  const media = story?.media || story?.mediaFile || story?.file || null;
  const url = media?.url || media?.downloadUrl || media?.download_url || null;
  const thumb = media?.thumbnailUrl || media?.thumbnail_url || null;
  const type = String(story?.type || media?.type || '').toLowerCase();
  const mime = String(media?.mimeType || media?.mime_type || '').toLowerCase();
  const isVideo = type === 'video' || mime.startsWith('video/');
  if (isVideo) return { isVideo: true, url: url || thumb || null, thumbnailUrl: thumb || url || null };
  return { isVideo: false, url: url || thumb || null, thumbnailUrl: null };
};

const resolveStoryTypeFromFile = (file: UploadedFile): StoryKind | null => {
  const explicit = String(file?.type || '').toLowerCase();
  const mime = String(file?.mime_type || file?.mimeType || '').toLowerCase();
  if (explicit === 'video' || mime.startsWith('video/')) return 'video';
  if (explicit === 'image' || mime.startsWith('image/')) return 'image';
  return null;
};

const canManageStory = (story: any, user: any) => {
  if (!story || !user?.id) return false;
  const role = String(user?.role || '').toLowerCase();
  if (role.includes('admin') || role.includes('moderator')) return true;
  return resolveStoryOwnerId(story) === String(user.id);
};

const updateStoryList = (prev: any[], next: any, maxItems: number) => {
  const list = Array.isArray(prev) ? prev : [];
  if (!next?.id) return list;
  const out = list.some((s) => String(s?.id) === String(next.id))
    ? list.map((s) => (String(s?.id) === String(next.id) ? { ...s, ...next } : s))
    : [next, ...list];
  return out.filter(isStoryActive).slice(0, maxItems);
};

const removeStoryFromList = (prev: any[], storyId: string) => {
  const list = Array.isArray(prev) ? prev : [];
  return list.filter((s) => String(s?.id) !== String(storyId));
};

const Sheet = ({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-3"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const SheetItem = ({
  icon,
  label,
  danger,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold',
      danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-800 hover:bg-slate-50'
    ].join(' ')}
  >
    <div className={['rounded-xl p-2', danger ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'].join(' ')}>
      {icon}
    </div>
    <span>{label}</span>
  </button>
);

export default function MobileStoriesStrip({ settings }: { settings?: any }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { showNotification } = useNotification();

  const enabled = settings?.stories?.enabled !== false;
  const maxItems = clamp(Number(settings?.stories?.maxItems ?? 12) || 12, 4, 40);

  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<any | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStep, setComposerStep] = useState<'choose' | 'compose'>('choose');
  const [composerMode, setComposerMode] = useState<'create' | 'edit'>('create');
  const [editingStory, setEditingStory] = useState<any | null>(null);
  const [draftType, setDraftType] = useState<StoryKind | null>(null);
  const [draftVisibility, setDraftVisibility] = useState<StoryVisibility>('public');
  const [draftContent, setDraftContent] = useState('');
  const [draftMediaFile, setDraftMediaFile] = useState<UploadedFile | null>(null);
  const [draftTextStyle, setDraftTextStyle] = useState(() => getDefaultStoryTextDraft());
  const [publishing, setPublishing] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const visibleStories = useMemo(() => {
    const list = Array.isArray(stories) ? stories : [];
    return list.filter(isStoryActive).slice(0, maxItems);
  }, [stories, maxItems]);

  const resetDraft = () => {
    setComposerMode('create');
    setEditingStory(null);
    setDraftType(null);
    setDraftVisibility('public');
    setDraftContent('');
    setDraftMediaFile(null);
    setDraftTextStyle(getDefaultStoryTextDraft());
    setComposerStep('choose');
  };

  const openCreate = () => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    resetDraft();
    setComposerOpen(true);
  };

  const openEdit = (story: any) => {
    if (!story?.id || !canManageStory(story, user)) return;
    setComposerMode('edit');
    setEditingStory(story);
    const type = resolveStoryType(story);
    setDraftType(type);
    setDraftVisibility(normalizeVisibility(story?.visibility));
    setDraftContent(resolveStoryContent(story));
    if (type === 'text') {
      const style = getStoryTextStyle(story);
      setDraftTextStyle({
        textBackground: style.background,
        textColor: style.color,
        textFont: style.fontFamily,
        textAlign: (style.textAlign as any) || 'center'
      });
      setDraftMediaFile(null);
    } else {
      const media = story?.media || story?.mediaFile || story?.file || null;
      if (media?.id) {
        setDraftMediaFile({
          id: String(media.id),
          user_id: resolveStoryOwnerId(story) || String(user?.id || ''),
          name: String(media?.name || media?.originalName || media?.original_name || 'Story media'),
          type,
          size: Number(media?.size || 0) || 0,
          url: String(media?.url || media?.downloadUrl || media?.download_url || ''),
          category: (media?.category || 'other') as any,
          created_at: String(media?.created_at || media?.createdAt || story?.createdAt || new Date().toISOString()),
          mime_type: String(media?.mimeType || media?.mime_type || ''),
          mimeType: String(media?.mimeType || media?.mime_type || '')
        });
      } else {
        setDraftMediaFile(null);
      }
    }
    setComposerStep('compose');
    setComposerOpen(true);
  };

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    CommunityService.getStoriesFeed()
      .then((items) => {
        if (!mounted) return;
        setStories(Array.isArray(items) ? items.filter(isStoryActive).slice(0, maxItems) : []);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setError(e?.response?.data?.error || e?.message || 'Failed to load stories');
        setStories([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, maxItems]);

  // Realtime: socket layer forwards socket events as window CustomEvents.
  useEffect(() => {
    if (!enabled) return;
    const onCreated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const story = detail?.story || detail;
      if (!story?.id) return;
      setStories((prev) => updateStoryList(prev, story, maxItems));
    };
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const story = detail?.story || detail;
      if (!story?.id) return;
      setStories((prev) => updateStoryList(prev, story, maxItems));
      setActiveStory((current) => (current?.id === story.id ? { ...current, ...story } : current));
    };
    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const storyId = String(detail?.storyId || detail?.id || '').trim();
      if (!storyId) return;
      setStories((prev) => removeStoryFromList(prev, storyId));
      setActiveStory((current) => (String(current?.id) === storyId ? null : current));
    };
    window.addEventListener('community:story_created', onCreated as EventListener);
    window.addEventListener('community:story_updated', onUpdated as EventListener);
    window.addEventListener('community:story_deleted', onDeleted as EventListener);
    return () => {
      window.removeEventListener('community:story_created', onCreated as EventListener);
      window.removeEventListener('community:story_updated', onUpdated as EventListener);
      window.removeEventListener('community:story_deleted', onDeleted as EventListener);
    };
  }, [enabled, maxItems]);

  const canPublish = (() => {
    if (draftType === 'text') return draftContent.trim().length > 0;
    if (draftType === 'image' || draftType === 'video') return Boolean(draftMediaFile?.id);
    return false;
  })();

  const publish = async () => {
    if (!draftType || !canPublish || publishing) return;
    if (!user?.id) return;

    setPublishing(true);
    try {
      if (composerMode === 'edit' && editingStory?.id) {
        const payload: any = { visibility: draftVisibility };
        if (draftType === 'text') {
          payload.content = draftContent.trim();
          payload.textBackground = draftTextStyle.textBackground;
          payload.textColor = draftTextStyle.textColor;
          payload.textFont = draftTextStyle.textFont;
          payload.textAlign = draftTextStyle.textAlign;
        } else {
          payload.caption = draftContent.trim() || undefined;
          const currentMediaId = String(editingStory?.mediaFileId || editingStory?.media_file_id || editingStory?.media?.id || '');
          const nextMediaId = String(draftMediaFile?.id || '');
          if (nextMediaId && nextMediaId !== currentMediaId) payload.mediaFileId = nextMediaId;
        }
        const updated = await CommunityService.updateStory(editingStory.id, payload);
        window.dispatchEvent(new CustomEvent('community:story_updated', { detail: { story: updated } }));
        showNotification('success', 'Story', 'Story updated.');
        setComposerOpen(false);
        resetDraft();
        setActiveStory((current) => (current?.id === updated?.id ? { ...current, ...updated } : current));
        return;
      }

      if (draftType === 'text') {
        const created = await CommunityService.createStory({
          type: 'text',
          content: draftContent.trim(),
          visibility: draftVisibility,
          textBackground: draftTextStyle.textBackground,
          textColor: draftTextStyle.textColor,
          textFont: draftTextStyle.textFont,
          textAlign: draftTextStyle.textAlign
        });
        window.dispatchEvent(new CustomEvent('community:story_created', { detail: { story: created } }));
        setStories((prev) => updateStoryList(prev, created, maxItems));
        setActiveStory(created);
        showNotification('success', 'Story', 'Your story is live.');
      } else {
        if (!draftMediaFile?.id) throw new Error('Select a media file first.');
        const created = await CommunityService.createStory({
          type: draftType,
          mediaFileId: draftMediaFile.id,
          caption: draftContent.trim() || undefined,
          visibility: draftVisibility
        });
        window.dispatchEvent(new CustomEvent('community:story_created', { detail: { story: created } }));
        setStories((prev) => updateStoryList(prev, created, maxItems));
        setActiveStory(created);
        showNotification('success', 'Story', 'Your story is live.');
      }

      setComposerOpen(false);
      resetDraft();
    } catch (e: any) {
      showNotification('error', 'Story failed', e?.response?.data?.error || e?.message || 'Unable to publish story.');
    } finally {
      setPublishing(false);
    }
  };

  const deleteStory = async (story: any) => {
    if (!story?.id || !canManageStory(story, user)) return;
    if (!confirm('Delete this story?')) return;
    try {
      await CommunityService.deleteStory(String(story.id));
      window.dispatchEvent(new CustomEvent('community:story_deleted', { detail: { storyId: story.id } }));
      setStories((prev) => removeStoryFromList(prev, String(story.id)));
      setActiveStory((current) => (String(current?.id) === String(story.id) ? null : current));
      showNotification('success', 'Story', 'Story deleted.');
    } catch (e: any) {
      showNotification('error', 'Story', e?.response?.data?.error || e?.message || 'Unable to delete story.');
    }
  };

  if (!enabled) return null;

  return (
    <>
      <div className="mx-auto max-w-md px-3 pt-3">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          <button
            type="button"
            onClick={openCreate}
            className="flex w-[74px] shrink-0 flex-col items-center gap-1.5"
            aria-label="Create story"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white">
              <Plus className="h-5 w-5 text-slate-600" />
            </div>
            <div className="w-full truncate text-center text-[11px] font-semibold text-slate-700">Your story</div>
          </button>

          {loading ? (
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          ) : visibleStories.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              No stories yet.
            </div>
          ) : (
            visibleStories.map((story) => {
              const id = String(story?.id || '').trim();
              const name = String(story?.authorName || story?.author?.name || 'Story').trim();
              const avatar = story?.authorAvatar || story?.author?.avatar || null;
              const media = resolveStoryMediaUrl(story);
              const fallbackLetter = (name[0] || 'S').toUpperCase();
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveStory(story);
                    if (id) CommunityService.viewStory(id).catch(() => {});
                  }}
                  className="flex w-[74px] shrink-0 flex-col items-center gap-1.5"
                  aria-label={`Open story by ${name}`}
                >
                  <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-blue-600 bg-slate-100">
                    {media.url ? (
                      media.isVideo ? (
                        <img src={media.thumbnailUrl || media.url} alt="Story" className="h-full w-full object-cover" />
                      ) : (
                        <img src={media.url} alt="Story" className="h-full w-full object-cover" />
                      )
                    ) : avatar ? (
                      <img src={avatar} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                        {fallbackLetter}
                      </div>
                    )}
                  </div>
                  <div className="w-full truncate text-center text-[11px] font-semibold text-slate-700">{name}</div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {activeStory ? (
        <StoryViewer
          story={activeStory}
          viewer={user}
          onClose={() => setActiveStory(null)}
          onEdit={() => openEdit(activeStory)}
          onDelete={() => void deleteStory(activeStory)}
        />
      ) : null}

      <Sheet
        open={composerOpen}
        title={composerMode === 'edit' ? 'Edit story' : 'Create story'}
        onClose={() => {
          if (publishing) return;
          setComposerOpen(false);
          resetDraft();
        }}
      >
        {composerStep === 'choose' ? (
          <div className="space-y-2">
            <SheetItem
              icon={<Type className="h-4 w-4" />}
              label="Text story"
              onClick={() => {
                setDraftType('text');
                setDraftContent('');
                setDraftVisibility('public');
                setDraftTextStyle(getDefaultStoryTextDraft());
                setComposerStep('compose');
              }}
            />
            <SheetItem
              icon={<ImageIcon className="h-4 w-4" />}
              label="Photo or video story"
              onClick={() => setMediaPickerOpen(true)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {composerMode !== 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (publishing) return;
                    resetDraft();
                    setComposerOpen(true);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  Back
                </button>
              ) : (
                <div className="text-xs font-semibold text-slate-500">Changes publish instantly.</div>
              )}

              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                <span className="text-slate-500">Visibility</span>
                <select
                  value={draftVisibility}
                  onChange={(e) => setDraftVisibility(normalizeVisibility(e.target.value))}
                  className="bg-transparent text-xs font-semibold text-slate-900 outline-none"
                  disabled={publishing}
                >
                  <option value="public">Public</option>
                  <option value="private">Only me</option>
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              {draftType === 'text' ? (
                <div
                  className="flex h-56 w-full items-center justify-center px-6 text-center text-base font-semibold"
                  style={{
                    background: draftTextStyle.textBackground,
                    color: draftTextStyle.textColor,
                    fontFamily: draftTextStyle.textFont,
                    textAlign: draftTextStyle.textAlign as any
                  }}
                >
                  <span className="whitespace-pre-wrap">
                    {draftContent.trim().length ? draftContent : 'Type your story...'}
                  </span>
                </div>
              ) : draftMediaFile?.url ? (
                draftType === 'video' ? (
                  <video src={draftMediaFile.url} className="h-56 w-full object-cover" controls preload="metadata" />
                ) : (
                  <img src={draftMediaFile.url} alt="Story" className="h-56 w-full object-cover" />
                )
              ) : (
                <div className="flex h-56 w-full items-center justify-center gap-2 text-sm text-slate-600">
                  <Video className="h-5 w-5" />
                  Select media to preview
                </div>
              )}
            </div>

            {draftType === 'text' ? (
              <div className="space-y-3">
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Write a short story..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  rows={4}
                  disabled={publishing}
                />

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Theme</div>
                  <div className="flex flex-wrap gap-2">
                    {storyTextThemes.map((theme) => {
                      const selected = draftTextStyle.textBackground === theme.background;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() =>
                            setDraftTextStyle((prev) => ({
                              ...prev,
                              textBackground: theme.background,
                              textColor: theme.textColor
                            }))
                          }
                          className={[
                            'h-8 w-8 rounded-full border shadow-sm',
                            selected ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white/70'
                          ].join(' ')}
                          style={{ background: theme.background }}
                          aria-label={theme.label}
                          disabled={publishing}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Font</div>
                  <div className="flex flex-wrap gap-2">
                    {storyTextFonts.map((font) => {
                      const selected = draftTextStyle.textFont === font.fontFamily;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setDraftTextStyle((prev) => ({ ...prev, textFont: font.fontFamily }))}
                          className={[
                            'rounded-full border px-3 py-1 text-xs font-semibold',
                            selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
                          ].join(' ')}
                          style={{ fontFamily: font.fontFamily }}
                          disabled={publishing}
                        >
                          {font.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-500">Align</div>
                  <div className="flex gap-2">
                    {([
                      { key: 'left', icon: <AlignLeft className="h-4 w-4" /> },
                      { key: 'center', icon: <AlignCenter className="h-4 w-4" /> },
                      { key: 'right', icon: <AlignRight className="h-4 w-4" /> }
                    ] as const).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setDraftTextStyle((prev) => ({ ...prev, textAlign: item.key }))}
                        className={[
                          'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold',
                          draftTextStyle.textAlign === item.key
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        ].join(' ')}
                        disabled={publishing}
                      >
                        {item.icon}
                        {item.key.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">Caption (optional)</div>
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                    disabled={publishing}
                  >
                    Change media
                  </button>
                </div>
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  rows={3}
                  disabled={publishing}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void publish()}
              disabled={!canPublish || publishing}
              className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publishing ? 'Publishing...' : composerMode === 'edit' ? 'Save changes' : 'Publish story'}
            </button>
          </div>
        )}
      </Sheet>

      <FilePickerModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        allowUpload
        allowCamera
        filterType="all"
        acceptedTypes={['image', 'video']}
        title={composerMode === 'edit' ? 'Change story media' : 'Select story media'}
        onSelect={(file) => {
          setMediaPickerOpen(false);
          if (!user?.id) {
            navigate('/auth/login');
            return;
          }
          const type = resolveStoryTypeFromFile(file);
          if (!type) {
            showNotification('error', 'Story', 'Please select an image or video.');
            return;
          }
          setDraftType(type);
          setDraftMediaFile(file);
          setComposerStep('compose');
          setComposerOpen(true);
        }}
      />
    </>
  );
}

function StoryViewer({
  story,
  viewer,
  onClose,
  onEdit,
  onDelete
}: {
  story: any;
  viewer: any;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { showNotification } = useNotification();
  const [actionsOpen, setActionsOpen] = useState(false);

  const name = String(story?.authorName || story?.author?.name || 'Story').trim();
  const avatar = story?.authorAvatar || story?.author?.avatar || null;
  const type = resolveStoryType(story);
  const media = resolveStoryMediaUrl(story);
  const content = resolveStoryContent(story);
  const canManage = canManageStory(story, viewer);
  const style = getStoryTextStyle(story);

  return (
    <div className="fixed inset-0 z-[950] bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full border border-white/20 bg-white/10">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold">
                {(name[0] || 'S').toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-[11px] text-white/70">
              {type === 'text' ? 'Text story' : type === 'video' ? 'Video story' : 'Photo story'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={() => setActionsOpen(true)}
              className="rounded-full border border-white/20 bg-white/10 p-2"
              aria-label="Story actions"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 p-2"
            aria-label="Close story"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100%-56px)] items-center justify-center px-4 pb-6">
        {type === 'text' ? (
          <div
            className="flex h-full w-full max-w-md items-center justify-center rounded-3xl px-6 text-center text-base font-semibold"
            style={{
              background: style.background,
              color: style.color,
              fontFamily: style.fontFamily,
              textAlign: style.textAlign as any
            }}
          >
            <span className="whitespace-pre-wrap">{content || 'Story'}</span>
          </div>
        ) : media.url ? (
          type === 'video' || media.isVideo ? (
            <video src={media.url} className="h-full w-full max-w-md rounded-3xl object-contain" controls autoPlay playsInline />
          ) : (
            <img src={media.url} alt="Story" className="h-full w-full max-w-md rounded-3xl object-contain" />
          )
        ) : (
          <div className="text-sm text-white/80">Story media not available.</div>
        )}
      </div>

      <Sheet open={actionsOpen} title="Story options" onClose={() => setActionsOpen(false)}>
        <div className="space-y-1">
          <SheetItem
            icon={<Edit3 className="h-4 w-4" />}
            label="Edit story"
            onClick={() => {
              setActionsOpen(false);
              onEdit();
            }}
          />
          <SheetItem
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete story"
            danger
            onClick={() => {
              setActionsOpen(false);
              onDelete();
            }}
          />
          <SheetItem
            icon={<Eye className="h-4 w-4" />}
            label="Visibility"
            onClick={() => {
              setActionsOpen(false);
              showNotification('info', 'Story', 'Change visibility from Edit story.');
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}
