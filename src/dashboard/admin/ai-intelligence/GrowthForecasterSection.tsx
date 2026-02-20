import React, { useEffect, useMemo, useState } from 'react';
import { AdminService } from '../../../services/admin';
import type { GrowthForecast } from '../../../types';
import { useCurrency } from '../../../context/CurrencyContext';

const GrowthForecasterSection: React.FC = () => {
  const [data, setData] = useState<GrowthForecast[]>([]);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    AdminService.getGrowthForecast()
      .then((rows) => {
        if (cancelled) return;
        setData(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setData([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { maxRevenue, maxSubs } = useMemo(() => {
    const revenueMax = Math.max(0, ...data.map((item) => Number(item.revenue || 0)));
    const subsMax = Math.max(0, ...data.map((item) => Number(item.subscribers || 0)));
    return {
      maxRevenue: Math.max(revenueMax, 1),
      maxSubs: Math.max(subsMax, 1)
    };
  }, [data]);

  const lastPoint = data[data.length - 1];

  return (
    <div className="space-y-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Platform Growth Forecast</h3>
        <div className="flex gap-4 text-xs font-bold">
          <span className="flex items-center">
            <span className="mr-2 h-3 w-3 rounded-full bg-blue-500" />
            Revenue
          </span>
          <span className="flex items-center">
            <span className="mr-2 h-3 w-3 rounded-full bg-green-500" />
            Subscribers
          </span>
          <span className="flex items-center">
            <span className="mr-2 h-3 w-3 rounded-full bg-gray-300" />
            Predicted
          </span>
        </div>
      </div>

      <div className="relative flex h-64 items-end space-x-4 border-b border-gray-100 px-4 pb-2">
        {data.map((point, i) => (
          <div key={`${point.date}-${i}`} className="group relative flex flex-1 flex-col justify-end">
            <div
              className={`mb-1 w-full rounded-t opacity-80 transition-all hover:opacity-100 ${point.source === 'predicted' ? 'bg-blue-300' : 'bg-blue-600'}`}
              style={{ height: `${(Number(point.revenue || 0) / maxRevenue) * 80}%` }}
            />
            <div
              className={`mx-auto w-1/2 rounded-t transition-all ${point.source === 'predicted' ? 'bg-green-300' : 'bg-green-500'}`}
              style={{ height: `${(Number(point.subscribers || 0) / maxSubs) * 40}%` }}
            />

            <div className="mt-2 truncate text-center text-[10px] text-gray-400">
              {new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </div>

            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-32 -translate-x-1/2 rounded bg-gray-900 p-2 text-center text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
              <div className="font-bold">{new Date(point.date).toLocaleDateString()}</div>
              <div>Rev: {formatPrice(point.revenue)}</div>
              <div>Subs: {point.subscribers}</div>
              <div className="mt-1 text-[9px] uppercase text-gray-400">{point.source}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 pt-4">
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="mb-1 text-xs font-bold uppercase text-blue-600">Predicted Revenue (Next 30d)</p>
          <p className="text-2xl font-bold text-blue-900">{formatPrice(lastPoint?.revenue || 0)}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-4">
          <p className="mb-1 text-xs font-bold uppercase text-green-600">Predicted Subscribers</p>
          <p className="text-2xl font-bold text-green-900">{(lastPoint?.subscribers || 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default GrowthForecasterSection;
