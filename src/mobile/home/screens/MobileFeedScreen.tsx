import React from 'react';
import { useOutletContext } from 'react-router-dom';
import MobileFeed from '../components/MobileFeed';

export default function MobileFeedScreen() {
  const ctx = useOutletContext<any>();
  return <MobileFeed settings={ctx?.mobileLayout ?? null} />;
}

