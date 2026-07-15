import React from 'react';
import { Bot, ShieldCheck } from 'lucide-react';
import { SCROLITHA_DISCLOSURE, SCROLITHA_SYSTEM_LABEL } from '../../utils/scrolithaIdentity';

type ScrolithaCommentBadgeProps = {
  classification?: string | null;
  confidence?: number | null;
  className?: string;
};

const labelForClassification = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/_/g, ' ');
};

const ScrolithaCommentBadge: React.FC<ScrolithaCommentBadgeProps> = ({
  classification,
  confidence,
  className = ''
}) => {
  const classificationLabel = labelForClassification(classification);
  const confidencePct =
    typeof confidence === 'number' && Number.isFinite(confidence)
      ? Math.round(Math.max(0, Math.min(1, confidence)) * 100)
      : null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-900"
        title={SCROLITHA_DISCLOSURE}
      >
        <Bot className="h-3 w-3" aria-hidden />
        {SCROLITHA_SYSTEM_LABEL}
      </span>
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
        title="Official Scrolitha platform identity"
      >
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Verified AI
      </span>
      {classificationLabel ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
          {classificationLabel}
          {confidencePct != null ? ` · ${confidencePct}%` : ''}
        </span>
      ) : null}
    </div>
  );
};

export default ScrolithaCommentBadge;
