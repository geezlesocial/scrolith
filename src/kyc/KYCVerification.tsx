import React, { Suspense } from 'react';

const SharedKYCVerification = React.lazy(() =>
  import('../dashboard/shared/KYCVerification').then((module) => ({ default: module.KYCVerification }))
);

const KYCPage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Suspense fallback={<div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading KYC...</div>}>
        <SharedKYCVerification />
      </Suspense>
    </div>
  );
};

export default KYCPage;
