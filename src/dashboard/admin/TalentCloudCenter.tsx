import React, { useEffect, useState } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type Props = {
  initialSection?: 'talent' | 'integrations';
};

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

const TalentCloudCenter: React.FC<Props> = ({ initialSection = 'talent' }) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'talent' | 'integrations'>(initialSection);
  const [summary, setSummary] = useState<any>({});
  const [settings, setSettings] = useState<any>({});
  const [pools, setPools] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, settingsData, poolsData, requirementsData, integrationsData, deliveriesData, apiKeysData] = await Promise.all([
        AdminService.getTalentCloudSummary(),
        AdminService.getTalentCloudSettings(),
        AdminService.getTalentPools(),
        AdminService.getVendorRequirements(),
        AdminService.getIntegrationEndpoints(),
        AdminService.getWebhookDeliveries(),
        AdminService.getApiCredentials()
      ]);
      setSummary(summaryData || {});
      setSettings(settingsData || {});
      setPools(Array.isArray(poolsData) ? poolsData : []);
      setRequirements(Array.isArray(requirementsData) ? requirementsData : []);
      setIntegrations(Array.isArray(integrationsData) ? integrationsData : []);
      setDeliveries(Array.isArray(deliveriesData) ? deliveriesData : []);
      setApiKeys(Array.isArray(apiKeysData) ? apiKeysData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load talent cloud');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveSettings = async () => {
    setSaving('settings');
    try {
      await AdminService.updateTalentCloudSettings(settings);
      showNotification('success', 'Saved', 'Talent cloud settings updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to save talent cloud settings');
    } finally {
      setSaving(null);
    }
  };

  const retryDelivery = async (id: string) => {
    setSaving(id);
    try {
      await AdminService.retryWebhookDelivery(id);
      showNotification('success', 'Queued', 'Webhook retry queued');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to retry webhook delivery');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className={cardClass}>Loading private talent cloud...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button onClick={() => setActiveSection('talent')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeSection === 'talent' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Private Talent Cloud</button>
        <button onClick={() => setActiveSection('integrations')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeSection === 'integrations' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Integrations</button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Pools', pools.length],
          ['Vendor requirements', requirements.length],
          ['Endpoints', integrations.length],
          ['API keys', apiKeys.length]
        ].map(([label, value]) => (
          <div key={String(label)} className={cardClass}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{value as any}</div>
          </div>
        ))}
      </div>

      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Enterprise settings</h2>
            <p className="text-sm text-slate-500">Invite-only network and webhook delivery controls.</p>
          </div>
          <button onClick={saveSettings} disabled={saving === 'settings'} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving === 'settings' ? 'Saving...' : 'Save settings'}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Enabled</div>
            <select value={settings.enabled ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, enabled: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Manual invites only</div>
            <select value={settings.manualInvitesOnly ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, manualInvitesOnly: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Webhooks enabled</div>
            <select value={settings.webhooksEnabled ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, webhooksEnabled: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
        </div>
      </section>

      {activeSection === 'talent' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Talent pools</h2>
            <div className="mt-4 space-y-3">
              {pools.slice(0, 8).map((pool) => (
                <div key={pool.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{pool.name}</div>
                  <div className="text-sm text-slate-500">{pool.slug} · {pool.visibility}</div>
                  <div className="mt-1 text-sm text-slate-600">{pool.description || 'No description'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Vendor requirements</h2>
            <div className="mt-4 space-y-3">
              {requirements.slice(0, 8).map((rule) => (
                <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{rule.code} · {rule.name}</div>
                  <div className="text-sm text-slate-500">{rule.requiredKycTier || 'No KYC tier'} · {rule.isActive ? 'Active' : 'Inactive'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Integration endpoints</h2>
            <div className="mt-4 space-y-3">
              {integrations.slice(0, 8).map((endpoint) => (
                <div key={endpoint.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{endpoint.name}</div>
                  <div className="text-sm text-slate-500">{endpoint.type} · {endpoint.status}</div>
                  <div className="mt-1 break-all text-sm text-slate-600">{endpoint.targetUrl || 'No target URL'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Webhook deliveries</h2>
            <div className="mt-4 space-y-3">
              {deliveries.slice(0, 8).map((delivery) => (
                <div key={delivery.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{delivery.eventType}</div>
                      <div className="text-sm text-slate-500">{delivery.status} · Attempts {delivery.attempts}</div>
                    </div>
                    <button onClick={() => retryDelivery(delivery.id)} disabled={saving === delivery.id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                      Retry
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">API credentials</h2>
            <div className="mt-4 space-y-3">
              {apiKeys.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{entry.name}</div>
                  <div className="text-sm text-slate-500">{entry.keyPrefix} · {entry.status}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default TalentCloudCenter;
