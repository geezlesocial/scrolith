import React, { useEffect, useState } from "react";
import { employerApi, EmployerOverview } from "../../services/employer";
import { useNotification } from "../../context/NotificationContext";
import { useUser } from "../../context/UserContext";
import { Skeleton } from "../shared/Skeleton";
import { Link } from "react-router-dom";

const Overview: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [data, setData] = useState<EmployerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOverview();
  }, [user]);

  const loadOverview = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const overview = await employerApi.getOverview();
      setData(overview);
    } catch (error: any) {
      setError(error.message || 'Failed to load overview');
      showNotification('error', 'Load Error', error.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button onClick={loadOverview} className="mt-4 btn-primary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employer Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your hiring progress, escrow, proposals, and ongoing work in one place.
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Skeleton type="card" />
            </div>
          ))
        ) : data ? (
          <>
            <MetricCard
              title="Active Contracts"
              value={data.activeContracts}
              icon="file-text"
              change="+2"
            />
            <MetricCard
              title="Open Job Posts"
              value={data.openJobs}
              icon="briefcase"
              change="+1"
            />
            <MetricCard
              title="Proposals Received"
              value={data.proposalsReceived}
              icon="message-square"
              change="+5"
            />
            <MetricCard
              title="Escrow Balance"
              value={`$${data.escrowBalance.toFixed(2)}`}
              icon="shield"
            />
          </>
        ) : null}
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Skeleton type="card" />
            </div>
          ))
        ) : data ? (
          <>
            <MetricCard
              title="Spend This Month"
              value={`$${data.spendThisMonth.toFixed(2)}`}
              icon="dollar-sign"
              change="+12%"
            />
            <MetricCard
              title="Unread Messages"
              value={data.unreadMessages}
              icon="mail"
            />
            <MetricCard
              title="Unread Notifications"
              value={data.unreadNotifications}
              icon="bell"
            />
          </>
        ) : null}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Proposals this week</span>
              <span className="font-medium">{data?.proposalsReceived || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active contracts</span>
              <span className="font-medium">{data?.activeContracts || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Jobs posted</span>
              <span className="font-medium">{data?.openJobs || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/create-job"
              className="block w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 text-center"
            >
              Post New Job
            </Link>
            <Link
              to="/client/dashboard/proposals"
              className="block w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 text-center"
            >
              Review Proposals ({data?.proposalsReceived || 0})
            </Link>
            <Link
              to="/client/dashboard/contracts"
              className="block w-full bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 text-center"
            >
              Manage Contracts ({data?.activeContracts || 0})
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  change?: string;
  subtitle?: string;
}> = ({ title, value, icon, change, subtitle }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div className="flex items-center justify-between mb-2">
      <div className="text-sm text-gray-500 font-medium">{title}</div>
      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
        <span className="text-gray-600 text-sm">📊</span>
      </div>
    </div>
    <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
    {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    {change && (
      <div className="text-xs text-green-600 font-medium mt-1">{change} from last month</div>
    )}
  </div>
);

export default Overview;