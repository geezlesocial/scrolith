import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';
import MobileInsightsHubLauncher from '../../../components/insights/MobileInsightsHubLauncher';
import type { ScrollVideo } from '../../../services/scroll';
import type { PendingPostVideoScrollViewerSource } from '../../../utils/postVideoScrollBridge';
import { MOBILE_PAGE_CONTAINER_CLASS } from '../mobileShellLayout';

export default function MobileFeedScreen({
  mobileLayout,
  onOpenScroll,
  onOpenPostVideoScroll,
  onOpenScrollSeries
}: {
  mobileLayout?: any;
  onOpenScroll?: (scroll: ScrollVideo) => void;
  onOpenPostVideoScroll?: (source: PendingPostVideoScrollViewerSource) => void;
  onOpenScrollSeries?: (seriesId: string, scrollId?: string | null) => void;
} = {}) {
  const ctx = useOutletContext<any>();
  const layout = mobileLayout ?? ctx?.mobileLayout ?? null;
  return (
    <>
      <div className="pt-3 pb-3">
        <div className={MOBILE_PAGE_CONTAINER_CLASS}>
          <MobileInsightsHubLauncher />
        </div>
      </div>
      <MobileStoriesStrip settings={layout} onOpenScroll={onOpenScroll} />
      <MobileFeed
        settings={layout}
        onOpenPostVideoScroll={onOpenPostVideoScroll}
        onOpenScrollSeries={onOpenScrollSeries}
      />
    </>
  );
}
