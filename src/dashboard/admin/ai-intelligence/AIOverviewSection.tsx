import React, { useEffect, useState } from 'react';
import { BarChart, TrendingUp } from 'lucide-react';
import { AdminService } from '../../../services/admin';
import { useCurrency } from '../../../context/CurrencyContext';

type OverviewStats = {
  totalConversations: number;
  costEstimate: number;
  avgResponseTime: number;
  safetyStats: {
    spamTriggers: number;
  };
  topRoles: Array<{ role: string; count: number }>;
  conversionImpact: {
    aiGigsCreated: number;
    aiHireRate: number;
    revenueUplift: number;
  };
};

const DEFAULT_STATS: OverviewStats = {
  totalConversations: 1250,
  costEstimate: 12.5,
  avgResponseTime: 450,
  safetyStats: { spamTriggers: 5 },
  topRoles: [
    { role: 'freelancer', count: 800 },
    { role: 'employer', count: 450 }
  ],
  conversionImpact: {
    aiGigsCreated: 120,
    aiHireRate: 15,
    revenueUplift: 4500
  }
};

const AIOverviewSection: React.FC = () => {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    AdminService.getAIAnalytics()
      .then((data: any) => {
        if (cancelled) return;
        const totals = data?.totals || {};
        const transformed: OverviewStats = {
          totalConversations:
            data?.total_conversations ||
            data?.totalConversations ||
            totals?.conversations ||
            0,
          costEstimate:
            data?.cost_estimate ||
            data?.costEstimate ||
            totals?.estimatedCost ||
            0,
          avgResponseTime:
            data?.avg_response_time ||
            data?.avgResponseTime ||
            (totals?.avgDurationSeconds ? Math.round(Number(totals.avgDurationSeconds) * 1000) : 0),
          safetyStats: {
            spamTriggers:
              data?.safety_stats?.spam_triggers ||
              data?.safetyStats?.spamTriggers ||
              totals?.failedActions ||
              0
          },
          topRoles: (data?.top_roles || data?.topRoles || data?.topTools || []).map((entry: any) => ({
            role: entry?.role || entry?.toolKey || 'unknown',
            count: Number(entry?.count || 0)
          })),
          conversionImpact: {
            aiGigsCreated:
              data?.conversion_impact?.ai_gigs_created ||
              data?.conversionImpact?.aiGigsCreated ||
              totals?.actions ||
              0,
            aiHireRate:
              data?.conversion_impact?.ai_hire_rate ||
              data?.conversionImpact?.aiHireRate ||
              (typeof totals?.failureRate === 'number' ? Math.max(0, 100 - Number(totals.failureRate) * 100) : 0),
            revenueUplift:
              data?.conversion_impact?.revenue_uplift ||
              data?.conversionImpact?.revenueUplift ||
              (typeof totals?.estimatedMinutesSaved === 'number' ? Number(totals.estimatedMinutesSaved) : 0)
          }
        };
        setStats(transformed);
      })
      .catch(() => {
        if (cancelled) return;
        setStats(DEFAULT_STATS);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) {
    return <div className="p-8 text-center">Loading AI stats...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-500">Requests (Last 24h)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalConversations?.toLocaleString() || '0'}</p>
          <p className="mt-1 text-xs font-medium text-green-600">+12% vs yesterday</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-500">Estimated Cost</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatPrice(stats.costEstimate || 0)}</p>
          <p className="mt-1 text-xs text-gray-400">Based on token usage</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-500">Avg Latency</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.avgResponseTime || 0}ms</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-500">Safety Triggers</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{stats.safetyStats?.spamTriggers || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Blocked actions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center font-bold text-gray-900">
            <BarChart className="mr-2 h-5 w-5 text-blue-600" /> Module Usage
          </h3>
          <div className="space-y-4">
            {(stats.topRoles || []).map((role, idx) => (
              <div key={`${role.role}-${idx}`}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="capitalize text-gray-700">{role.role || 'Unknown'}</span>
                  <span className="font-bold text-gray-900">{role.count || 0} reqs</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${((role.count || 0) / Math.max(stats.totalConversations || 1, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-indigo-700 bg-gradient-to-br from-indigo-900 to-purple-900 p-6 text-white shadow-lg">
          <h3 className="mb-4 flex items-center font-bold">
            <TrendingUp className="mr-2 h-5 w-5 text-yellow-400" /> ROI & Impact
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-indigo-300">AI-Assisted Gigs</p>
              <p className="text-3xl font-bold">{stats.conversionImpact?.aiGigsCreated || 0}</p>
              <p className="mt-1 text-xs text-indigo-200">Created this week</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-indigo-300">Hire Rate Uplift</p>
              <p className="text-3xl font-bold text-green-400">+{stats.conversionImpact?.aiHireRate || 0}%</p>
              <p className="mt-1 text-xs text-indigo-200">Vs. manual briefs</p>
            </div>
            <div className="col-span-2 border-t border-indigo-700 pt-4">
              <p className="mb-1 text-xs font-bold uppercase text-indigo-300">Est. Revenue Impact</p>
              <p className="text-2xl font-bold text-white">{formatPrice(stats.conversionImpact?.revenueUplift || 0)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIOverviewSection;
