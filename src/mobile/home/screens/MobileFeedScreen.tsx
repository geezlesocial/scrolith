import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';
import MobileInsightsHubLauncher from '../../../components/insights/MobileInsightsHubLauncher';
import type { ScrollVideo } from '../../../services/scroll';
import type { PendingPostVideoScrollViewerSource } from '../../../utils/postVideoScrollBridge';

export default function MobileFeedScreen({
  mobileLayout,
  onOpenScroll,
  onOpenPostVideoScroll
}: {
  mobileLayout?: any;
  onOpenScroll?: (scroll: ScrollVideo) => void;
  onOpenPostVideoScroll?: (source: PendingPostVideoScrollViewerSource) => void;
} = {}) {
  const ctx = useOutletContext<any>();
  const layout = mobileLayout ?? ctx?.mobileLayout ?? null;
  return (
    <>
      <div className="px-3 pt-3 pb-3">
        <MobileInsightsHubLauncher />
      </div>
      <MobileStoriesStrip settings={layout} onOpenScroll={onOpenScroll} />
      <MobileFeed settings={layout} onOpenPostVideoScroll={onOpenPostVideoScroll} />
    </>
  );
}
