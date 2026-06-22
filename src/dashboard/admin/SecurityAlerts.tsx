import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const SecurityAlerts: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, alertsData] = await Promise.all([
        AdminService.getSecurityAlertSummary(),
        AdminService.getSecurityAlerts({ limit: 50 })
      ]);
      setSummary(summaryData || {});
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load security alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, action: 'acknowledge' | 'resolve' | 'dismiss') => {
    setSavingId(id);
    try {
      if (action === 'acknowledge') await AdminService.acknowledgeSecurityAlert(id);
      if (action === 'resolve') await AdminService.resolveSecurityAlert(id);
      if (action === 'dismiss') await AdminService.dismissSecurityAlert(id);
      showNotification('success', 'Saved', `Alert ${action}d`);
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || `Failed to ${action} alert`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Open</span><ShieldAlert className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.open ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Acknowledged</span><CheckCircle2 className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.acknowledged ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Resolved</span><CheckCircle2 className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.resolved ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Critical</span><AlertTriangle className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.critical ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>High</span><AlertTriangle className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.high ?? 0}</div></div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">Loading security alerts...</div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-slate-100 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{alert.title}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{alert.severity}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{alert.status}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{alert.message}</div>
                    <div className="mt-1 text-xs text-slate-500">{alert.source} • {new Date(alert.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {alert.status === 'open' && (
                      <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={savingId === alert.id} onClick={() => act(alert.id, 'acknowledge')}>Acknowledge</button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={savingId === alert.id} onClick={() => act(alert.id, 'resolve')}>Resolve</button>
                    )}
                    {alert.status !== 'dismissed' && (
                      <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={savingId === alert.id} onClick={() => act(alert.id, 'dismiss')}>Dismiss</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SecurityAlerts;
