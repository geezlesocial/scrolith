
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { AdCampaign } from '../types';

const AdCard = ({ ad }: { ad: AdCampaign }) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative group">
            <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm z-10 uppercase tracking-wide font-bold">
                Sponsored
            </div>
            {ad.creativeUrl && (
                <div className="h-48 overflow-hidden bg-gray-100">
                    <img src={ad.creativeUrl} alt={ad.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
            )}
            <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h4 className="font-bold text-gray-900">{ad.title}</h4>
                        <p className="text-xs text-gray-500">{ad.clientName}</p>
                    </div>
                    <a 
                        href={ad.targetUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AdCard;
