import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useUser } from '../../../context/UserContext';
import { useNotification } from '../../../context/NotificationContext';
import { CommunityService } from '../../../services/community';
import { UploadedFile } from '../../../types';
import FilePickerModal from '../../../dashboard/shared/FilePickerModal';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

const resolveStoryTypeFromFile = (file: UploadedFile): 'image' | 'video' | null => {
  const explicit = String(file?.type || '').toLowerCase();
  const mime = String(file?.mime_type || file?.mimeType || '').toLowerCase();
  if (explicit === 'video' || mime.startsWith('video/')) return 'video';
  if (explicit === 'image' || mime.startsWith('image/')) return 'image';
  return null;
};

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const visibleStories = useMemo(() => {
    const list = Array.isArray(stories) ? stories : [];
    return list.filter(isStoryActive).slice(0, maxItems);
  }, [stories, maxItems]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    CommunityService.getStoriesFeed()
      .then((items) => {
        if (!mounted) return;
        setStories(Array.isArray(items) ? items : []);
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
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div className="mx-auto max-w-md px-3 pt-3">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          <button
            type="button"
            onClick={() => {
              if (!user?.id) {
                navigate('/auth/login');
                return;
              }
              setCreateOpen(true);
            }}
            className="flex w-[74px] shrink-0 flex-col items-center gap-1.5"
            aria-label="Your story"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white">
              {creating ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
              ) : (
                <Plus className="h-5 w-5 text-slate-600" />
              )}
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
              const name = String(story?.authorName || 'Story').trim();
              const avatar = story?.authorAvatar || null;
              const media = resolveStoryMediaUrl(story);
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
                        {(name[0] || 'S').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="w-full truncate text-center text-[11px] font-semibold text-slate-700">
                    {name}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {activeStory ? (
        <StoryViewer
          story={activeStory}
          onClose={() => setActiveStory(null)}
          viewerName={String(user?.name || user?.username || '').trim()}
        />
      ) : null}

      <FilePickerModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        allowUpload
        allowCamera
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Create story"
        onSelect={(file) => {
          setCreateOpen(false);
          if (!user?.id) {
            navigate('/auth/login');
            return;
          }
          const type = resolveStoryTypeFromFile(file);
          if (!type) {
            showNotification('error', 'Story', 'Please select an image or video.');
            return;
          }
          if (creating) return;
          setCreating(true);
          CommunityService.createStory({ type, mediaFileId: file.id, visibility: 'public' })
            .then((created) => {
              if (!created?.id) return;
              setStories((prev) => {
                const existing = Array.isArray(prev) ? prev : [];
                if (existing.some((s) => String(s?.id) === String(created.id))) return existing;
                return [created, ...existing];
              });
              showNotification('success', 'Story', 'Story posted.');
              setActiveStory(created);
            })
            .catch((e: any) => {
              showNotification('error', 'Story failed', e?.response?.data?.error || e?.message || 'Unable to create story.');
            })
            .finally(() => setCreating(false));
        }}
      />
    </>
  );
}

function StoryViewer({
  story,
  onClose,
  viewerName
}: {
  story: any;
  onClose: () => void;
  viewerName?: string;
}) {
  const name = String(story?.authorName || 'Story').trim();
  const avatar = story?.authorAvatar || null;
  const type = String(story?.type || '').toLowerCase();
  const media = resolveStoryMediaUrl(story);
  const content = String(story?.content || story?.caption || '').trim();
  const background = String(story?.textBackground || '#0b1020');
  const color = String(story?.textColor || '#ffffff');

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
            {viewerName ? <div className="truncate text-[11px] text-white/70">Viewing as {viewerName}</div> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/20 bg-white/10 p-2"
          aria-label="Close story"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex h-[calc(100%-56px)] items-center justify-center px-4 pb-6">
        {type === 'text' ? (
          <div
            className="flex h-full w-full max-w-md items-center justify-center rounded-3xl px-6 text-center text-base font-semibold"
            style={{ background, color }}
          >
            <span className="whitespace-pre-wrap">{content || 'Story'}</span>
          </div>
        ) : media.url ? (
          type === 'video' || media.isVideo ? (
            <video
              src={media.url}
              className="h-full w-full max-w-md rounded-3xl object-contain"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <img src={media.url} alt="Story" className="h-full w-full max-w-md rounded-3xl object-contain" />
          )
        ) : (
          <div className="text-sm text-white/80">Story media not available.</div>
        )}
      </div>
    </div>
  );
}
