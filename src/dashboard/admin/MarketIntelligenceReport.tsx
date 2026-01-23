import React, { useEffect, useState } from 'react';
import { adminMarketIntelligence } from '@/services/adminMarketIntelligence';
import { useNotification } from '@/context/NotificationContext';
import { Loader2 } from 'lucide-react';

const MarketIntelligenceReport = () => {
  const [summary, setSummary] = useState<{ signalsScanned: number; summary: string; reportRoute: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await adminMarketIntelligence.getRadarSummary();
        setSummary(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load report');
        showNotification('alert', 'Report Error', err.message || 'Unable to load opportunity radar report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showNotification]);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Market Opportunity Report</h2>
      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="animate-spin" />
          Loading report…
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <p className="text-sm uppercase tracking-wide text-gray-500">Signals scanned</p>
          <p className="text-4xl font-semibold text-gray-900">{summary.signalsScanned.toLocaleString()}</p>
          <p className="text-gray-700 leading-relaxed">{summary.summary}</p>
          <p className="text-xs text-gray-500">Report route: {summary.reportRoute}</p>
        </div>
      )}
    </div>
  );
};

export default MarketIntelligenceReport;
