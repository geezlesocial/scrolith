import React from 'react';

interface StatusBadgeProps {
  status?: string;
  type?: 'order' | 'gig' | 'job' | 'contract' | 'kyc' | 'withdrawal' | 'proposal';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status = 'unknown', type = 'order', className = '' }) => {
  const getStatusConfig = (statusStr: string, typeStr: string) => {
    const statusLower = (statusStr || '').toLowerCase();

    const configs: Record<string, Record<string, { label: string; color: string }>> = {
      order: {
        active: { label: 'Active', color: 'blue' },
        pending_delivery: { label: 'Pending Delivery', color: 'yellow' },
        delivered: { label: 'Delivered', color: 'green' },
        revision_requested: { label: 'Revision Requested', color: 'orange' },
        completed: { label: 'Completed', color: 'green' },
        cancelled: { label: 'Cancelled', color: 'red' },
        refunded: { label: 'Refunded', color: 'red' }
      },
      gig: {
        draft: { label: 'Draft', color: 'gray' },
        submitted: { label: 'Submitted', color: 'blue' },
        under_review: { label: 'Under Review', color: 'yellow' },
        approved: { label: 'Approved', color: 'green' },
        active: { label: 'Active', color: 'green' },
        rejected: { label: 'Rejected', color: 'red' },
        paused: { label: 'Paused', color: 'orange' },
        archived: { label: 'Archived', color: 'gray' },
        delisted: { label: 'Delisted', color: 'gray' }
      },
      job: {
        draft: { label: 'Draft', color: 'gray' },
        submitted: { label: 'Submitted', color: 'blue' },
        under_review: { label: 'Under Review', color: 'yellow' },
        active: { label: 'Active', color: 'green' },
        paused: { label: 'Paused', color: 'orange' },
        closed: { label: 'Closed', color: 'gray' },
        rejected: { label: 'Rejected', color: 'red' }
      },
      contract: {
        active: { label: 'Active', color: 'green' },
        paused: { label: 'Paused', color: 'orange' },
        terminated: { label: 'Terminated', color: 'red' },
        completed: { label: 'Completed', color: 'green' }
      },
      kyc: {
        not_submitted: { label: 'Not Submitted', color: 'gray' },
        pending: { label: 'Pending', color: 'yellow' },
        under_review: { label: 'Under Review', color: 'yellow' },
        approved: { label: 'Approved', color: 'green' },
        rejected: { label: 'Rejected', color: 'red' },
        requires_updates: { label: 'Requires Updates', color: 'orange' }
      },
      withdrawal: {
        pending: { label: 'Pending', color: 'yellow' },
        processing: { label: 'Processing', color: 'blue' },
        completed: { label: 'Completed', color: 'green' },
        failed: { label: 'Failed', color: 'red' },
        cancelled: { label: 'Cancelled', color: 'gray' }
      },
      proposal: {
        pending: { label: 'Pending', color: 'yellow' },
        shortlisted: { label: 'Shortlisted', color: 'blue' },
        accepted: { label: 'Accepted', color: 'green' },
        rejected: { label: 'Rejected', color: 'red' },
        withdrawn: { label: 'Withdrawn', color: 'gray' }
      }
    };

    return configs[typeStr]?.[statusLower] || { label: statusStr, color: 'gray' };
  };

  const config = getStatusConfig(status, type);

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200'
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorClasses[config.color]} ${className}`}
    >
      {config.label}
    </span>
  );
};

export default StatusBadge;
