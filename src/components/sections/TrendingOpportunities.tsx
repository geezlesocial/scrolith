import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
// Import ForecastingService correctly, assuming it's in the right location and uses VITE_API_URL internally
import { ForecastingService } from '../../services/ai/forecasting.service';
import { TrendingOppsContent } from '../../types';

const TrendingOpportunities = ({ content }: { content?: TrendingOppsContent }) => {
    const [forecasts, setForecasts] = useState<any[]>([]);

    useEffect(() => {
        // Use ForecastingService which should handle API calls correctly
        ForecastingService.getForecasts()
            .then(data => setForecasts(Array.isArray(data) ? data.slice(0, 3) : []))
            .catch(error => {
                 console.error("Error fetching forecasts in TrendingOpportunities:", error);
                 // Set fallback data if API fails
                 setForecasts([]);
            });
    }, []);

    if (forecasts.length === 0) {
        return null; // Or render a fallback UI
    }

    return (
        <div className="py-16 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
                    <TrendingUp className="w-6 h-6 mr-2 text-red-500" /> {content?.title || 'Live Market Trends'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {forecasts.map((item, idx) => (
                        <div key={item.id || idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group">
                            <div className="flex justify-between items-start mb-4">
                                <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold uppercase">Hot</span>
                                <span className="text-green-600 font-bold text-sm flex items-center">
                                    <TrendingUp className="w-3 h-3 mr-1" /> +{item.growthRate || 0}%
                                </span>
                            </div>
                            <h3 className="font-bold text-lg text-gray-900 mb-1 group-hover:text-blue-600 transition">{item.skill || 'Skill Name'}</h3>
                            <p className="text-sm text-gray-500 mb-4">{item.category || 'Category'}</p>
                            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                <span className="text-xs text-gray-400 uppercase font-bold">Avg. Rate</span>
                                <span className="font-bold text-gray-900">{item.recommendedPriceRange || '$0.00'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TrendingOpportunities;