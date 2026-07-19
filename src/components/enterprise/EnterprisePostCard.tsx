import React from 'react';
import {
  postCardPaddingClass,
  postCardPaddingCompactClass,
  postCardSectionStackClass,
  postCardShellClass
} from './postCardDesign';

export type EnterprisePostCardProps = {
  children: React.ReactNode;
  /** Optional header (avatar row) rendered above the section stack */
  header?: React.ReactNode;
  /** When true, slightly tighter vertical padding (still 16px horizontal) */
  compact?: boolean;
  className?: string;
  id?: string;
  /** Extra props for the article element (focus ring, data attrs, etc.) */
  articleProps?: React.HTMLAttributes<HTMLElement>;
};

/**
 * Shared enterprise post card shell.
 * Enforces identical padding and section spacing across Member Home,
 * Community, Mobile feed, and any surface that renders a post card.
 */
const EnterprisePostCard: React.FC<EnterprisePostCardProps> = ({
  children,
  header,
  compact = false,
  className = '',
  id,
  articleProps
}) => {
  const padding = compact ? postCardPaddingCompactClass : postCardPaddingClass;
  return (
    <article
      id={id}
      data-testid="enterprise-post-card"
      data-post-card-design="21.1.5"
      {...articleProps}
      className={`${postCardShellClass} ${padding} ${className} ${articleProps?.className || ''}`.trim()}
    >
      {header ? <div className="min-w-0">{header}</div> : null}
      <div className={header ? postCardSectionStackClass : 'flex min-w-0 flex-col gap-3'}>{children}</div>
    </article>
  );
};

export default EnterprisePostCard;
