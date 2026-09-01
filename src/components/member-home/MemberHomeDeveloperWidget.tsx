import { Code2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  getMemberHomeDeveloperWidgetVisibility,
  isMemberHomeDeveloperWidgetPath,
  MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY
} from './memberHomeDeveloperWidget';

const MemberHomeDeveloperWidget = () => {
  const location = useLocation();
  const isMemberHome = isMemberHomeDeveloperWidgetPath(location.pathname);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMemberHome || typeof window === 'undefined') {
      setVisible(false);
      return;
    }

    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      // Some privacy-restricted WebViews deny access to sessionStorage.
    }

    const visibility = getMemberHomeDeveloperWidgetVisibility(storage);
    setVisible(visibility.visible);
    if (!visibility.visible) return;

    const timer = window.setTimeout(() => {
      setVisible(false);
      try {
        storage?.setItem(MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY, '1');
      } catch {
        // Ignore storage failures; the timer still dismisses this mounted instance.
      }
    }, visibility.remainingMs);

    return () => window.clearTimeout(timer);
  }, [isMemberHome]);

  if (!isMemberHome || !visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-2 top-1/2 z-[45] -translate-y-1/2 md:left-4"
      data-testid="member-home-developer-widget"
    >
      <a
        href="https://scrolith.com/developer"
        aria-label="Open developer resources"
        title="Developer resources"
        className="pointer-events-auto flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur transition-colors hover:border-blue-300 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Code2 size={15} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Dev</span>
      </a>
    </div>
  );
};

export default MemberHomeDeveloperWidget;
