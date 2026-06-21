
import React, { useEffect, useState } from 'react';
import { CommunityService } from '../../services/community';
import { CommunityAnalytics } from '../../types';
import { BarChart2, Activity, Users, ShieldAlert, MessageSquare, TrendingUp, AlertOctagon } from 'lucide-react';

const CommunityAnalytics = () => {
    const [data, setData] = useState<CommunityAnalytics | null>(null);

    useEffect(() => {
        CommunityService.getCommunityAnalytics().then(setData);
    }, []);

    if (!data) return <div className="p-8 text-center text-gray-500">Loading Analytics...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            <h2 className="text-xl font-bold text-gray-900">Community Health & Analytics</h2>

            {/* Top KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Health Score" value={data.healthScore} icon={Activity} color="green" suffix="/100" />
                <StatCard title="Active Users" value={data.activeUsers} icon={Users} color="blue" />
                <StatCard title="Messages Today" value={data.messagesToday} icon={MessageSquare} color="purple" />
                <StatCard title="AI Flags" value={data.aiFlaggedCount} icon={ShieldAlert} color="red" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Engagement Graph Placeholder */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" /> Engagement Trend (7 Days)
                    </h3>
                    <div className="h-64 flex items-end justify-between px-4 gap-2">
                        {data.engagementTrend.map((val, i) => (
                            <div key={i} className="w-full bg-indigo-50 rounded-t-lg relative group">
                                <div className="absolute bottom-0 w-full bg-indigo-500 rounded-t-lg transition-all duration-500" style={{ height: `${val}%` }}></div>
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {val}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* AI & Toxicity */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <AlertOctagon className="w-5 h-5 mr-2 text-red-600" /> Toxicity & Safety
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">Overall Toxicity Score</span>
                                <span className="font-bold text-gray-900">{data.toxicityScore}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${data.toxicityScore * 10}%` }}></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Based on AI sentiment analysis of all public messages.</p>
                        </div>

                        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                            <h4 className="font-bold text-red-800 text-sm mb-2">Recent Flags</h4>
                            <ul className="space-y-2 text-xs text-red-700">
                                <li>• User u-223 posted potential phishing link</li>
                                <li>• High velocity spam detected in #general</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Channels */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h3 className="font-bold text-gray-900">Top Channels by Activity</h3>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-6 py-3">Channel Name</th>
                            <th className="px-6 py-3">Activity Score</th>
                            <th className="px-6 py-3 text-right">Trend</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.topChannels.map((ch, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{ch.name}</td>
                                <td className="px-6 py-4">{ch.activity}</td>
                                <td className="px-6 py-4 text-right text-green-600 font-bold">+12%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon: Icon, color, suffix = '' }: any) => {
    const colors: any = {
        green: 'bg-green-100 text-green-600',
        blue: 'bg-blue-100 text-blue-600',
        purple: 'bg-purple-100 text-purple-600',
        red: 'bg-red-100 text-red-600'
    };
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-start justify-between">
            <div>
                <p className="text-xs font-bold text-gray-500 uppercase">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}{suffix}</h3>
            </div>
            <div className={`p-3 rounded-lg ${colors[color]}`}>
                <Icon className="w-6 h-6" />
            </div>
        </div>
    );
};

export default CommunityAnalytics;
