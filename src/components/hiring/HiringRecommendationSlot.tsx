import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import HiringRecommendationCard from './HiringRecommendationCard';
import { HiringRecommendationsService, type HiringRecommendation, type HiringRecommendationAccountType } from '../../services/hiringRecommendations';

const MEMBER_HOME_PATHS = new Set(['/','/home','/member-home','/m','/m/home']);
const normalizePath = (path: string) => (String(path || '').replace(/\/+$/, '') || '/');
const resolveAccountType = (role: unknown): HiringRecommendationAccountType | null => {
  const value = String(role || '').toLowerCase();
  if (value.includes('freelancer') || value.includes('seller')) return 'FREELANCER';
  if (value.includes('employer') || value.includes('client')) return 'CLIENT';
  return null;
};

const HiringRecommendationSlot: React.FC = () => {
  const { user, activeRole, isAuthenticated } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const accountType = useMemo(() => resolveAccountType(activeRole || user?.role), [activeRole, user?.role]);
  const [recommendation, setRecommendation] = useState<HiringRecommendation | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    setVisible(false);
    setRecommendation(null);
    if (!isAuthenticated || !user?.id || !accountType || !MEMBER_HOME_PATHS.has(normalizePath(location.pathname))) return () => { mounted = false; };
    let timer: number | null = null;
    HiringRecommendationsService.get(accountType).then((next) => {
      if (!mounted || !next?.eligible) return;
      setRecommendation(next);
      const delay = Math.max(0, Math.min(300, Number(next.delaySeconds || 0))) * 1000;
      timer = window.setTimeout(() => { if (mounted) setVisible(true); }, delay);
    }).catch(() => undefined);
    return () => { mounted = false; if (timer !== null) window.clearTimeout(timer); };
  }, [accountType, isAuthenticated, location.pathname, user?.id]);

  useEffect(() => {
    if (!visible || !recommendation) return;
    void HiringRecommendationsService.impression(recommendation.accountType).catch(() => undefined);
  }, [visible, recommendation]);

  if (!visible || !recommendation) return null;
  const dismiss = () => {
    setVisible(false);
    void HiringRecommendationsService.dismiss(recommendation.accountType).catch(() => undefined);
  };
  const activate = () => {
    setVisible(false);
    void HiringRecommendationsService.click(recommendation.accountType).catch(() => undefined);
    navigate(recommendation.accountType === 'FREELANCER' ? '/freelancer/dashboard?tab=profile&as=freelancer' : '/freelancer/dashboard?tab=profile&as=employer');
  };
  return <HiringRecommendationCard recommendation={recommendation} onPrimary={activate} onDismiss={dismiss} />;
};

export default HiringRecommendationSlot;
