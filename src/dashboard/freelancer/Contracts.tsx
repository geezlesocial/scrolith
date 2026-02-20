import React from 'react';
import { Loader2 } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import ContractList from '../shared/ContractList';

const Contracts: React.FC = () => {
  const { user } = useUser();

  if (!user?.id) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading contracts...
      </div>
    );
  }

  return <ContractList role="freelancer" userId={user.id} />;
};

export default Contracts;
