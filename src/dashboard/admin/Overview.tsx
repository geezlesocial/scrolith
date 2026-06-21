
import React, { useEffect, useState } from 'react';
import { DollarSign, Users, Lock, Clock, Activity, PieChart, ShieldAlert } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { WalletService } from '../../services/wallet';
import { PlatformFinancials } from '../../types';

const StatsCard = ({ title, value, change, icon: Icon, color }: any) => {
  const colors: any = {
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
        {change && <p className={`text-xs font-medium mt-1 ${change.includes('+') ? 'text-green-600' : 'text-gray-500'}`}>{change}</p>}
      </div>
      <div className={`p-3 rounded-lg ${colors[color] || 'bg-gray-100 text-gray-600'}`}>
        <Icon size={24} />
      </div>
    </div>
  );
};

const Overview = () => {
    const { formatPrice } = useCurrency();
    const [financials, setFinancials] = useState<PlatformFinancials | null>(null);

    useEffect(() => {
        WalletService.getPlatformFinancials().then(setFinancials);
    }, []);

    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
            {financials ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatsCard title="Total Revenue" value={formatPrice(financials.platformRevenue)} change="+12.5%" icon={DollarSign} color="green" />
                    <StatsCard title="Escrow Balance" value={formatPrice(financials.totalEscrow)} change="Active Funds" icon={Lock} color="purple" />
                    <StatsCard title="Pending Clearance" value={formatPrice(financials.totalPendingClearance)} change="In Transit" icon={Clock} color="yellow" />
                    <StatsCard title="Available to Users" value={formatPrice(financials.totalClearedUserFunds)} change="Liabilities" icon={Users} color="blue" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse"></div>)}
                </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-600" /> Platform Activity
                    </h3>
                    <div className="h-64 bg-gray-50 flex items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                        Activity Chart Placeholder
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <PieChart className="w-5 h-5 mr-2 text-indigo-600" /> Revenue Breakdown
                    </h3>
                    <div className="h-64 bg-gray-50 flex items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                        Revenue Chart Placeholder
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Overview;
