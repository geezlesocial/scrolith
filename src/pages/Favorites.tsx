
import React, { useState } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { MOCK_GIGS, MOCK_JOBS } from '../constants';
import { useCurrency } from '../context/CurrencyContext';
import GigCard from '../components/GigCard';
import { Link } from 'react-router-dom';
import { Heart, Search, Filter } from 'lucide-react';

const Favorites = () => {
    const { favorites, toggleFavorite } = useFavorites();
    const { formatPrice } = useCurrency();
    const [activeTab, setActiveTab] = useState<'gigs' | 'jobs'>('gigs');

    // Filter mock data based on favorite IDs
    const savedGigs = MOCK_GIGS.filter(g => favorites.includes(g.id));
    const savedJobs = MOCK_JOBS.filter(j => favorites.includes(j.id));

    return (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center mb-8">
                    <Heart className="w-8 h-8 text-red-500 mr-3 fill-current" />
                    <h1 className="text-3xl font-bold text-gray-900">My Favorites</h1>
                </div>

                {/* Tabs */}
                <div className="flex space-x-4 mb-8 border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('gigs')}
                        className={`pb-4 px-4 font-medium text-sm transition-colors relative ${activeTab === 'gigs' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Saved Gigs ({savedGigs.length})
                        {activeTab === 'gigs' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('jobs')}
                        className={`pb-4 px-4 font-medium text-sm transition-colors relative ${activeTab === 'jobs' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Saved Jobs ({savedJobs.length})
                        {activeTab === 'jobs' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
                    </button>
                </div>

                {/* Content */}
                <div className="animate-fade-in">
                    {activeTab === 'gigs' && (
                        savedGigs.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {savedGigs.map(gig => (
                                    <div key={gig.id} className="relative group">
                                        <GigCard gig={gig} />
                                        <button 
                                            onClick={() => toggleFavorite(gig.id)}
                                            className="absolute top-2 right-2 bg-white p-2 rounded-full shadow hover:bg-red-50 text-red-500 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remove from favorites"
                                        >
                                            <Heart className="w-4 h-4 fill-current" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState type="gigs" />
                        )
                    )}

                    {activeTab === 'jobs' && (
                        savedJobs.length > 0 ? (
                            <div className="space-y-4">
                                {savedJobs.map(job => (
                                    <div key={job.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition flex justify-between items-start relative group">
                                        <Link to={`/jobs/${job.id}`} className="flex-1">
                                            <h3 className="font-bold text-lg text-gray-900 mb-1">{job.title}</h3>
                                            <div className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                                                <span>{job.clientName}</span>
                                                <span>•</span>
                                                <span className="font-medium text-green-600">{job.budget}</span>
                                                <span>•</span>
                                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{job.type}</span>
                                            </div>
                                            <p className="text-gray-600 text-sm line-clamp-2">{job.description}</p>
                                        </Link>
                                        <button 
                                            onClick={() => toggleFavorite(job.id)}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"
                                            title="Remove from favorites"
                                        >
                                            <Heart className="w-5 h-5 fill-current" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState type="jobs" />
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

const EmptyState = ({ type }: { type: string }) => (
    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-gray-300" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">No saved {type} yet</h3>
        <p className="text-gray-500 mb-6">Browse the marketplace and click the heart icon to save items for later.</p>
        <Link to={type === 'gigs' ? '/browse' : '/browse-jobs'} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition">
            Browse {type === 'gigs' ? 'Talent' : 'Jobs'}
        </Link>
    </div>
);

export default Favorites;
