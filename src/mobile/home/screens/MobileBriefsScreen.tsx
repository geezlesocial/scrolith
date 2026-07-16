import React from 'react';

import ProjectBriefs from '../../../dashboard/employer/ProjectBriefs';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';

const MobileBriefsScreen = () => {
  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      <div className="mb-3 text-sm font-semibold text-slate-900">Your briefs</div>
      <ProjectBriefs />
    </div>
  );
};

export default MobileBriefsScreen;

