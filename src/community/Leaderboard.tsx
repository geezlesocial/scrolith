
import React, { useState, useEffect } from 'react';
import { CommunityService } from '../services/community';
import { LeaderboardEntry } from '../types';
import { Trophy, TrendingUp, TrendingDown, Minus, Medal, Filter, Search } from 'lucide-react';
import ReputationBadge from '../components/ReputationBadge';

const Leaderboard = () => {
    const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all-time'>('monthly');
    const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
    const [category, setCategory] = useState('All');

    useEffect(() => {
        CommunityService.getLeaderboard(period).then(setLeaders);
    }, [period]);

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="w-6 h-6 text-yellow-500" />;
        if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
        if (rank === 3) return <Medal className="w-6 h-6 text-orange-400" />;
        return <span className="text-gray-500 font-bold w-6 text-center">{rank}</span>;
    };

    const getTrendIcon = (trend: string) => {
        if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
        if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
        return <Minus className="w-4 h-4 text-gray-400" />;
    };

    return (
        <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Top Contributors</h1>
                <p className="text-gray-500">Recognizing the most helpful members of our community.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Controls */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                        {['weekly', 'monthly', 'all-time'].map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p as any)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                                    period === p ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {p.replace('-', ' ')}
                            </button>
                        ))}
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-48">
                            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <select 
                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-indigo-500"
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                            >
                                <option>All Categories</option>
                                <option>Development</option>
                                <option>Design</option>
                                <option>Marketing</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Rank</th>
                            <th className="px-6 py-4">Contributor</th>
                            <th className="px-6 py-4 text-center">Reputation</th>
                            <th className="px-6 py-4 text-center">Contributions</th>
                            <th className="px-6 py-4 text-right">Trend</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {leaders.map((user) => (
                            <tr key={user.userId} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center w-8 h-8 bg-gray-50 rounded-full border border-gray-200">
                                        {getRankIcon(user.rank)}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <img src={user.userAvatar} className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm" />
                                        <div>
                                            <div className="font-bold text-gray-900">{user.userName}</div>
                                            <div className="text-xs text-gray-500">{user.category}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <ReputationBadge score={user.score} />
                                </td>
                                <td className="px-6 py-4 text-center font-mono text-gray-600">
                                    {user.contributions}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end items-center">
                                        {getTrendIcon(user.trend)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Leaderboard;
