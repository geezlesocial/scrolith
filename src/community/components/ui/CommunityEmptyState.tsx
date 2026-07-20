import React from 'react';
import { communityRadius, communitySpacing, communityTypography } from '../../design/communityTokens';

const CommunityEmptyState: React.FC<{
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div
    className={`${communityRadius.card} border border-dashed border-slate-300 bg-white ${communitySpacing.cardPad} px-4 py-10 text-center`}
    role="status"
  >
    {icon ? <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">{icon}</div> : null}
    <h3 className={communityTypography.sectionTitle}>{title}</h3>
    {description ? <p className={`mx-auto mt-2 max-w-md ${communityTypography.body}`}>{description}</p> : null}
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        {actionLabel}
      </button>
    ) : null}
  </div>
);

export default CommunityEmptyState;
