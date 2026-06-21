
import React, { useState, useEffect } from 'react';
import { MOCK_GIGS } from '../../constants';
import { Gig } from '../../types';
import { useUser } from '../../context/UserContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import { Edit2, Eye, Trash2, PauseCircle, PlayCircle, BarChart2, Plus, MoreHorizontal } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

type GigStatusFilter = 'all' | 'active' | 'draft' | 'pending' | 'paused';

const MyGigs = () => {
    const { user } = useUser();
    const { formatPrice } = useCurrency();
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    
    const [gigs, setGigs] = useState<Gig[]>([]);
    const [filter, setFilter] = useState<GigStatusFilter>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate fetching gigs for current user
        if (user) {
            setTimeout(() => {
                // In real app, fetch from API. Here we filter MOCK_GIGS + add mock stats
                const userGigs = MOCK_GIGS.map(g => ({
                    ...g,
                    // Add random stats for demo
                    views: Math.floor(Math.random() * 500) + 50,
                    clicks: Math.floor(Math.random() * 100) + 10,
                    ordersCount: Math.floor(Math.random() * 20),
                    status: g.status as any // Ensure type compatibility
                }));
                setGigs(userGigs);
                setLoading(false);
            }, 500);
        }
    }, [user]);

    // Real-time view simulation
    useEffect(() => {
        const interval = setInterval(() => {
            setGigs(prev => prev.map(g => 
                Math.random() > 0.7 ? { ...g, views: (g.views || 0) + 1 } : g
            ));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleStatusChange = (id: string, newStatus: Gig['status']) => {
        setGigs(prev => prev.map(g => g.id === id ? { ...g, status: newStatus } : g));
        showNotification('success', 'Status Updated', `Gig is now ${newStatus}`);
    };

    const handleDelete = (id: string) => {
        if(confirm("Are you sure you want to delete this gig?")) {
            setGigs(prev => prev.filter(g => g.id !== id));
            showNotification('success', 'Deleted', 'Gig removed successfully.');
        }
    };

    const filteredGigs = gigs.filter(g => {
        if (filter === 'all') return true;
        if (filter === 'active') return g.status === 'active';
        if (filter === 'pending') return g.status === 'submitted'; // Map 'submitted' to pending view
        return g.status === filter;
    });

    if (loading) return <div className="p-12 text-center text-gray-500">Loading your gigs...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Manage Gigs</h1>
                <button 
                    onClick={() => navigate('/create-gig')}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-indigo-700 transition shadow-sm"
                >
                    <Plus className="w-4 h-4 mr-2" /> Create New Gig
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-6 overflow-x-auto">
                    {['all', 'active', 'pending', 'paused', 'draft'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab as GigStatusFilter)}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                                filter === tab
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            {tab} <span className="ml-1 text-xs bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full">{
                                tab === 'all' ? gigs.length : gigs.filter(g => 
                                    tab === 'pending' ? g.status === 'submitted' : g.status === tab
                                ).length
                            }</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Table View (Hidden on mobile) */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Gig</th>
                            <th className="px-6 py-4 text-center">Impressions</th>
                            <th className="px-6 py-4 text-center">Orders</th>
                            <th className="px-6 py-4 text-center">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredGigs.map(gig => (
                            <tr key={gig.id} className="hover:bg-gray-50 group transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <img src={gig.image} className="w-12 h-12 rounded-lg object-cover mr-4 border border-gray-200" alt={gig.title} />
                                        <div>
                                            <div className="font-bold text-gray-900 line-clamp-1">{gig.title}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">Starting at <span className="font-medium text-gray-900">{formatPrice(gig.price)}</span></div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="font-bold text-gray-900">{gig.views}</span>
                                        <span className="text-[10px] text-green-600 flex items-center font-medium">
                                            <BarChart2 className="w-3 h-3 mr-1" /> View Trend
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="font-bold text-gray-900">{gig.ordersCount}</div>
                                    <span className="text-xs text-gray-400">Total</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <StatusBadge status={gig.status} />
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => navigate(`/create-gig?id=${gig.id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-blue-600" title="Edit">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => navigate(`/gigs/${gig.id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600" title="Preview">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <div className="relative group/menu">
                                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>
                                            <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 py-1 hidden group-hover/menu:block z-10">
                                                {gig.status === 'active' ? (
                                                    <button onClick={() => handleStatusChange(gig.id, 'paused')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center text-yellow-600">
                                                        <PauseCircle className="w-3 h-3 mr-2" /> Pause
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleStatusChange(gig.id, 'active')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center text-green-600">
                                                        <PlayCircle className="w-3 h-3 mr-2" /> Activate
                                                    </button>
                                                )}
                                                <button onClick={() => handleDelete(gig.id)} className="w-full text-left px-4 py-2 text-xs hover:bg-red-50 flex items-center text-red-600">
                                                    <Trash2 className="w-3 h-3 mr-2" /> Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredGigs.length === 0 && (
                    <div className="p-12 text-center text-gray-400">No gigs found in this tab.</div>
                )}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {filteredGigs.map(gig => (
                    <div key={gig.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex gap-4 mb-3">
                            <img src={gig.image} className="w-16 h-16 rounded-lg object-cover" alt="" />
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900 line-clamp-1">{gig.title}</h4>
                                    <StatusBadge status={gig.status} />
                                </div>
                                <p className="text-sm text-gray-500 mt-1">{formatPrice(gig.price)}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-gray-100 mb-3 text-center">
                            <div>
                                <div className="text-lg font-bold text-gray-900">{gig.views}</div>
                                <div className="text-xs text-gray-500 uppercase">Views</div>
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900">{gig.ordersCount}</div>
                                <div className="text-xs text-gray-500 uppercase">Orders</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => navigate(`/create-gig?id=${gig.id}`)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Edit</button>
                            <button onClick={() => navigate(`/gigs/${gig.id}`)} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">Preview</button>
                            <button onClick={() => handleDelete(gig.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-5 h-5"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
        active: 'bg-green-100 text-green-700',
        submitted: 'bg-yellow-100 text-yellow-700',
        paused: 'bg-gray-100 text-gray-600',
        draft: 'bg-gray-100 text-gray-500 border border-gray-300',
        rejected: 'bg-red-100 text-red-700'
    };
    const label = status === 'submitted' ? 'Pending' : status;
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${(styles as any)[status] || styles.draft}`}>
            {label}
        </span>
    );
};

export default MyGigs;
