import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Globe2, Languages, RefreshCw, ShieldCheck } from 'lucide-react';
import Phase3Service, { Phase3LocalizationHub } from '../../services/phase3';

type Metric = {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
};

const percent = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const LocalizationHubPanel: React.FC = () => {
  const [data, setData] = useState<Phase3LocalizationHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      setData(await Phase3Service.getGlobalLocalizationHub());
    } catch (cause: any) {
      setError(cause?.response?.data?.message || cause?.message || 'Unable to load localization status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  const metrics = useMemo<Metric[]>(() => {
    if (!data) return [];
    const values = data.interfaceCopy.valuesByLocale || [];
    const averageCoverage = values.length
      ? values.reduce((total, item) => total + Number(item.coverageRatio || 0), 0) / values.length
      : 0;
    return [
      {
        label: 'Active locales',
        value: String(data.languages.enabledLocales?.length || 0),
        detail: `Default: ${data.languages.defaultLocale || '—'}`,
        icon: Languages
      },
      {
        label: 'Translation coverage',
        value: percent(averageCoverage),
        detail: `${data.interfaceCopy.activeKeys || 0} active keys`,
        icon: Globe2
      },
      {
        label: 'RTL locales',
        value: String(data.languages.rtlLocales?.length || 0),
        detail: 'Configured direction support',
        icon: ShieldCheck
      },
      {
        label: 'Currency rails',
        value: String(data.currencies.enabledCurrencies?.length || 0),
        detail: `Default: ${data.currencies.defaultCurrency || '—'}`,
        icon: Coins
      }
    ];
  }, [data]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            <Globe2 className="h-4 w-4" /> Phase 3 operations
          </div>
          <h3 className="text-lg font-bold text-slate-900">Global Localization Hub</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Read-only visibility into locale coverage, RTL readiness, interface copy, currencies, and FX-provider status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh status
        </button>
      </div>

      {loading && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading localization status…</div>}
      {error && !loading && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}. Existing language controls remain available below.
        </div>
      )}

      {data && !loading && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, detail, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                  <Icon className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-900">Locale coverage</h4>
                <span className="text-xs text-slate-500">{data.interfaceCopy.activeTextOverrides || 0} active overrides</span>
              </div>
              <div className="mt-3 space-y-3">
                {(data.interfaceCopy.valuesByLocale || []).slice(0, 6).map((item) => (
                  <div key={item.locale}>
                    <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
                      <span className="uppercase">{item.locale}</span>
                      <span>{percent(Number(item.coverageRatio || 0))} · {item.values || 0} values</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: percent(Number(item.coverageRatio || 0)) }} />
                    </div>
                  </div>
                ))}
                {!data.interfaceCopy.valuesByLocale?.length && <div className="text-sm text-slate-500">No locale coverage data reported.</div>}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="font-semibold text-slate-900">Currency and FX readiness</h4>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div><span className="font-medium text-slate-800">Enabled currencies:</span> {(data.currencies.enabledCurrencies || []).join(', ') || 'None reported'}</div>
                <div><span className="font-medium text-slate-800">FX providers:</span> {data.currencies.providers?.length || 0} configured</div>
                <div><span className="font-medium text-slate-800">Latest snapshot:</span> {data.currencies.latestSnapshot ? 'Available' : 'Not reported'}</div>
                <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  This panel is observational only. Changes continue to use the existing language and currency controls.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default LocalizationHubPanel;
