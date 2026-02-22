import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';
import InsightsQuickPanel from '../../../components/insights/InsightsQuickPanel';

export default function MobileFeedScreen() {
  const ctx = useOutletContext<any>();
  const layout = ctx?.mobileLayout ?? null;
  return (
    <>
      <div className="px-3 pt-3">
        <InsightsQuickPanel compact className="rounded-2xl" />
      </div>
      <MobileStoriesStrip settings={layout} />
      <MobileFeed settings={layout} />
    </>
  );
}
