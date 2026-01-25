import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'gig' | 'job' | 'contract' | 'kyc' | 'transaction' | 'withdrawal' | 'proposal';
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = 'general',
  size = 'md'
}) => {
  const getStatusConfig = (status: string, type: string) => {
    const normalizedStatus = status.toLowerCase().replace(/[_-]/g, ' ');

    const configs = {
      // Order statuses
      order: {
        active: { color: 'bg-blue-100 text-blue-800', label: 'Active' },
        delivered: { color: 'bg-green-100 text-green-800', label: 'Delivered' },
        revision_requested: { color: 'bg-orange-100 text-orange-800', label: 'Revision Requested' },
        completed: { color: 'bg-emerald-100 text-emerald-800', label: 'Completed' },
        cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
      },

      // Gig statuses
      gig: {
        draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
        submitted: { color: 'bg-yellow-100 text-yellow-800', label: 'Submitted' },
        under_review: { color: 'bg-blue-100 text-blue-800', label: 'Under Review' },
        approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
        active: { color: 'bg-emerald-100 text-emerald-800', label: 'Active' },
        rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
        paused: { color: 'bg-orange-100 text-orange-800', label: 'Paused' },
      },

      // KYC statuses
      kyc: {
        not_submitted: { color: 'bg-gray-100 text-gray-800', label: 'Not Submitted' },
        pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
        approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
        rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
        requires_updates: { color: 'bg-orange-100 text-orange-800', label: 'Requires Updates' },
      },

      // Transaction statuses
      transaction: {
        completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
        pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
        failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
      },

      // Default
      general: {
        [normalizedStatus]: { color: 'bg-gray-100 text-gray-800', label: status }
      }
    };

    return configs[type]?.[normalizedStatus] ||
           configs.general[normalizedStatus] ||
           { color: 'bg-gray-100 text-gray-800', label: status };
  };

  const config = getStatusConfig(status, type);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-sm',
    lg: 'px-3 py-1 text-base'
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${config.color} ${sizeClasses[size]}`}>
      {config.label}
    </span>
  );
};