import React from 'react';
import { Award, Star, TrendingUp, Shield } from 'lucide-react';

interface ReputationBadgeProps {
  score: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ReputationBadge: React.FC<ReputationBadgeProps> = ({ 
  score, 
  showScore = true, 
  size = 'sm',
  className = '' 
}) => {
  // Determine reputation tier based on score
  const getTier = (score: number) => {
    if (score >= 10000) return { name: 'Elite', color: 'purple', icon: Shield };
    if (score >= 5000) return { name: 'Expert', color: 'blue', icon: Award };
    if (score >= 2000) return { name: 'Pro', color: 'green', icon: Star };
    if (score >= 500) return { name: 'Rising', color: 'yellow', icon: TrendingUp };
    return { name: 'New', color: 'gray', icon: Star };
  };

  const tier = getTier(score);
  const Icon = tier.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  const colorClasses = {
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200'
  };

  return (
    <span 
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${sizeClasses[size]} ${colorClasses[tier.color as keyof typeof colorClasses]} ${className}`}
      title={`Reputation: ${score} points (${tier.name})`}
    >
      <Icon className={`${size === 'sm' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4'}`} />
      {showScore && <span>{score}</span>}
      {!showScore && <span className="sr-only">{tier.name}</span>}
    </span>
  );
};

export default ReputationBadge;
