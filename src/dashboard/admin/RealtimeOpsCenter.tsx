import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Radio, RefreshCw, RotateCcw, Search, Wifi } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const emptySummary = {
  liveConnections: 0,
  persistedActiveSessions: 0,
  communityConnections: 0,
  rootConnections: 0,
  peakConnections: 0,
  activeUsers: 0,
  activePresenceLeases: 0,
  recentDeliveries: 0,
  openIncidents: 0,
  replayJobs: 0,
  runtimeErrors: 0
};

const emptyRuntime = {
  totalConnections: 0,
  peakConnections: 0,
  rootConnections: 0,
  communityConnections: 0,
  activeUsers: 0,
  recentEvents: [] as any[],
  recentIncidents: [] as any[],
  activeSockets: [] as any[]
};

const emptyObservability = {
  status: 'UNKNOWN',
  generatedAt: null,
  http: { requests: 0, errors5xx: 0 },
  messaging: { sent: 0, failed: 0, reconnects: 0 },
  media: { uploadFailures: 0 },
  calls: { active: 0, attempts: 0, outcomes: 0, iceEvents: 0, turnEvents: 0 },
  database: { errors: 0, poolReady: 0 }
};

const emptyIncidentForm = {
  code: 'REALTIME_MANUAL',
  severity: 'WARN',
  source: 'manual',
  message: '',
  detailsText: ''
};

const badgeTone = (value: string) => {
  const normalized = String(value || '').toUpperCase();
  if (['ERROR', 'CRITICAL', 'OPEN'].includes(normalized)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['WARN', 'WARNING'].includes(normalized)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['RESOLVED', 'COMPLETED', 'ACTIVE', 'CONNECTED'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const formatTimestamp = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const RealtimeOpsCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingIncident, setSavingIncident] = useState(false);
  const [replayingDeliveryId, setReplayingDeliveryId] = useState<string | null>(null);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);

  const [summary, setSummary] = useState<any>(emptySummary);
  const [observability, setObservability] = useState<any>(emptyObservability);
  const [runtime, setRuntime] = useState<any>(emptyRuntime);
  const [sessions, setSessions] = useState<any[]>([]);
  const [presence, setPresence] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [replays, setReplays] = useState<any[]>([]);

  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [deliveryEventFilter, setDeliveryEventFilter] = useState('');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('');
  const [incidentForm, setIncidentForm] = useState(emptyIncidentForm);

  const activeSocketPreview = useMemo(() => (Array.isArray(runtime?.activeSockets) ? runtime.activeSockets.slice(0, 8) : []), [runtime]);
  const runtimeEvents = useMemo(() => (Array.isArray(runtime?.recentEvents) ? runtime.recentEvents.slice(0, 8) : []), [runtime]);
  const runtimeIncidents = useMemo(() => (Array.isArray(runtime?.recentIncidents) ? runtime.recentIncidents.slice(0, 6) : []), [runtime]);

  const loadSummary = async () => setSummary((await AdminService.getRealtimeOpsSummary()) || emptySummary);
  const loadObservability = async () => setObservability((await AdminService.getObservabilitySummary()) || emptyObservability);
  const loadRuntime = async () => setRuntime((await AdminService.getRealtimeRuntime()) || emptyRuntime);

  const loadSessions = async () => {
    setSessions(
      await AdminService.getRealtimeSocketSessions({
        namespace: namespaceFilter || undefined,
        query: sessionQuery || undefined,
        activeOnly,
        limit: 30
      })
    );
  };

  const loadPresence = async () => {
    setPresence(
      await AdminService.getRealtimePresenceLeases({
        namespace: namespaceFilter || undefined,
        query: sessionQuery || undefined,
        activeOnly: true,
        limit: 30
      })
    );
  };

  const loadDeliveries = async () => {
    setDeliveries(
      await AdminService.getRealtimeDeliveries({
        namespace: namespaceFilter || undefined,
        eventName: deliveryEventFilter || undefined,
        limit: 30
      })
    );
  };

  const loadIncidents = async () => {
    setIncidents(
      await AdminService.getRealtimeIncidents({
        status: incidentStatusFilter || undefined,
        limit: 30
      })
    );
  };

  const loadReplays = async () => setReplays(await AdminService.getRealtimeReplayJobs({ limit: 30 }));

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadObservability(), loadRuntime(), loadSessions(), loadPresence(), loadDeliveries(), loadIncidents(), loadReplays()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await refreshAll();
      } catch (error: any) {
        showNotification('alert', 'Realtime Ops Error', error?.message || 'Failed to load realtime ops center');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    loadSessions().catch((error: any) => showNotification('alert', 'Realtime Sessions Error', error?.message || 'Failed to load realtime sessions'));
    loadPresence().catch((error: any) => showNotification('alert', 'Presence Error', error?.message || 'Failed to load presence leases'));
  }, [namespaceFilter, activeOnly, sessionQuery]);

  useEffect(() => {
    if (loading) return;
    loadDeliveries().catch((error: any) => showNotification('alert', 'Realtime Deliveries Error', error?.message || 'Failed to load deliveries'));
  }, [namespaceFilter, deliveryEventFilter]);

  useEffect(() => {
    if (loading) return;
    loadIncidents().catch((error: any) => showNotification('alert', 'Realtime Incidents Error', error?.message || 'Failed to load incidents'));
  }, [incidentStatusFilter]);

  useEffect(() => {
    const refresh = () => {
      refreshAll().catch(() => null);
    };
    window.addEventListener('presence:updated', refresh as EventListener);
    window.addEventListener('realtime:incident_opened', refresh as EventListener);
    window.addEventListener('realtime:incident_resolved', refresh as EventListener);
    window.addEventListener('delivery:replayed', refresh as EventListener);
    window.addEventListener('realtime:session_changed', refresh as EventListener);
    return () => {
      window.removeEventListener('presence:updated', refresh as EventListener);
      window.removeEventListener('realtime:incident_opened', refresh as EventListener);
      window.removeEventListener('realtime:incident_resolved', refresh as EventListener);
      window.removeEventListener('delivery:replayed', refresh as EventListener);
      window.removeEventListener('realtime:session_changed', refresh as EventListener);
    };
  }, []);

  const createManualIncident = async () => {
    try {
      setSavingIncident(true);
      await AdminService.createRealtimeIncident({
        code: incidentForm.code,
        severity: incidentForm.severity,
        source: incidentForm.source,
        message: incidentForm.message,
        details: incidentForm.detailsText.trim() ? JSON.parse(incidentForm.detailsText) : undefined
      });
      showNotification('success', 'Incident Logged', 'Manual realtime incident created successfully.');
      setIncidentForm(emptyIncidentForm);
      await Promise.all([loadSummary(), loadIncidents(), loadRuntime()]);
    } catch (error: any) {
      showNotification('alert', 'Incident Create Failed', error?.message || 'Failed to create realtime incident');
    } finally {
      setSavingIncident(false);
    }
  };

  const replayDelivery = async (delivery: any) => {
    try {
      setReplayingDeliveryId(delivery.id);
      await AdminService.replayRealtimeDelivery(delivery.id);
      showNotification('success', 'Delivery Replayed', `${delivery.eventName} was replayed successfully.`);
      await Promise.all([loadSummary(), loadDeliveries(), loadReplays(), loadRuntime()]);
    } catch (error: any) {
      showNotification('alert', 'Replay Failed', error?.message || 'Failed to replay delivery');
    } finally {
      setReplayingDeliveryId(null);
    }
  };

  const resolveIncident = async (incident: any) => {
    const notes = window.prompt(`Resolution notes for ${incident.code}`, incident.notes || '') || '';
    try {
      setResolvingIncidentId(incident.id);
      await AdminService.resolveRealtimeIncident(incident.id, { status: 'RESOLVED', notes });
      showNotification('success', 'Incident Resolved', `${incident.code} marked resolved.`);
      await Promise.all([loadSummary(), loadIncidents(), loadRuntime()]);
    } catch (error: any) {
      showNotification('alert', 'Resolve Failed', error?.message || 'Failed to resolve incident');
    } finally {
      setResolvingIncidentId(null);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Realtime Ops Center...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Realtime Ops Center</h2>
          <p className="text-sm text-gray-500">Live socket visibility, presence leases, delivery logs, incidents, and safe replay controls.</p>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Live Connections', value: summary.liveConnections, icon: Wifi },
          { label: 'Online Users', value: summary.activeUsers, icon: Radio },
          { label: 'Open Incidents', value: summary.openIncidents, icon: AlertTriangle },
          { label: 'Recent Deliveries', value: summary.recentDeliveries, icon: Activity },
          { label: 'Replay Jobs', value: summary.replayJobs, icon: RotateCcw }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</div>
                <Icon className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{card.value}</div>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="reliability-snapshot-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="reliability-snapshot-heading" className="text-base font-semibold text-gray-900">Reliability snapshot</h3>
            <p className="mt-1 text-xs text-gray-500">Label-free platform totals from the existing metrics registry.</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${observability.status === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {observability.status}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['HTTP 5xx', observability.http?.errors5xx, 'text-rose-700'],
            ['Media upload failures', observability.media?.uploadFailures, 'text-amber-700'],
            ['Active calls', observability.calls?.active, 'text-blue-700'],
            ['Database errors', observability.database?.errors, 'text-rose-700']
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
              <div className={`mt-1 text-lg font-bold ${tone}`}>{Number(value || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-gray-400">
          Messages sent {Number(observability.messaging?.sent || 0).toLocaleString()} · reconnects {Number(observability.messaging?.reconnects || 0).toLocaleString()} · call attempts {Number(observability.calls?.attempts || 0).toLocaleString()}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900">Runtime Overview</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Root</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{runtime.rootConnections}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Community</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{runtime.communityConnections}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Peak</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{runtime.peakConnections}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Runtime Errors</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{summary.runtimeErrors}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent Event Counters</div>
              <div className="space-y-2">
                {runtimeEvents.length === 0 ? (
                  <div className="text-sm text-gray-400">No realtime events captured yet.</div>
                ) : (
                  runtimeEvents.map((event) => (
                    <div key={`${event.namespace}:${event.roomKey || '*'}:${event.eventName}`} className="rounded-lg bg-slate-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">{event.eventName}</div>
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{event.count}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {event.namespace}{event.roomKey ? ` / ${event.roomKey}` : ''} · targets {event.targetCount || 0}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Active Socket Preview</div>
              <div className="space-y-2">
                {activeSocketPreview.length === 0 ? (
                  <div className="text-sm text-gray-400">No active sockets captured yet.</div>
                ) : (
                  activeSocketPreview.map((socket) => (
                    <div key={socket.socketId} className="rounded-lg bg-slate-50 p-2">
                      <div className="text-sm font-semibold text-gray-900">{socket.socketId}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {socket.namespace} · {socket.userId || 'guest'} · {socket.transport || 'unknown'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {runtimeIncidents.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Runtime Incident Feed</div>
              <div className="space-y-2">
                {runtimeIncidents.map((incident) => (
                  <div key={`${incident.code}:${incident.timestamp}`} className="text-xs text-amber-900">
                    <span className="font-semibold">{incident.code}</span> · {incident.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900">Manual Incident</h3>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={incidentForm.code}
                onChange={(event) => setIncidentForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="Incident code"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <select
                value={incidentForm.severity}
                onChange={(event) => setIncidentForm((current) => ({ ...current, severity: event.target.value }))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <input
              value={incidentForm.source}
              onChange={(event) => setIncidentForm((current) => ({ ...current, source: event.target.value }))}
              placeholder="Incident source"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={incidentForm.message}
              onChange={(event) => setIncidentForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Incident message"
              rows={3}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={incidentForm.detailsText}
              onChange={(event) => setIncidentForm((current) => ({ ...current, detailsText: event.target.value }))}
              placeholder='{"service":"socket.io","note":"Manual operator annotation"}'
              rows={5}
              className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
            />
            <button
              onClick={createManualIncident}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {savingIncident ? 'Saving...' : 'Create Incident'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-900">Filters</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={namespaceFilter}
            onChange={(event) => setNamespaceFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">All namespaces</option>
            <option value="root">root</option>
            <option value="community">community</option>
          </select>
          <input
            value={sessionQuery}
            onChange={(event) => setSessionQuery(event.target.value)}
            placeholder="Session / user search"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            value={deliveryEventFilter}
            onChange={(event) => setDeliveryEventFilter(event.target.value)}
            placeholder="Delivery event filter"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            Active sessions only
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="rounded text-blue-600"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Socket Sessions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Socket</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Namespace</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No socket sessions found.</td></tr>
                ) : sessions.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{row.socketId}</div>
                      <div className="text-xs text-gray-500">{formatTimestamp(row.connectedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-800">{row.userId || 'guest'}</div>
                      <div className="text-xs text-gray-500">{row.role || 'unknown'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.namespace}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(row.isLive ? 'CONNECTED' : 'DISCONNECTED')}`}>
                        {row.isLive ? 'CONNECTED' : 'DISCONNECTED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Presence Leases</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Socket</th>
                  <th className="px-4 py-3">Namespace</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {presence.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No active presence leases.</td></tr>
                ) : presence.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{row.userId}</div>
                      <div className="text-xs text-gray-500">{formatTimestamp(row.lastSeenAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.socketId}</td>
                    <td className="px-4 py-3 text-gray-700">{row.namespace}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Event Deliveries</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Targets</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No persisted deliveries captured yet.</td></tr>
                ) : deliveries.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{row.eventName}</div>
                      <div className="text-xs text-gray-500">{formatTimestamp(row.occurredAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-800">{row.namespace}</div>
                      <div className="text-xs text-gray-500">{row.roomKey || 'namespace:broadcast'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.targetCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => replayDelivery(row)}
                        className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        {replayingDeliveryId === row.id ? 'Replaying...' : 'Replay'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">Replay Jobs</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Namespace</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {replays.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">No replay jobs yet.</td></tr>
                ) : replays.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{row.eventName}</div>
                      <div className="text-xs text-gray-500">{formatTimestamp(row.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.namespace}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(row.status)}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-900">Realtime Incidents</h3>
            <select
              value={incidentStatusFilter}
              onChange={(event) => setIncidentStatusFilter(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Incident</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No incidents recorded yet.</td></tr>
              ) : incidents.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{row.code}</div>
                    <div className="text-xs text-gray-500">{row.message}</div>
                    <div className="mt-1 text-xs text-gray-400">{formatTimestamp(row.lastSeenAt)} · {row.occurrences} occurrence(s)</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-800">{row.source}</div>
                    <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeTone(row.severity)}`}>{row.severity}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(row.status)}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => resolveIncident(row)}
                      disabled={row.status === 'RESOLVED'}
                      className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resolvingIncidentId === row.id ? 'Resolving...' : 'Resolve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RealtimeOpsCenter;
