import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';
import MobileInsightsHubLauncher from '../../../components/insights/MobileInsightsHubLauncher';

export default function MobileFeedScreen() {
  const ctx = useOutletContext<any>();
  const layout = ctx?.mobileLayout ?? null;
  return (
      <>
      <div className="px-3 pt-3">
        <MobileInsightsHubLauncher />
      </div>
      <MobileStoriesStrip settings={layout} />
      <MobileFeed settings={layout} />
    </>
  );
}
