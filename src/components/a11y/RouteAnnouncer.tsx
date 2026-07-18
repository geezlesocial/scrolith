import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Announces route changes to assistive technology (polite live region).
 * Non-visual; does not alter layout or navigation behavior.
 */
const RouteAnnouncer: React.FC = () => {
  const location = useLocation();
  const [message, setMessage] = useState('');
  const lastPathRef = useRef('');

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    const segments = location.pathname.split('/').filter(Boolean);
    const leaf = segments[segments.length - 1] || 'home';
    const human =
      leaf === 'home' || leaf === 'member-home'
        ? 'Home'
        : leaf
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

    // Defer slightly so page content can settle before announcement.
    const timer = window.setTimeout(() => {
      setMessage(`Navigated to ${human}`);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  return (
    <div
      id="scrolith-route-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

export default RouteAnnouncer;
