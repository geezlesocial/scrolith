import React from 'react';
import { CheckCircle } from 'lucide-react';
import { plainTextToHtml } from '../../utils/staticPageContent';
import { normalizeScrolithaResponseText } from './scrolithaResponseFormat';

type ScrolithaResponseCardProps = {
  title: string;
  label?: string;
  content: string;
  tone?: 'emerald' | 'indigo' | 'blue';
};

const toneStyles: Record<NonNullable<ScrolithaResponseCardProps['tone']>, { badge: string; ring: string; accent: string }> = {
  emerald: {
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    ring: 'ring-emerald-100',
    accent: 'text-emerald-700'
  },
  indigo: {
    badge: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    ring: 'ring-indigo-100',
    accent: 'text-indigo-700'
  },
  blue: {
    badge: 'text-blue-700 bg-blue-50 border-blue-200',
    ring: 'ring-blue-100',
    accent: 'text-blue-700'
  }
};

const ScrolithaResponseCard: React.FC<ScrolithaResponseCardProps> = ({
  title,
  label = 'Scrolitha Response',
  content,
  tone = 'indigo'
}) => {
  const styles = toneStyles[tone];
  const normalized = normalizeScrolithaResponseText(String(content || '').trim());
  const html = plainTextToHtml(normalized);

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ${styles.ring}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="space-y-1">
          <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
            <CheckCircle className={`h-3.5 w-3.5 ${styles.accent}`} />
            {label}
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="px-5 py-5">
        <div
          className="scrolitha-response prose prose-slate max-w-none prose-headings:mb-3 prose-headings:font-semibold prose-headings:text-slate-900 prose-h2:text-base prose-h2:tracking-normal prose-h3:text-sm prose-p:my-3 prose-p:text-slate-700 prose-p:leading-7 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-7 prose-strong:text-slate-900 text-slate-800 leading-7 whitespace-normal break-words"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};

export default ScrolithaResponseCard;
