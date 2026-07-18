import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  User,
  ShoppingBag,
  Users,
  Wallet,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Bell,
  FileText,
  ExternalLink
} from 'lucide-react';

export type ScrolithaEntityCard = {
  type: string;
  version?: number;
  id: string;
  entityId?: string | null;
  title: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  actions?: Array<{
    id: string;
    label: string;
    kind: string;
    href?: string | null;
    toolKey?: string | null;
    actionId?: string | null;
    confirmationToken?: string | null;
    primary?: boolean;
  }>;
  deepLink?: string | null;
  imageUrl?: string | null;
  accessibilityLabel?: string;
};

type Props = {
  cards?: ScrolithaEntityCard[] | null;
  className?: string;
  onConfirm?: (action: {
    actionId?: string | null;
    confirmationToken?: string | null;
    toolKey?: string | null;
  }) => void;
  onRetry?: () => void;
};

const iconFor = (type: string) => {
  switch (type) {
    case 'job':
    case 'project':
    case 'contract':
      return Briefcase;
    case 'profile':
    case 'freelancer':
    case 'employer':
      return User;
    case 'marketplace':
      return ShoppingBag;
    case 'community':
    case 'company':
      return Users;
    case 'wallet':
      return Wallet;
    case 'navigation':
      return Navigation;
    case 'confirmation':
      return CheckCircle2;
    case 'error':
      return AlertTriangle;
    case 'notification':
      return Bell;
    case 'resume':
    case 'post_draft':
      return FileText;
    default:
      return ExternalLink;
  }
};

const toneFor = (type: string) => {
  if (type === 'error') return 'border-rose-200 bg-rose-50/80';
  if (type === 'confirmation') return 'border-amber-200 bg-amber-50/80';
  if (type === 'wallet') return 'border-emerald-200 bg-emerald-50/70';
  return 'border-indigo-100 bg-white';
};

/**
 * Phase 20.7.1 — trusted frontend renderer for typed Scrolitha entity cards.
 * Never renders server HTML.
 */
const ScrolithaEntityCards: React.FC<Props> = ({ cards, className = '', onConfirm, onRetry }) => {
  const navigate = useNavigate();
  const safeCards = useMemo(() => {
    if (!Array.isArray(cards)) return [];
    return cards
      .filter((c) => c && typeof c === 'object' && String(c.title || '').trim())
      .slice(0, 8) as ScrolithaEntityCard[];
  }, [cards]);

  if (!safeCards.length) return null;

  return (
    <div className={`mt-2 flex w-full flex-col gap-2 ${className}`} data-testid="scrolitha-entity-cards">
      {safeCards.map((card) => {
        const Icon = iconFor(String(card.type || 'unknown'));
        const actions = Array.isArray(card.actions) ? card.actions.slice(0, 4) : [];
        return (
          <article
            key={card.id || `${card.type}-${card.title}`}
            className={`rounded-xl border p-3 shadow-sm ${toneFor(String(card.type))}`}
            aria-label={card.accessibilityLabel || `${card.title}. ${card.summary}`}
          >
            <div className="flex items-start gap-2.5">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover border border-slate-200"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-semibold text-slate-900">{card.title}</h4>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {String(card.type || 'card').replace(/_/g, ' ')}
                  </span>
                </div>
                {card.summary ? (
                  <p className="mt-0.5 text-xs leading-5 text-slate-600 line-clamp-3">{card.summary}</p>
                ) : null}
                {actions.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {actions.map((action) => {
                      const primary = Boolean(action.primary);
                      return (
                        <button
                          key={action.id || action.label}
                          type="button"
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            primary
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (action.kind === 'confirm') {
                              onConfirm?.({
                                actionId: action.actionId,
                                confirmationToken: action.confirmationToken,
                                toolKey: action.toolKey
                              });
                              return;
                            }
                            if (action.kind === 'retry') {
                              onRetry?.();
                              return;
                            }
                            if (action.kind === 'dismiss') return;
                            const href = action.href || card.deepLink;
                            if (href) {
                              if (/^https?:\/\//i.test(href)) {
                                window.open(href, '_blank', 'noopener,noreferrer');
                              } else {
                                navigate(href);
                              }
                            }
                          }}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                ) : card.deepLink ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(String(card.deepLink));
                    }}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default ScrolithaEntityCards;
