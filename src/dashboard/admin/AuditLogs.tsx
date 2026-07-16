import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Shield } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const AuditLogs: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [events, setEvents] = useState<any[]>([]);
  const [filters, setFilters] = useState({ actor: '', moduleKey: '', entityType: '', severity: '', status: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, eventsData] = await Promise.all([
        AdminService.getAuditSummary(),
        AdminService.getAuditEvents({ ...filters, limit: 100 })
      ]);
      setSummary(summaryData || {});
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Total events</span><Activity className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.totalEvents ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Admin audit</span><Shield className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.adminEvents ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Listing events</span><Activity className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.listingEvents ?? 0}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>Denied permissions</span><AlertTriangle className="h-4 w-4 text-slate-400" /></div><div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.deniedPermissions ?? 0}</div></div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-5" onSubmit={applyFilters}>
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Actor" value={filters.actor} onChange={(event) => setFilters((prev) => ({ ...prev, actor: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Module" value={filters.moduleKey} onChange={(event) => setFilters((prev) => ({ ...prev, moduleKey: event.target.value }))} />
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Entity type" value={filters.entityType} onChange={(event) => setFilters((prev) => ({ ...prev, entityType: event.target.value }))} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.severity} onChange={(event) => setFilters((prev) => ({ ...prev, severity: event.target.value }))}>
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="">All status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="denied">Denied</option>
            <option value="error">Error</option>
          </select>
          <div className="md:col-span-5">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply filters</button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">Loading audit events...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="pb-3">Time</th>
                  <th className="pb-3">Module</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Actor</th>
                  <th className="pb-3">Severity</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((entry) => (
                  <tr key={`${entry.source}-${entry.id}`} className="border-t border-slate-100 align-top">
                    <td className="py-3 text-slate-600">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="py-3 text-slate-900">{entry.moduleKey}</td>
                    <td className="py-3 text-slate-600">{entry.actionKey}<div className="mt-1 text-xs text-slate-500">{entry.entityType}</div></td>
                    <td className="py-3 text-slate-600">{entry.actorStaffId || entry.actorUserId || 'system'}</td>
                    <td className="py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{entry.severity}</span></td>
                    <td className="py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{entry.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AuditLogs;
