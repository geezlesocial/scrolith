import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';
import MobileStoriesStrip from '../components/MobileStoriesStrip';

export default function MobileFeedScreen() {
  const ctx = useOutletContext<any>();
  const layout = ctx?.mobileLayout ?? null;
  return (
    <>
      <MobileStoriesStrip settings={layout} />
      <MobileFeed settings={layout} />
    </>
  );
}
