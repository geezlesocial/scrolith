import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';
import MobileInsightsHubLauncher from '../../../components/insights/MobileInsightsHubLauncher';
import type { ScrollVideo } from '../../../services/scroll';
import type { PendingPostVideoScrollViewerSource } from '../../../utils/postVideoScrollBridge';
import { CameraIcon as Camera, PlusSquareIcon as PlusSquare, VideoIcon as Video } from '../../../components/icons/ShellIcons';
import { resolveUserAvatarUrl } from '../../../utils/userAvatar';
import { useUser } from '../../../context/UserContext';
import { MOBILE_PAGE_CONTAINER_CLASS } from '../mobileShellLayout';

export default function MobileFeedScreen({
  mobileLayout,
  onOpenScroll,
  onOpenPostVideoScroll,
  onOpenScrollSeries,
  onOpenPost
}: {
  mobileLayout?: any;
  onOpenScroll?: (scroll: ScrollVideo) => void;
  onOpenPostVideoScroll?: (source: PendingPostVideoScrollViewerSource) => void;
  onOpenScrollSeries?: (seriesId: string, scrollId?: string | null) => void;
  onOpenPost?: (intent?: 'text' | 'photo' | 'video') => void;
} = {}) {
  const ctx = useOutletContext<any>();
  const layout = mobileLayout ?? ctx?.mobileLayout ?? null;
  const { user } = useUser();
  const avatarUrl = resolveUserAvatarUrl(user);
  const initials = String(user?.name || user?.username || 'U').trim().charAt(0).toUpperCase() || 'U';

  return (
    <>
      <div className="pt-2 pb-2">
        <div className={MOBILE_PAGE_CONTAINER_CLASS}>
          <section className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_8px_22px_-20px_rgba(15,23,42,0.45)]" aria-label="Create a post">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100" aria-hidden="true">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">{initials}</span>}
              </div>
              <button
                type="button"
                onClick={() => onOpenPost?.('text')}
                className="min-h-9 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-left text-[13px] text-slate-500 transition-colors active:bg-slate-100"
              >
                What's on your mind?
              </button>
              <button
                type="button"
                onClick={() => onOpenPost?.('text')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors active:bg-slate-100"
                aria-label="Create a post"
              >
                <PlusSquare className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <button type="button" onClick={() => onOpenPost?.('photo')} className="flex min-h-7 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-emerald-700 active:bg-emerald-50">
                <Camera className="h-3.5 w-3.5" /> Photo
              </button>
              <button type="button" onClick={() => onOpenPost?.('video')} className="flex min-h-7 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-indigo-700 active:bg-indigo-50">
                <Video className="h-3.5 w-3.5" /> Video
              </button>
            </div>
          </section>
        </div>
      </div>
      <MobileStoriesStrip settings={layout} onOpenScroll={onOpenScroll} />
      <MobileFeed
        settings={layout}
        onOpenPostVideoScroll={onOpenPostVideoScroll}
        onOpenScrollSeries={onOpenScrollSeries}
      />
      <div className="pt-1 pb-2">
        <div className={MOBILE_PAGE_CONTAINER_CLASS}>
          <MobileInsightsHubLauncher />
        </div>
      </div>
    </>
  );
}
