import React from 'react';
import {
  communitySpacing,
  communitySurface,
  communityTypography
} from '../../design/communityTokens';

const CommunityPageShell: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  sticky?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, sticky, children, className = '' }) => (
  <div
    className={`min-w-0 overflow-x-hidden ${communitySurface.page} ${className}`}
    data-testid="community-page-shell"
  >
    {(title || actions) && (
      <header className={`mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between ${communitySpacing.pageX}`}>
        <div className="min-w-0">
          {title ? <h1 className={communityTypography.pageTitle}>{title}</h1> : null}
          {subtitle ? <p className={`mt-1 ${communityTypography.pageSubtitle}`}>{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    )}
    {sticky ? (
      <div
        className="sticky z-10 border-b border-slate-200/80 bg-slate-50 py-2"
        style={{ top: 'calc(var(--scrolith-header-height, 4.25rem) + 3.5rem)' }}
      >
        <div className={communitySpacing.pageX}>{sticky}</div>
      </div>
    ) : null}
    <div className={`${communitySpacing.pageX} ${communitySpacing.pageY} ${communitySpacing.section}`}>
      {children}
    </div>
  </div>
);

export default CommunityPageShell;
