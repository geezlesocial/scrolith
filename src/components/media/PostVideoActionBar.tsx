import React, { useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  Copy,
  Facebook,
  Linkedin,
  MessageCircle,
  RotateCcw,
  Share2,
  Twitter,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useNotification } from '../../context/NotificationContext';
import { stashPendingPostVideoScrollSource } from '../../utils/postVideoScrollBridge';
import { buildPostPermalink, buildPostSocialShareTargets, normalizeShareText } from '../../utils/postShare';

type PostVideoActionBarProps = {
  postId: string;
  postTitle?: string | null;
  postContent?: string | null;
  postLocation?: string | null;
  media: {
    id?: string | null;
    fileId?: string | null;
    url?: string | null;
    thumbnailUrl?: string | null;
    name?: string | null;
    mimeType?: string | null;
  };
  videoElement?: HTMLVideoElement | null;
  className?: string;
};

const normalizePreviewText = (value: unknown, maxLength: number) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const PostVideoActionBar: React.FC<PostVideoActionBarProps> = ({
  postId,
  postTitle,
  postContent,
  postLocation,
  media,
  videoElement,
  className = ''
}) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [shareOpen, setShareOpen] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const fileId = String(media.fileId || media.id || '').trim();
  const shareUrl = useMemo(() => {
    return buildPostPermalink(postId);
  }, [postId]);

  const shareTitle = useMemo(() => {
    const title = normalizeShareText(postTitle, 120);
    if (title) return title;
    const content = normalizeShareText(postContent, 120);
    if (content) return content;
    return 'Watch this video post on Scrolith';
  }, [postContent, postTitle]);

  useEffect(() => {
    const node = videoElement;
    if (!node) {
      setShowActions(false);
      return;
    }

    const syncVisibility = () => {
      setShowActions(Boolean(node.ended));
    };

    const hideActions = () => {
      setShowActions(false);
    };

    syncVisibility();

    node.addEventListener('ended', syncVisibility);
    node.addEventListener('play', hideActions);
    node.addEventListener('playing', hideActions);
    node.addEventListener('seeking', hideActions);
    node.addEventListener('loadstart', hideActions);
    node.addEventListener('emptied', hideActions);

    return () => {
      node.removeEventListener('ended', syncVisibility);
      node.removeEventListener('play', hideActions);
      node.removeEventListener('playing', hideActions);
      node.removeEventListener('seeking', hideActions);
      node.removeEventListener('loadstart', hideActions);
      node.removeEventListener('emptied', hideActions);
    };
  }, [videoElement]);

  const handleGoToScrolls = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fileId) {
      showNotification('error', 'Scroll', 'This video is not ready to feature in Scroll yet.');
      navigate('/scroll');
      return;
    }
    stashPendingPostVideoScrollSource({
      sourcePostId: String(postId || '').trim(),
      fileId,
      mediaUrl: media.url,
      thumbnailUrl: media.thumbnailUrl,
      title: normalizePreviewText(postTitle, 160) || normalizePreviewText(media.name, 160),
      description: normalizePreviewText(postContent, 320),
      location: normalizePreviewText(postLocation, 120)
    });
    navigate('/scroll?create=post-video');
  };

  const handleWatchAgain = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!videoElement) return;
    try {
      videoElement.currentTime = 0;
      setShowActions(false);
      const playAttempt = videoElement.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => undefined);
      }
    } catch {
      return;
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotification('success', 'Share', 'Post URL copied.');
      setShareOpen(false);
    } catch {
      showNotification('error', 'Share', 'Failed to copy the post URL.');
    }
  };

  const shareTargets = useMemo(
    () =>
      buildPostSocialShareTargets({
        postId,
        permalinkUrl: shareUrl,
        shareHeading: shareTitle,
        shareSummary: normalizeShareText(postContent, 220)
      }),
    [postContent, postId, shareTitle, shareUrl]
  );

  const handleShareProviderClick = (providerKey: 'facebook' | 'twitter' | 'linkedin' | 'whatsapp' | 'copy') => {
    if (providerKey === 'copy') {
      void handleCopyUrl();
      return;
    }
    setShareOpen(false);
  };

  const shareProviders = [
    { key: 'facebook', label: 'Facebook', icon: Facebook, href: shareTargets.facebook },
    { key: 'twitter', label: 'Twitter', icon: Twitter, href: shareTargets.x },
    { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, href: shareTargets.linkedin },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: shareTargets.whatsapp },
    { key: 'copy', label: 'Copy URL', icon: Copy, href: null }
  ] as const;

  if (!showActions && !shareOpen) return null;

  return (
    <>
      <div
        className={[
          'pointer-events-auto w-full max-w-[19.5rem] rounded-[1.75rem] border border-white/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(15,23,42,0.72))] p-3.5 text-white shadow-2xl backdrop-blur-xl sm:max-w-[24rem] sm:p-4',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        data-inline-video-control="true"
      >
        <div className="mb-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">Video complete</p>
          <p className="mt-1 text-sm font-semibold text-white sm:text-[15px]">Choose what to do next</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleGoToScrolls}
            data-inline-video-control="true"
            className="inline-flex min-h-[4.9rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white transition hover:bg-white/16 sm:min-h-[5.15rem] sm:text-xs"
          >
            <Clapperboard className="h-4 w-4" />
            <span className="leading-tight">Go to Scrolls</span>
          </button>
          <button
            type="button"
            onClick={handleWatchAgain}
            data-inline-video-control="true"
            className="inline-flex min-h-[4.9rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white transition hover:bg-white/16 sm:min-h-[5.15rem] sm:text-xs"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="leading-tight">Watch Again</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setShareOpen(true);
            }}
            data-inline-video-control="true"
            className="inline-flex min-h-[4.9rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white transition hover:bg-white/16 sm:min-h-[5.15rem] sm:text-xs"
          >
            <Share2 className="h-4 w-4" />
            <span className="leading-tight">Share</span>
          </button>
        </div>
      </div>

      {shareOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-inline-video-control="true">
          <button
            type="button"
            onClick={() => setShareOpen(false)}
            className="absolute inset-0 bg-black/60"
            aria-label="Close share options"
          />
          <div className="relative z-[1] w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Share video post</p>
                <h3 className="mt-1 text-lg font-semibold leading-tight text-slate-950">{shareTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="Close share options"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <div className="truncate">{shareUrl}</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shareProviders.map((provider) => {
                const Icon = provider.icon;
                return (
                  provider.href ? (
                    <a
                      key={provider.key}
                      href={provider.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleShareProviderClick(provider.key);
                      }}
                      className="inline-flex min-h-[4.25rem] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{provider.label}</span>
                    </a>
                  ) : (
                    <button
                      key={provider.key}
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleShareProviderClick(provider.key);
                      }}
                      className="inline-flex min-h-[4.25rem] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{provider.label}</span>
                    </button>
                  )
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default PostVideoActionBar;
