import React from 'react';

/**
 * WCAG 2.4.1 Bypass Blocks — first focusable control for keyboard / SR users.
 */
const SkipLink: React.FC<{ targetId?: string; label?: string }> = ({
  targetId = 'main-content',
  label = 'Skip to main content'
}) => (
  <a
    href={`#${targetId}`}
    className="scrolith-skip-link"
    onClick={(event) => {
      const el = document.getElementById(targetId);
      if (!el) return;
      event.preventDefault();
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
      }
      el.focus({ preventScroll: false });
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }}
  >
    {label}
  </a>
);

export default SkipLink;
