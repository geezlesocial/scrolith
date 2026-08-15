import {
  buildPostVideoScrollViewerPath,
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from './postVideoScrollBridge';

type ScrollNavigation = (
  to: string,
  options?: { replace?: boolean; state?: Record<string, unknown> }
) => void;

export type OpenVideoInScrollOptions = {
  navigate: ScrollNavigation;
  source: PendingPostVideoScrollViewerSource;
  sourceSurface?: string | null;
  returnTo?: string | null;
  onOpenOverlay?: (source: PendingPostVideoScrollViewerSource) => void;
};

/**
 * Single entry contract for expanded post videos. Embedded mobile shells can
 * keep their feed mounted; routed surfaces use the same canonical Scroll URL.
 */
export const openVideoInScroll = ({
  navigate,
  source,
  sourceSurface = null,
  returnTo = null,
  onOpenOverlay
}: OpenVideoInScrollOptions) => {
  const postId = String(source?.sourcePostId || '').trim();
  const mediaUrl = String(source?.mediaUrl || '').trim();
  if (!postId || !mediaUrl) return false;

  if (onOpenOverlay) {
    onOpenOverlay(source);
    return true;
  }

  stashPendingPostVideoScrollViewerSource(source);
  navigate(buildPostVideoScrollViewerPath(source), {
    state: {
      pendingViewerSource: source,
      scrollSourceSurface: String(sourceSurface || '').trim() || null,
      scrollReturnTo: String(returnTo || '').trim() || null
    }
  });
  return true;
};
