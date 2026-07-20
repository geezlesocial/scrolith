import React from 'react';
import { Globe, Lock, Shield, Users } from 'lucide-react';
import { communityRadius } from '../../design/communityTokens';

type BadgeVariant = 'public' | 'private' | 'joined' | 'pending' | 'role' | 'category' | 'official';

const styles: Record<BadgeVariant, string> = {
  public: 'bg-sky-50 text-sky-700 ring-sky-100',
  private: 'bg-slate-100 text-slate-700 ring-slate-200',
  joined: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  pending: 'bg-amber-50 text-amber-800 ring-amber-100',
  role: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  category: 'bg-violet-50 text-violet-700 ring-violet-100',
  official: 'bg-cyan-50 text-cyan-800 ring-cyan-100'
};

const CommunityBadge: React.FC<{
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: 'public' | 'private' | 'role' | 'members' | null;
  className?: string;
}> = ({ variant = 'category', children, icon = null, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 ${communityRadius.chip} px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles[variant]} ${className}`}
  >
    {icon === 'public' ? <Globe className="h-3 w-3" aria-hidden /> : null}
    {icon === 'private' ? <Lock className="h-3 w-3" aria-hidden /> : null}
    {icon === 'role' ? <Shield className="h-3 w-3" aria-hidden /> : null}
    {icon === 'members' ? <Users className="h-3 w-3" aria-hidden /> : null}
    {children}
  </span>
);

export default CommunityBadge;
