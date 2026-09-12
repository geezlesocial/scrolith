import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BriefcaseBusiness, Building2, ClipboardList, RefreshCw, Sparkles, Target, ThumbsDown, ThumbsUp, Wallet } from 'lucide-react';
import { InsightsService, type OpportunityBriefResult, type OpportunityHubData } from '../../services/insights';

type OpportunityStudioAudience = 'freelancer' | 'employer' | 'page';

type OpportunityStudioPanelProps = {
  audience?: OpportunityStudioAudience;
  title?: string;
  subtitle?: string;
  className?: string;
};

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const formatMetric = (value: number) => compactNumber.format(Number.isFinite(value) ? value : 0);

const defaultTitle: Record<OpportunityStudioAudience, string> = {
  freelancer: 'Opportunity Studio',
  employer: 'Hiring Opportunity Studio',
  page: 'Page Opportunity Studio'
};

const defaultSubtitle: Record<OpportunityStudioAudience, string> = {
  freelancer: 'Shape your positioning, package your offer, and move into the right work faster.',
  employer: 'Turn demand into a structured brief and shortlist roles, offers, and pages from one panel.',
  page: 'Use your page as a conversion surface for packaged offers, hiring needs, and qualified partnerships.'
};

const promptSuggestions: Record<OpportunityStudioAudience, string[]> = {
  freelancer: [
    'I offer brand design and landing page development for fintech startups.',
    'I want to package AI workflow automation for agencies and operations teams.',
    'I need to reposition myself for higher-value React and product design work.'
  ],
  employer: [
    'I need a React engineer and product designer for a two-week launch sprint.',
    'I want to hire a content strategist for a B2B SaaS demand-gen campaign.',
    'I need a reliable video editor and social media operator for weekly content.'
  ],
  page: [
    'Our page wants to package recurring marketing audits and conversion support.',
    'We need to attract partnership-ready creators in the technology sector.',
    'I want to turn this page into a lead pipeline for strategy and execution services.'
  ]
};

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

const resolveLink = (match: any) => {
  const destination = String(match?.destinationUrl || '').trim();
  if (destination) return destination;
  const targetType = String(match?.targetType || '').toLowerCase();
  const targetId = String(match?.targetId || match?.target?.id || '').trim();
  if (targetType === 'job' && targetId) return `/jobs/${targetId}`;
  if (targetType === 'gig' && targetId) return `/gigs/${targetId}`;
  const slug = String(match?.slug || match?.target?.slug || '').trim();
  if ((targetType === 'page' || targetType === 'company') && slug) return `/company/${slug}`;
  return '';
};

const resolveMatchEntity = (match: any) => {
  const targetType = String(match?.targetType || match?.type || '').toLowerCase();
  const entityType = targetType === 'company' ? 'page' : targetType || (match?.clientName ? 'job' : match?.sellerName ? 'gig' : 'page');
  const entityId = String(match?.targetId || match?.id || match?.target?.id || '').trim();
  return { entityType, entityId };
};

const OpportunityMatchCard: React.FC<{ match: any }> = ({ match }) => {
  const href = resolveLink(match);
  const [feedback, setFeedback] = React.useState<'positive' | 'negative' | null>(null);
  const [feedbackBusy, setFeedbackBusy] = React.useState(false);
  const reasons = Array.isArray(match?.reasons) ? match.reasons.filter(Boolean).slice(0, 3) : [];
  const sendFeedback = async (action: 'click' | 'dismiss') => {
    const target = resolveMatchEntity(match);
    if (!target.entityId || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      await InsightsService.recordOpportunityFeedback({
        entityType: target.entityType,
        entityId: target.entityId,
        action,
        metadata: { score: Number(match?.score || 0), reasons }
      });
      setFeedback(action === 'click' ? 'positive' : 'negative');
    } catch {
      // Feedback is non-blocking and must never prevent opening an opportunity.
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <div key={String(match?.id || href || match?.title || match?.name)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-slate-900">
            {match?.title || match?.name || match?.target?.title || match?.target?.name || 'Matched opportunity'}
          </p>
          <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
            {match?.clientName
              ? `Client: ${match.clientName}`
              : match?.sellerName
                ? `Seller: ${match.sellerName}`
                : match?.industry
                  ? `Industry: ${match.industry}`
                  : 'Opportunity match'}
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          {Number(match?.score || 0).toFixed(0)}%
        </span>
      </div>
      {reasons.length ? (
        <div className="mt-2 space-y-1 text-xs text-slate-600">
          {reasons.map((reason: any, index: number) => <p key={`${String(reason)}-${index}`}>• {String(reason)}</p>)}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {href ? <Link to={href} onClick={() => void sendFeedback('click')} className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-700">Open</Link> : <span />}
        <div className="flex items-center gap-1" aria-label="Recommendation feedback">
          <button type="button" onClick={() => void sendFeedback('click')} disabled={feedbackBusy} aria-label="Relevant recommendation" title="Relevant" className={`rounded-lg p-1.5 transition ${feedback === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700'}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => void sendFeedback('dismiss')} disabled={feedbackBusy} aria-label="Not relevant recommendation" title="Not relevant" className={`rounded-lg p-1.5 transition ${feedback === 'negative' ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-700'}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
};

const renderBriefColumn = (title: string, matches: any[]) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <span className="text-xs text-slate-400">{matches.length}</span>
    </div>
    <div className="mt-3 space-y-2">
      {matches.length ? matches.map((match) => <OpportunityMatchCard key={String(match?.id || match?.targetId || match?.title || match?.name)} match={match} />) : <p className="text-xs text-slate-500">No matches yet.</p>}
    </div>
  </div>
);

const resolvePriorityClass = (priority: string) => {
  if (priority === 'high') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (priority === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const OpportunityStudioPanel: React.FC<OpportunityStudioPanelProps> = ({
  audience = 'freelancer',
  title,
  subtitle,
  className = ''
}) => {
  const [hub, setHub] = React.useState<OpportunityHubData | null>(null);
  const [briefPrompt, setBriefPrompt] = React.useState('');
  const [briefResult, setBriefResult] = React.useState<OpportunityBriefResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [briefBusy, setBriefBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [briefStatus, setBriefStatus] = React.useState<string | null>(null);

  const loadHub = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await InsightsService.getOpportunityHub();
      setHub(data);
    } catch (nextError: any) {
      setError(nextError?.response?.data?.message || nextError?.message || 'Unable to load the opportunity studio.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const generateBrief = async () => {
    const prompt = String(briefPrompt || '').trim();
    if (prompt.length < 12) {
      setBriefStatus('Add a little more context so Scrolitha can produce a useful brief.');
      return;
    }
    setBriefBusy(true);
    setBriefStatus(null);
    try {
      const data = await InsightsService.generateOpportunityBrief(prompt);
      setBriefResult(data);
      setBriefStatus('Scrolitha generated a structured brief and fresh matches.');
      void loadHub(true);
    } catch (nextError: any) {
      setBriefStatus(nextError?.response?.data?.message || nextError?.message || 'Failed to generate the brief.');
    } finally {
      setBriefBusy(false);
    }
  };

  const workroomItems = Array.isArray(hub?.workroom?.items) ? hub.workroom.items : [];

  return (
    <section className={`${card} ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">Opportunity Layer</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{title || defaultTitle[audience]}</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{subtitle || defaultSubtitle[audience]}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadHub(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading opportunity data...</p>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="inline-flex rounded-2xl bg-indigo-100 p-2 text-indigo-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">Trust tier</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{hub?.trust?.trustTier || 'Building'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatMetric(Number(hub?.trust?.score || 0))} trust score</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="inline-flex rounded-2xl bg-sky-100 p-2 text-sky-700">
                <Target className="h-4 w-4" />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">Live matches</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMetric(Number(hub?.matching?.total || 0))}</p>
              <p className="mt-1 text-xs text-slate-500">Active graph recommendations</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="inline-flex rounded-2xl bg-emerald-100 p-2 text-emerald-700">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">Delivery</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatMetric(Number(hub?.delivery?.activeContracts || 0) + Number(hub?.delivery?.activeOrders || 0))}
              </p>
              <p className="mt-1 text-xs text-slate-500">Contracts and orders in motion</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="inline-flex rounded-2xl bg-amber-100 p-2 text-amber-700">
                <Building2 className="h-4 w-4" />
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">Packaging</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatMetric(Number(hub?.packaging?.activeGigs || 0) + Number(hub?.packaging?.activePages || 0))}
              </p>
              <p className="mt-1 text-xs text-slate-500">Gigs and pages ready to convert</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr),minmax(0,0.75fr)]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Brief-to-match</p>
                  <p className="mt-2 text-sm text-slate-600">Describe a need once, then let Scrolitha structure the brief and surface the best-fit next moves.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void generateBrief()}
                  disabled={briefBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {briefBusy ? 'Generating...' : 'Generate brief'}
                </button>
              </div>
              <textarea
                value={briefPrompt}
                onChange={(event) => setBriefPrompt(event.target.value)}
                placeholder="Describe the opportunity, offer, or hiring need you want to structure."
                className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {promptSuggestions[audience].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setBriefPrompt(suggestion)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {briefStatus ? <p className="mt-3 text-xs text-slate-500">{briefStatus}</p> : null}
              {briefResult ? (
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{briefResult.brief.title}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-indigo-700">
                      {briefResult.brief.intent}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{briefResult.brief.summary}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Budget</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{briefResult.brief.budgetRange}</p>
                    </div>
                    <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timeline</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{briefResult.brief.timeline}</p>
                    </div>
                    <div className="rounded-xl border border-white/70 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deliverables</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{briefResult.brief.deliverables.length}</p>
                    </div>
                  </div>
                  {briefResult.brief.skills.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {briefResult.brief.skills.slice(0, 6).map((skill) => (
                        <span key={skill} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Wallet className="h-4 w-4 text-slate-600" />
                  Execution and trust snapshot
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>Profile completeness: {Number(hub?.identity?.profileCompleteness || 0)}%</p>
                  <p>Verification: {hub?.identity?.verificationState || 'Building trust'}</p>
                  <p>Response window: {Number(hub?.trust?.responseTimeHours || 0)}h average</p>
                  <p>Wallet balance: {formatMetric(Number(hub?.delivery?.walletBalance || 0))}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recommended actions</p>
                <ul className="mt-3 space-y-2">
                  {(hub?.actions || []).slice(0, 5).map((action) => (
                    <li key={action} className="text-sm text-slate-600">
                      - {action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Unified workroom bootstrap</p>
                <p className="mt-2 text-sm text-slate-600">
                  Live execution cards for contracts, orders, and proposals so teams can move from matching into delivery.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                  {Number(hub?.workroom?.totalWorkstreams || 0)} active
                </span>
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {Number(hub?.workroom?.needsAttention || 0)} need attention
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {workroomItems.length ? (
                workroomItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.title || 'Workstream'}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{item.subtitle || 'Active delivery stream'}</p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${resolvePriorityClass(
                          String(item.priority || 'low')
                        )}`}
                      >
                        {String(item.priority || 'low')}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{item.status}</span>
                      {Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Value {formatMetric(Number(item.amount))}
                        </span>
                      ) : null}
                      {item.dueAt ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Due {new Date(item.dueAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                    <Link to={item.actionUrl} className="mt-2 inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                      {item.actionLabel || 'Open'}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No active workstreams yet. Contracts, orders, and proposals will appear here as soon as they become active.
                </div>
              )}
            </div>
          </div>

          {briefResult ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {renderBriefColumn('Job matches', briefResult.matches.jobs.slice(0, 3))}
              {renderBriefColumn('Packaged offers', briefResult.matches.gigs.slice(0, 3))}
              {renderBriefColumn('Page opportunities', briefResult.matches.pages.slice(0, 3))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

export default OpportunityStudioPanel;
