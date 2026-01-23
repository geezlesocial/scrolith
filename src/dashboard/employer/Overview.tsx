import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { EmployerService } from '../../services/employer';
import Skeleton from '../shared/Skeleton';

export default function EmployerOverview() {
  const { formatPrice } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const overview = await EmployerService.getOverview();
        if (mounted) setData(overview);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load overview');
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (!data && !error) return <Skeleton rows={4} />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employer Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track hiring progress, escrow, proposals, and ongoing work in one place.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            to="/create-job"
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700"
          >
            Post a Job
          </Link>
          <Link
            to="/browse"
            className="px-4 py-2 rounded-xl border bg-white text-sm font-bold hover:bg-gray-50"
          >
            Browse Talent
          </Link>
          <Link
            to="/client/dashboard/project-briefs"
            className="px-4 py-2 rounded-xl border bg-white text-sm font-bold hover:bg-gray-50"
          >
            Create Brief (AI)
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Stat title="Active Contracts" value={data.activeContracts} />
        <Stat title="Open Job Posts" value={data.openJobs} />
        <Stat title="Proposals Received" value={data.proposalsReceived} />
        <Stat title="Escrow Balance" value={formatPrice(data.escrowBalance)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Stat title="Spend (Month)" value={formatPrice(data.spendThisMonth)} />
        <Stat title="Unread Messages" value={data.unreadMessages} />
        <Stat title="Unread Notifications" value={data.unreadNotifications} />
      </div>
    </div>
  );
}

export { EmployerOverview as Overview };

const Stat = ({ title, value }: any) => (
  <div className="bg-white p-6 rounded-xl border shadow-sm">
    <div className="text-sm text-gray-500">{title}</div>
    <div className="text-2xl font-bold mt-1 text-gray-900">{value}</div>
  </div>
);
