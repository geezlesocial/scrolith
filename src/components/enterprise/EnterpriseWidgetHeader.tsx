import React from 'react';
import { enterpriseWidgetHeading, enterpriseWidgetTitle } from './enterpriseClasses';

type Props = {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Use uppercase eyebrow style for section labels */
  eyebrow?: boolean;
  className?: string;
};

const EnterpriseWidgetHeader: React.FC<Props> = ({
  title,
  icon,
  action,
  eyebrow = false,
  className = ''
}) => (
  <div className={`flex items-center justify-between gap-3 ${className}`.trim()}>
    <div className="flex min-w-0 items-center gap-2.5">
      {icon ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-600">{icon}</span> : null}
      <h3 className={`min-w-0 truncate ${eyebrow ? enterpriseWidgetTitle : enterpriseWidgetHeading}`}>{title}</h3>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

export default EnterpriseWidgetHeader;
