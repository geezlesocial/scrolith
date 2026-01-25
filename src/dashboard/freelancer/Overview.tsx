import React, { useEffect, useState } from "react";
import { freelancerApi, FreelancerOverview } from "../../services/freelancer";
import { useNotification } from "../../context/NotificationContext";
import { useUser } from "../../context/UserContext";
import { Skeleton } from "../shared/Skeleton";

const Overview: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [data, setData] = useState<FreelancerOverview | null>(null);
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
      const overview = await freelancerApi.getOverview();
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-2">
          Track your performance, earnings, and active work in one place.
        </p>
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
              title="Active Orders"
              value={data.activeOrders}
              icon="package"
              change="+12%"
            />
            <MetricCard
              title="In Revision"
              value={data.revisionOrders}
              icon="rotate-ccw"
              change="+5%"
            />
            <MetricCard
              title="Earnings This Month"
              value={`$${data.earningsThisMonth.toFixed(2)}`}
              icon="dollar-sign"
              change="+8%"
            />
            <MetricCard
              title="Wallet Balance"
              value={`$${data.walletBalance.toFixed(2)}`}
              icon="wallet"
            />
          </>
        ) : null}
      </div>

      {/* Performance Metrics */}
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
              title="Gig Views"
              value={data.gigViews.toLocaleString()}
              icon="eye"
              change="+15%"
            />
            <MetricCard
              title="Gig Clicks"
              value={data.gigClicks.toLocaleString()}
              icon="mouse-pointer"
              change="+12%"
            />
            <MetricCard
              title="Rating"
              value={`${data.rating}/5.0`}
              subtitle={`${data.reviews} reviews`}
              icon="star"
            />
          </>
        ) : null}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors">
            Create New Gig
          </button>
          <button className="bg-blue-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
            Withdraw Earnings
          </button>
          <button className="bg-gray-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors">
            Update Profile
          </button>
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