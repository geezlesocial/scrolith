import React from 'react';
import type { MessagingInboxTab } from '../../services/messagingSurfaces';

const TABS: Array<{ id: MessagingInboxTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
  { id: 'communities', label: 'Communities' }
];

type MessagingTabsProps = {
  activeTab: MessagingInboxTab;
  onChange: (tab: MessagingInboxTab) => void;
  idPrefix?: string;
  className?: string;
};

const MessagingTabs: React.FC<MessagingTabsProps> = ({
  activeTab,
  onChange,
  idPrefix = 'messaging-tab',
  className = ''
}) => {
  return (
    <div
      role="tablist"
      aria-label="Message filters"
      className={`flex flex-wrap gap-1.5 ${className}`.trim()}
    >
      {TABS.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={[
              'rounded-full px-3 py-1 text-[11px] font-semibold motion-safe:transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
              selected
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default MessagingTabs;
