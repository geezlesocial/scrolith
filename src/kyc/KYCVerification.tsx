import React from 'react';
import { KYCVerification as SharedKYCVerification } from '../dashboard/shared/KYCVerification';

const KYCPage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <SharedKYCVerification />
    </div>
  );
};

export default KYCPage;
