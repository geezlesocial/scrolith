import React from 'react';
import { enterprisePanel, enterprisePanelPadding } from './enterpriseClasses';

type Props = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'div' | 'section' | 'aside' | 'article';
  'aria-label'?: string;
};

const EnterprisePanel: React.FC<Props> = ({
  children,
  className = '',
  padded = true,
  as: Tag = 'div',
  'aria-label': ariaLabel
}) => (
  <Tag
    aria-label={ariaLabel}
    className={`${enterprisePanel} ${padded ? enterprisePanelPadding : ''} ${className}`.trim()}
  >
    {children}
  </Tag>
);

export default EnterprisePanel;
