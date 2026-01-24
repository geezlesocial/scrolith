import React, { useState, useEffect } from 'react';
import { ContractService } from '../../services/contract';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { Table, StatusBadge, Skeleton, EmptyState } from '../shared';

export const Contracts: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadContracts();
    }
  }, [user]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      const data = await ContractService.getContracts(user!.id, 'client');
      setContracts(data || []);
    } catch (error: any) {
      console.error('Failed to load contracts:', error);
      showNotification('error', 'Load Error', error.message || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Contract Title',
      render: (value: string, contract: any) => (
        <div>
          <div className="font-medium text-gray-900">{contract.title || 'N/A'}</div>
          <div className="text-sm text-gray-500">{contract.description?.substring(0, 50)}...</div>
        </div>
      )
    },
    {
      key: 'freelancer',
      header: 'Freelancer',
      render: (value: string, contract: any) => (
        <span className="text-sm text-gray-600">{contract.freelancerName || 'N/A'}</span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="contract" />
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number, contract: any) => (
        <span className="font-medium">
          ${contract.amount || 0}
        </span>
      )
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (value: string) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      )
    }
  ];

  if (loading) {
    return <Skeleton type="table" rows={5} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">My Contracts</h1>
      </div>

      <Table
        data={contracts}
        columns={columns}
        loading={loading}
        emptyMessage="No contracts found. Contracts will appear here once freelancers accept your job offers."
      />
    </div>
  );
};

export default Contracts;