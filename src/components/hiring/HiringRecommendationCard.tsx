import { BriefcaseBusiness, CheckCircle2, Code2, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import type { HiringRecommendation, HiringRecommendationAccountType } from '../../services/hiringRecommendations';

type Props = {
  recommendation: HiringRecommendation;
  onPrimary: () => void;
  onDismiss: () => void;
  preview?: boolean;
};

const HiringRecommendationCard: React.FC<Props> = ({ recommendation, onPrimary, onDismiss, preview = false }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const isFreelancer = recommendation.accountType === 'FREELANCER';
  useEffect(() => {
    if (!preview) closeRef.current?.focus();
  }, [preview]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="hiring-recommendation-title"
      aria-describedby="hiring-recommendation-description"
      className="fixed inset-x-3 bottom-3 z-[70] sm:left-auto sm:right-6 sm:max-w-md"
      data-testid="hiring-recommendation"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-black/5">
        <div className={`h-1 ${isFreelancer ? 'bg-emerald-500' : 'bg-blue-600'}`} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isFreelancer ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
              {isFreelancer ? <Code2 aria-hidden="true" size={22} /> : <BriefcaseBusiness aria-hidden="true" size={22} />}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss hiring recommendation"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Scrolitha guidance</p>
          <h2 id="hiring-recommendation-title" className="mt-1 text-lg font-semibold text-slate-950">{recommendation.title}</h2>
          <p id="hiring-recommendation-description" className="mt-2 text-sm leading-6 text-slate-600">{recommendation.description}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />Get discovered by relevant people on Scrolith</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />Keep control of your public professional status</li>
          </ul>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={onPrimary} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{recommendation.ctaLabel}</button>
            <button type="button" onClick={onDismiss} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{recommendation.secondaryLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const buildHiringRecommendationPreview = (accountType: HiringRecommendationAccountType): HiringRecommendation => ({
  eligible: true,
  accountType,
  recommendation: accountType === 'FREELANCER' ? 'AVAILABLE_FOR_HIRE' : 'WE_ARE_HIRING',
  title: accountType === 'FREELANCER' ? "You're ready for new work" : 'Are you looking for talent?',
  description: accountType === 'FREELANCER' ? 'Let people on Scrolith know you are available for freelance projects and new opportunities.' : 'Let skilled professionals on Scrolith know that your team is currently hiring.',
  ctaLabel: accountType === 'FREELANCER' ? 'Turn On Available for Hire' : 'Turn On We Are Hiring',
  secondaryLabel: 'Not Now',
  delaySeconds: 0
});

export default HiringRecommendationCard;
