// src/dashboard/admin/Overview.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Clock, DollarSign, Lock, PieChart, Users } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { WalletService } from '../../services/wallet';
import { PlatformFinancials } from '../../types';
import { useSocket } from '../../context/SocketContext';

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, change, icon: Icon, color }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  };
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        {change && (
          <p className={`text-xs font-medium mt-1 ${change.includes('+') ? 'text-green-600' : 'text-gray-500'}`}>
            {change}
          </p>
        )}
      </div>
      <div className={`p-3 rounded-lg ${colors[color] || 'bg-gray-100 text-gray-600'}`}>
        <Icon size={24} />
      </div>
    </div>
  );
};

const DollarSignIcon = DollarSign;
const LockIcon = Lock;
const ClockIcon = Clock;
const UsersIcon = Users;
const ActivityIcon = Activity;
const PieChartIcon = PieChart;

type ActivityRecord = {
  date: string;
  messages: number;
  newUsers: number;
  orders: number;
};

const lineChartKeys: (keyof ActivityRecord)[] = ['messages', 'newUsers', 'orders'];
const lineChartColors: Record<string, string> = {
  messages: '#3b82f6',
  newUsers: '#10b981',
  orders: '#f97316'
};
const lineChartLabels: Record<string, string> = {
  messages: 'Messages',
  newUsers: 'New Users',
  orders: 'Orders'
};

const LineGraph: React.FC<{ data: ActivityRecord[] }> = ({ data }) => {
  const width = 520;
  const height = 220;
  const padding = 24;
  const effectiveHeight = height - padding * 2;
  const effectiveWidth = width - padding * 2;
  const totalValues = data.flatMap((row) => lineChartKeys.map((key) => Math.max(0, row[key] || 0)));
  const maxValue = Math.max(1, ...totalValues);
  const steps = Math.max(data.length - 1, 1);
  const getX = (index: number) => padding + (effectiveWidth / steps) * index;
  const getY = (value: number) => height - padding - (value / maxValue) * effectiveHeight;
  const describeLine = (key: keyof ActivityRecord) =>
    data
      .map((row, index) => {
        const x = getX(index);
        const y = getY(row[key] || 0);
        return `${index === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <rect x="0" y="0" width={width} height={height} fill="none" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
        {lineChartKeys.map((key) => (
          <path
            key={key}
            d={describeLine(key)}
            fill="none"
            stroke={lineChartColors[key]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {data.map((row, index) =>
          lineChartKeys.map((key) => {
            const x = getX(index);
            const y = getY(row[key] || 0);
            return (
              <circle
                key={`${key}-${row.date}-${index}`}
                cx={x}
                cy={y}
                r={3}
                fill={lineChartColors[key]}
                stroke="#fff"
                strokeWidth={1}
              />
            );
          })
        )}
      </svg>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
        {lineChartKeys.map((key) => (
          <div key={key} className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineChartColors[key] }} />
            <span>{lineChartLabels[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const polarToCartesian = (cx: number, cy: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
};

const describeArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
};

const pieColors = ['#10b981', '#6366f1', '#f97316', '#0b0b0a'];

const PieGraph: React.FC<{
  data: { name: string; value: number }[];
  formatter?: (value: number) => string;
}> = ({ data, formatter }) => {
  const width = 240;
  const height = 240;
  const radius = Math.min(width, height) / 2 - 24;
  const centerX = width / 2;
  const centerY = height / 2;
  const total = data.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);

  if (total <= 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-500">
        Revenue breakdown is not available yet.
      </div>
    );
  }

  let startAngle = 0;
  const segments = data.map((entry, index) => {
    const value = Math.max(0, entry.value);
    const sweep = (value / total) * 360;
    const segment = {
      startAngle,
      endAngle: startAngle + sweep,
      color: pieColors[index % pieColors.length],
      name: entry.name,
      value,
      percentage: total === 0 ? 0 : Math.round((value / total) * 100)
    };
    startAngle += sweep;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {segments.map((segment, index) => (
          <path
            key={`slice-${index}`}
            d={describeArc(centerX, centerY, radius, segment.startAngle, segment.endAngle)}
            fill={segment.color}
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="grid w-full grid-cols-2 gap-2 text-sm text-gray-600">
        {segments.map((segment, index) => (
          <div key={`legend-${index}`} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: segment.color }} />
              <span className="font-medium text-gray-900 truncate">{segment.name}</span>
            </div>
            <div className="text-xs text-gray-500">
              {formatter ? formatter(segment.value) : segment.value.toLocaleString()} · {segment.percentage}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Overview: React.FC = () => {
    const { formatPrice } = useCurrency();
    const { socket } = useSocket();
    const [financials, setFinancials] = useState<PlatformFinancials | null>(null);
    const [activityData, setActivityData] = useState<{ date: string; messages: number; newUsers: number; orders: number }[]>([]);
    const [revenueData, setRevenueData] = useState<{ name: string; value: number }[]>([]);

    const loadOverviewData = useCallback(async () => {
      try {
        setFinancials(null);
        setActivityData([]);
        setRevenueData([]);
        const [fin, activity, revenue] = await Promise.all([
          WalletService.getPlatformFinancials(),
          WalletService.getActivityMetrics(7),
          WalletService.getRevenueBreakdown(30)
        ]);
        setFinancials(fin);
        setActivityData(Array.isArray(activity) ? activity : []);
        setRevenueData(Array.isArray(revenue) ? revenue : []);
        setLoadError(null);
      } catch (err: any) {
        console.error('Failed to load admin overview data:', err);
        // Detect common auth/permission errors
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setLoadError('Admin analytics require an admin account. Log in as an admin or set your user role to ADMIN for local development.');
        } else {
          setLoadError('Failed to load analytics. Showing development fallback if available.');
        }

        // Dev fallback: show sample data in non-production for quicker iteration
        if (import.meta.env.MODE !== 'production') {
          const now = new Date();
          const sampleActivity = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(now);
            d.setDate(now.getDate() - (6 - i));
            return { date: d.toISOString().split('T')[0], messages: Math.floor(Math.random() * 40), newUsers: Math.floor(Math.random() * 10), orders: Math.floor(Math.random() * 6) };
          });
          const sampleRevenue = [
            { name: 'Gig commissions', value: 1245.25 },
            { name: 'Featured listings', value: 320.0 },
            { name: 'Ads', value: 120.5 }
          ];
          setActivityData(sampleActivity);
          setRevenueData(sampleRevenue);
        }
      }
    }, []);

    // Local state for load errors
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        loadOverviewData();
    }, [loadOverviewData]);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadOverviewData();
        socket.on('admin:financials_updated', refresh);
        socket.on('admin:activity_updated', refresh);
        socket.on('admin:revenue_updated', refresh);
        return () => {
            socket.off('admin:financials_updated', refresh);
            socket.off('admin:activity_updated', refresh);
            socket.off('admin:revenue_updated', refresh);
        };
    }, [socket, loadOverviewData]);

    useEffect(() => {
        if (socket) return;
        const id = window.setInterval(loadOverviewData, 30000);
        return () => window.clearInterval(id);
    }, [socket, loadOverviewData]);

    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
        {loadError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
            <div className="font-medium">{loadError}</div>
            <div className="mt-2">Suggestions:</div>
            <ul className="list-disc list-inside mt-1">
              <li>Make sure you're logged in as an admin.</li>
              <li>For local development run the backend seed script to populate sample analytics.</li>
              <li>Quick dev toggle: run in the browser console <code>const u=JSON.parse(localStorage.getItem('user')||'{}');u.role='ADMIN';localStorage.setItem('user',JSON.stringify(u));window.location.reload();</code></li>
            </ul>
          </div>
        )}
            {financials ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatsCard 
                      title="Total Revenue" 
                      value={formatPrice(financials.platformRevenue)} 
                      change="+12.5%" 
                      icon={DollarSignIcon} 
                      color="green" 
                    />
                    <StatsCard 
                      title="Escrow Balance" 
                      value={formatPrice(financials.totalEscrow)} 
                      change="Active Funds" 
                      icon={LockIcon} 
                      color="purple" 
                    />
                    <StatsCard 
                      title="Pending Clearance" 
                      value={formatPrice(financials.totalPendingClearance)} 
                      change="In Transit" 
                      icon={ClockIcon} 
                      color="yellow" 
                    />
                    <StatsCard 
                      title="Available to Users" 
                      value={formatPrice(financials.totalClearedUserFunds)} 
                      change="Liabilities" 
                      icon={UsersIcon} 
                      color="blue" 
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse"></div>
                    ))}
                </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <ActivityIcon size={20} />
                        <span className="ml-2">Platform Activity</span>
                    </h3>
                    {activityData.length === 0 ? (
                        <div className="h-64 bg-gray-50 flex items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                            No activity data available
                        </div>
                    ) : (
                        <LineGraph data={activityData} />
                    )}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <PieChartIcon size={20} />
                        <span className="ml-2">Revenue Breakdown</span>
                    </h3>
                    {revenueData.length === 0 ? (
                        <div className="h-64 bg-gray-50 flex items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                            No revenue data available
                        </div>
                    ) : (
                        <PieGraph data={revenueData} formatter={(value) => formatPrice(value)} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Overview;
