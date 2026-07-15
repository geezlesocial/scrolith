import React from 'react';
import { Link } from 'react-router-dom';
import HeaderUnreadBadge from './HeaderUnreadBadge';

export type HeaderPrimaryNavItemProps = {
  id?: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  external?: boolean;
  active?: boolean;
  badgeCount?: number;
  badgeColor?: string;
  showBadge?: boolean;
  compact?: boolean;
  /** button for popup triggers; link for route items */
  as?: 'link' | 'button';
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  ariaCurrent?: 'page' | undefined;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaHaspopup?: boolean | 'dialog' | 'menu' | 'listbox' | 'true' | 'false';
  className?: string;
  buttonType?: 'button' | 'submit' | 'reset';
};

/**
 * Generic enterprise shell for admin/CMS-provided header navigation items.
 * Owns presentation only — labels, icons, routes, and order remain CMS-driven.
 */
const HeaderPrimaryNavItem: React.FC<HeaderPrimaryNavItemProps> = ({
  id,
  label,
  icon,
  href,
  external = false,
  active = false,
  badgeCount = 0,
  badgeColor,
  showBadge = false,
  compact = false,
  as = href ? 'link' : 'button',
  onClick,
  title,
  ariaLabel,
  ariaCurrent,
  ariaExpanded,
  ariaControls,
  ariaHaspopup,
  className = '',
  buttonType = 'button'
}) => {
  const classNames = [
    'scrolith-header-nav-item',
    'scrolith-desktop-nav-item',
    active ? 'is-active' : '',
    compact ? 'is-compact' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="scrolith-header-nav-item__icon">
        {icon}
        {showBadge ? (
          <HeaderUnreadBadge count={badgeCount} color={badgeColor} />
        ) : null}
      </span>
      <span className="scrolith-header-nav-item__label">{label}</span>
      {active ? <span className="scrolith-header-nav-item__marker" aria-hidden="true" /> : null}
    </>
  );

  const sharedAria = {
    id,
    className: classNames,
    title: title || label,
    'aria-label': ariaLabel || label,
    'aria-current': ariaCurrent,
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    'aria-haspopup': ariaHaspopup as HeaderPrimaryNavItemProps['ariaHaspopup']
  };

  if (as === 'button' || !href) {
    return (
      <button type={buttonType} onClick={onClick} {...sharedAria}>
        {content}
      </button>
    );
  }

  if (external || href.startsWith('http')) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={onClick} {...sharedAria}>
        {content}
      </a>
    );
  }

  return (
    <Link to={href} onClick={onClick} {...sharedAria}>
      {content}
    </Link>
  );
};

export default HeaderPrimaryNavItem;
