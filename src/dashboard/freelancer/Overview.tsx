import React from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, ShoppingCart, TrendingUp, Wallet, PlusCircle, User } from 'lucide-react';
import { freelancerApi } from '../../services/freelancer';
import { Skeleton } from '../shared/Skeleton';
import { useUser } from '../../context/UserContext';

export const Overview: React.FC = () => {
  const { user } = useUser();
  const [data, setData] = React.useState<Awaited<ReturnType<typeof freelancerApi.getOverview>> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadOverview();
    // Set up polling every 30 seconds
    const interval = setInterval(loadOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const overview = await freelancerApi.getOverview();
      setData(overview);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load overview');
      console.error('Failed to load freelancer overview:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return <Skeleton type="overview" />;
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadOverview}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const overview = data!;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 data-cy="page-title" className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
        <div className="flex w-full items-center sm:w-auto">
          <Link
            to="/create-gig"
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 sm:w-auto"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Gig
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div data-cy="overview-card-active-orders" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 font-medium">Active Orders</div>
            <ShoppingCart className="w-5 h-5 text-blue-500" />
          </div>
          <div data-cy="overview-value-active-orders" className="text-2xl font-bold text-gray-900 sm:text-3xl">{overview.activeOrders}</div>
          {overview.revisionOrders > 0 && (
            <div className="mt-2 text-xs text-orange-600">
              {overview.revisionOrders} in revision
            </div>
          )}
        </div>

        <div data-cy="overview-card-earnings" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 font-medium">Earnings (Month)</div>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <div data-cy="overview-value-earnings" className="text-2xl font-bold text-green-600 sm:text-3xl">
            ${overview.earningsThisMonth.toFixed(2)}
          </div>
        </div>

        <div data-cy="overview-card-wallet" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 font-medium">Wallet Balance</div>
            <Wallet className="w-5 h-5 text-indigo-500" />
          </div>
          <div data-cy="overview-value-wallet" className="text-2xl font-bold text-indigo-600 sm:text-3xl">
            ${overview.walletBalance.toFixed(2)}
          </div>
        </div>

        <div data-cy="overview-card-rating" className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500 font-medium">Rating</div>
            <TrendingUp className="w-5 h-5 text-yellow-500" />
          </div>
          <div data-cy="overview-value-rating" className="text-2xl font-bold text-gray-900 sm:text-3xl">{overview.rating.toFixed(1)}</div>
          <div className="text-xs text-gray-500 mt-1">{overview.reviews} reviews</div>
        </div>
      </div>

      {/* Gig Performance */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Gig Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Views</div>
            <div className="text-2xl font-bold text-gray-900">{overview.gigViews.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Clicks</div>
            <div className="text-2xl font-bold text-gray-900">{overview.gigClicks.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Conversion Rate</div>
            <div className="text-2xl font-bold text-gray-900">
              {overview.gigViews > 0
                ? ((overview.gigClicks / overview.gigViews) * 100).toFixed(1)
                : '0.0'}
              %
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/create-gig"
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 sm:w-auto"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Gig
          </Link>
          <Link
            to="/freelancer/dashboard?tab=wallet"
            className="flex w-full items-center justify-center rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-200 sm:w-auto"
          >
            <User className="w-4 h-4 mr-2" />
            Update Profile
          </Link>
          {overview.walletBalance > 0 && (
            <Link
              to="/freelancer/dashboard?tab=withdrawals"
              className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-700 sm:w-auto"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Withdraw Funds
            </Link>
          )}
        </div>
      </div>

      {/* Notifications Summary */}
      {(overview.unreadMessages > 0 || overview.unreadNotifications > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              {overview.unreadMessages > 0 && (
                <p data-cy="unread-messages" className="text-sm text-blue-700">
                  {overview.unreadMessages} unread message{overview.unreadMessages !== 1 ? 's' : ''}
                </p>
              )}
              {overview.unreadNotifications > 0 && (
                <p data-cy="unread-notifications" className="text-sm text-blue-700">
                  {overview.unreadNotifications} unread notification{overview.unreadNotifications !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              {overview.unreadMessages > 0 && (
                <Link
                  to="/freelancer/dashboard?tab=messages"
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  View Messages
                </Link>
              )}
              {overview.unreadNotifications > 0 && (
                <Link
                  to="/freelancer/dashboard?tab=notifications"
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  View Notifications
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
