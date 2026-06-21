
import React from 'react';
import { Star, CheckCircle, Shield } from 'lucide-react';
import { MOCK_GIGS } from '../../constants';
import GigCard from '../GigCard';
import { TopProServicesContent } from '../../types';
import { Link } from 'react-router-dom';

const TopProServices = ({ content }: { content?: TopProServicesContent }) => {
    // Filter gigs with high ratings as "Pro"
    const proGigs = MOCK_GIGS.filter(g => g.rating >= 4.8).slice(0, content?.count || 4);

    return (
        <div className="py-20 bg-white border-t border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-end mb-10">
                    <div>
                        <div className="flex items-center text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">
                            <Star className="w-4 h-4 mr-2 fill-current" /> Premium Talent
                        </div>
                        <h2 className="text-3xl font-extrabold text-gray-900">
                            {content?.title || "Top Rated Pro Services"}
                        </h2>
                    </div>
                    <Link to="/browse?filter=pro" className="hidden md:inline-flex items-center font-bold text-indigo-600 hover:text-indigo-700 transition">
                        View All Pro Gigs <CheckCircle className="w-4 h-4 ml-2" />
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {proGigs.map((gig) => (
                        <div key={gig.id} className="relative">
                            <div className="absolute -top-3 -right-3 z-10 bg-black text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center">
                                <Shield className="w-3 h-3 mr-1 text-yellow-400" /> PRO
                            </div>
                            <GigCard gig={gig} />
                        </div>
                    ))}
                </div>
                
                <div className="mt-10 text-center md:hidden">
                    <Link to="/browse?filter=pro" className="inline-block px-6 py-3 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition">
                        View All Pro Gigs
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default TopProServices;
