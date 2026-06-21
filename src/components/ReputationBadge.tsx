
import React from 'react';
import { Shield, Star, Award, Zap } from 'lucide-react';

interface ReputationBadgeProps {
    score: number;
    level?: string;
    showScore?: boolean;
}

const ReputationBadge: React.FC<ReputationBadgeProps> = ({ score, level, showScore = true }) => {
    let color = 'bg-gray-100 text-gray-600';
    let Icon = Shield;
    let label = level || 'Neutral';

    if (score >= 900) {
        color = 'bg-purple-100 text-purple-700 border-purple-200';
        Icon = Award;
        label = 'Community Pro';
    } else if (score >= 700) {
        color = 'bg-blue-100 text-blue-700 border-blue-200';
        Icon = Star;
        label = 'Expert';
    } else if (score >= 400) {
        color = 'bg-green-100 text-green-700 border-green-200';
        Icon = Zap;
        label = 'Trusted';
    }

    return (
        <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
            <Icon className="w-3 h-3 mr-1" />
            <span>{label}</span>
            {showScore && <span className="ml-1 opacity-75">({score})</span>}
        </div>
    );
};

export default ReputationBadge;
