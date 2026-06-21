
import React from 'react';
import { Zap } from 'lucide-react';
import { MarketInsightsContent } from '../../types';

const MarketplaceInsights = ({ content }: { content?: MarketInsightsContent }) => {
    // Mock trends
    const trends = ['Voice AI', 'Rust', 'SaaS Design', 'SEO Writing', 'Video Ads', 'No-Code Apps'];

    return (
        <div className="py-16 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-gray-100 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{content?.title || "What's Hot Right Now"}</h2>
                        <p className="text-gray-500 text-sm mt-1">Based on real-time search volume across {content?.regions?.join(', ') || "Global Markets"}</p>
                    </div>
                    <div className="flex space-x-2 mt-4 md:mt-0">
                        {(content?.regions || ['Global', 'US', 'EU']).map(r => (
                            <span key={r} className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-600 uppercase tracking-wide">{r}</span>
                        ))}
                    </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {trends.map((tag, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 hover:bg-white hover:shadow-md transition-all rounded-xl border border-gray-100 group cursor-default">
                            <span className="font-medium text-gray-700 group-hover:text-blue-600">{tag}</span>
                            <Zap className="w-4 h-4 text-yellow-500 fill-current opacity-50 group-hover:opacity-100 transition-opacity" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MarketplaceInsights;
