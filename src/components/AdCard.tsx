
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { AdCampaign } from '../types';
import DonateButton from './DonateButton';

const AdCard = ({ ad, showDonate = false }: { ad: AdCampaign; showDonate?: boolean }) => {
    const statusMap: Record<string, { label: string; cls: string }> = {
        draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
        awaiting_payment: { label: 'Awaiting Payment', cls: 'bg-yellow-100 text-yellow-800' },
        awaitingpayment: { label: 'Awaiting Payment', cls: 'bg-yellow-100 text-yellow-800' },
        submitted_for_review: { label: 'Submitted', cls: 'bg-indigo-100 text-indigo-800' },
        submitted: { label: 'Submitted', cls: 'bg-indigo-100 text-indigo-800' },
        approved: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
        active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
        paused: { label: 'Paused', cls: 'bg-gray-50 text-gray-700' },
        rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
        ended: { label: 'Ended', cls: 'bg-gray-50 text-gray-700' }
    };
    const st = String(ad.status || '').toLowerCase();
    const badge = statusMap[st] || { label: String(ad.status || '').toUpperCase(), cls: 'bg-gray-100 text-gray-700' };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative group">
            <div className="absolute top-2 right-2 z-10 flex gap-2 items-center">
                <div className="bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm uppercase tracking-wide font-bold">Sponsored</div>
                <div className={`text-[10px] px-2 py-0.5 rounded font-semibold ${badge.cls}`}>{badge.label}</div>
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
                    <div className="flex items-center gap-2">
                        {showDonate && ad.creatorId && (
                            <DonateButton recipientIdentifier={ad.creatorId} />
                        )}
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
        </div>
    );
};

export default AdCard;
