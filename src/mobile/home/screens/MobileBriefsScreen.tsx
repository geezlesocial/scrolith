import React from 'react';

import ProjectBriefs from '../../../dashboard/employer/ProjectBriefs';

const MobileBriefsScreen = () => {
  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">Your briefs</div>
      <ProjectBriefs />
    </div>
  );
};

export default MobileBriefsScreen;

