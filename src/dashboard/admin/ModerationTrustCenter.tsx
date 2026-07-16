import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Scale, Search, ShieldAlert, UserRoundSearch } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const emptySummary = {
  policies: 0,
  activePolicies: 0,
  openCases: 0,
  appeals: 0,
  openAppeals: 0,
  trustProfiles: 0,
  activeSignals: 0
};

const emptyPolicyForm = {
  key: '',
  label: '',
  description: '',
  contentType: 'community_post',
  severity: 'MEDIUM',
  action: 'REVIEW',
  thresholdsText: '',
  isActive: true
};

const emptySignalForm = {
  identifier: '',
  signalType: 'MANUAL_REVIEW',
  severity: 'MEDIUM',
  source: 'MANUAL',
  status: 'ACTIVE',
  reason: '',
  expiresAt: '',
  metadataText: ''
};

const badgeTone = (value: string) => {
  const normalized = String(value || '').toUpperCase();
  if (['CRITICAL', 'HIGH', 'REJECTED'].includes(normalized)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['MEDIUM', 'OPEN', 'PENDING'].includes(normalized)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['LOW', 'APPROVED', 'RESOLVED', 'ACTIVE'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const ModerationTrustCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSignal, setSavingSignal] = useState(false);
  const [resolvingAppealId, setResolvingAppealId] = useState<string | null>(null);
  const [recomputingUserId, setRecomputingUserId] = useState<string | null>(null);

  const [summary, setSummary] = useState<any>(emptySummary);
  const [policies, setPolicies] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [trustProfiles, setTrustProfiles] = useState<any[]>([]);
  const [riskSignals, setRiskSignals] = useState<any[]>([]);
  const [selectedTrustUserId, setSelectedTrustUserId] = useState('');
  const [selectedTrustDetail, setSelectedTrustDetail] = useState<any>(null);

  const [policyQuery, setPolicyQuery] = useState('');
  const [casesQuery, setCasesQuery] = useState('');
  const [trustQuery, setTrustQuery] = useState('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('');

  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [signalForm, setSignalForm] = useState(emptySignalForm);

  const selectedTrustProfile = useMemo(
    () => trustProfiles.find((entry) => entry.userId === selectedTrustUserId) || null,
    [trustProfiles, selectedTrustUserId]
  );

  const loadSummary = async () => setSummary((await AdminService.getModerationTrustSummary()) || emptySummary);
  const loadPolicies = async () => setPolicies(await AdminService.getContentPolicies({ query: policyQuery || undefined, activeOnly: true }));
  const loadCases = async () => setCases(await AdminService.getModerationCases({ query: casesQuery || undefined, limit: 25 }));
  const loadAppeals = async () => setAppeals(await AdminService.getModerationAppeals({ limit: 25 }));
  const loadRiskSignals = async () => setRiskSignals(await AdminService.getRiskSignals({ limit: 25 }));

  const loadTrustProfiles = async () => {
    const rows = await AdminService.getTrustProfiles({
      query: trustQuery || undefined,
      riskLevel: selectedRiskLevel || undefined,
      limit: 25
    });
    setTrustProfiles(rows);
    setSelectedTrustUserId((current) => (current && rows.some((entry: any) => entry.userId === current) ? current : rows[0]?.userId || ''));
  };

  const loadTrustDetail = async (userId: string) => {
    if (!userId) return setSelectedTrustDetail(null);
    setSelectedTrustDetail(await AdminService.getTrustProfileDetails(userId));
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadPolicies(), loadCases(), loadAppeals(), loadTrustProfiles(), loadRiskSignals()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await Promise.all([loadSummary(), loadPolicies(), loadCases(), loadAppeals(), loadTrustProfiles(), loadRiskSignals()]);
      } catch (error: any) {
        showNotification('alert', 'Moderation & Trust Error', error?.message || 'Failed to load moderation and trust center');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadTrustProfiles().catch((error: any) => showNotification('alert', 'Trust Profiles Error', error?.message || 'Failed to load trust profiles'));
    }
  }, [trustQuery, selectedRiskLevel]);

  useEffect(() => {
    if (!loading) {
      loadTrustDetail(selectedTrustUserId).catch((error: any) => showNotification('alert', 'Trust Detail Error', error?.message || 'Failed to load trust detail'));
    }
  }, [selectedTrustUserId]);

  const resetPolicyForm = () => {
    setEditingPolicyId(null);
    setPolicyForm(emptyPolicyForm);
  };

  const startEditPolicy = (policy: any) => {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      key: policy.key,
      label: policy.label,
      description: policy.description || '',
      contentType: policy.contentType,
      severity: policy.severity,
      action: policy.action,
      thresholdsText: policy.thresholds ? JSON.stringify(policy.thresholds, null, 2) : '',
      isActive: policy.isActive !== false
    });
  };

  const savePolicy = async () => {
    try {
      setSavingPolicy(true);
      const payload = {
        key: policyForm.key,
        label: policyForm.label,
        description: policyForm.description || null,
        contentType: policyForm.contentType,
        severity: policyForm.severity,
        action: policyForm.action,
        thresholds: policyForm.thresholdsText.trim() ? JSON.parse(policyForm.thresholdsText) : undefined,
        isActive: policyForm.isActive
      };
      if (editingPolicyId) await AdminService.updateContentPolicy(editingPolicyId, payload);
      else await AdminService.createContentPolicy(payload);
      showNotification('success', 'Policy Saved', `${payload.label} saved successfully.`);
      resetPolicyForm();
      await Promise.all([loadSummary(), loadPolicies()]);
    } catch (error: any) {
      showNotification('alert', 'Policy Save Failed', error?.message || 'Failed to save content policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const resolveAppeal = async (appeal: any, status: 'APPROVED' | 'RESOLVED' | 'REJECTED') => {
    const resolutionNotes = window.prompt(`Resolution note for appeal ${appeal.id}`, appeal.resolutionNotes || '') || '';
    try {
      setResolvingAppealId(appeal.id);
      await AdminService.resolveModerationAppeal(appeal.id, { status, resolutionNotes });
      showNotification('success', 'Appeal Updated', `Appeal ${appeal.id} was ${status.toLowerCase()}.`);
      await Promise.all([loadSummary(), loadAppeals(), loadTrustProfiles()]);
      if (selectedTrustUserId) await loadTrustDetail(selectedTrustUserId);
    } catch (error: any) {
      showNotification('alert', 'Appeal Resolve Failed', error?.message || 'Failed to resolve appeal');
    } finally {
      setResolvingAppealId(null);
    }
  };

  const recomputeProfile = async (userId: string) => {
    try {
      setRecomputingUserId(userId);
      await AdminService.recomputeTrustProfile(userId);
      showNotification('success', 'Trust Recomputed', 'Trust profile was recomputed successfully.');
      await Promise.all([loadSummary(), loadTrustProfiles(), loadRiskSignals()]);
      await loadTrustDetail(userId);
    } catch (error: any) {
      showNotification('alert', 'Trust Recompute Failed', error?.message || 'Failed to recompute trust profile');
    } finally {
      setRecomputingUserId(null);
    }
  };

  const saveRiskSignal = async () => {
    try {
      setSavingSignal(true);
      await AdminService.createRiskSignal({
        identifier: signalForm.identifier,
        signalType: signalForm.signalType,
        severity: signalForm.severity,
        source: signalForm.source,
        status: signalForm.status,
        reason: signalForm.reason,
        expiresAt: signalForm.expiresAt || null,
        metadata: signalForm.metadataText.trim() ? JSON.parse(signalForm.metadataText) : undefined
      });
      showNotification('success', 'Risk Signal Added', 'Manual risk signal created successfully.');
      setSignalForm(emptySignalForm);
      await Promise.all([loadSummary(), loadTrustProfiles(), loadRiskSignals()]);
    } catch (error: any) {
      showNotification('alert', 'Risk Signal Failed', error?.message || 'Failed to create risk signal');
    } finally {
      setSavingSignal(false);
    }
  };

  const toggleSignalStatus = async (signal: any) => {
    try {
      const nextStatus = signal.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE';
      await AdminService.updateRiskSignal(signal.id, { status: nextStatus });
      showNotification('info', 'Signal Updated', `Signal ${signal.signalType} marked ${nextStatus.toLowerCase()}.`);
      await Promise.all([loadSummary(), loadTrustProfiles(), loadRiskSignals()]);
      if (selectedTrustUserId) await loadTrustDetail(selectedTrustUserId);
    } catch (error: any) {
      showNotification('alert', 'Signal Update Failed', error?.message || 'Failed to update risk signal');
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Moderation and Trust Center...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Moderation and Trust Center</h2>
          <p className="text-sm text-gray-500">Native content policies, case queues, appeals, trust profiles, and manual risk signals.</p>
        </div>
        <button onClick={refreshAll} className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Policies', value: `${summary.activePolicies}/${summary.policies}` },
          { label: 'Open Cases', value: summary.openCases },
          { label: 'Appeals', value: `${summary.openAppeals}/${summary.appeals}` },
          { label: 'Trust Signals', value: summary.activeSignals }
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Content Policies</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={policyForm.key} onChange={(event) => setPolicyForm((current) => ({ ...current, key: event.target.value }))} placeholder="Policy key" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input value={policyForm.label} onChange={(event) => setPolicyForm((current) => ({ ...current, label: event.target.value }))} placeholder="Policy label" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input value={policyForm.contentType} onChange={(event) => setPolicyForm((current) => ({ ...current, contentType: event.target.value }))} placeholder="Content type" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={policyForm.severity} onChange={(event) => setPolicyForm((current) => ({ ...current, severity: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <select value={policyForm.action} onChange={(event) => setPolicyForm((current) => ({ ...current, action: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {['REVIEW', 'WARN', 'ESCALATE', 'RESTRICT'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </div>
              <textarea value={policyForm.description} onChange={(event) => setPolicyForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
              <textarea value={policyForm.thresholdsText} onChange={(event) => setPolicyForm((current) => ({ ...current, thresholdsText: event.target.value }))} placeholder='Thresholds JSON, e.g. {"toxicityScoreGte":0.8}' rows={4} className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={savePolicy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{savingPolicy ? 'Saving...' : editingPolicyId ? 'Update Policy' : 'Create Policy'}</button>
              <button onClick={resetPolicyForm} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Reset</button>
            </div>
            <div className="mt-4 flex items-center rounded-lg border border-gray-200 px-3">
              <Search className="mr-2 h-4 w-4 text-gray-400" />
              <input value={policyQuery} onChange={(event) => setPolicyQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') loadPolicies().catch((error: any) => showNotification('alert', 'Policy Search Failed', error?.message || 'Failed to search policies')); }} placeholder="Search policy key, label, content type" className="w-full bg-transparent py-2 text-sm outline-none" />
            </div>
            <div className="mt-4 space-y-2">
              {policies.map((policy) => (
                <div key={policy.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{policy.label}</div>
                      <div className="mt-1 text-xs text-gray-500">{policy.key} · {policy.contentType}</div>
                      {policy.description ? <div className="mt-1 text-xs text-gray-500">{policy.description}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(policy.severity)}`}>{policy.severity}</span>
                      <button onClick={() => startEditPolicy(policy)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Moderation Queues</h3>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center rounded-lg border border-gray-200 px-3">
                  <Search className="mr-2 h-4 w-4 text-gray-400" />
                  <input value={casesQuery} onChange={(event) => setCasesQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') loadCases().catch((error: any) => showNotification('alert', 'Case Search Failed', error?.message || 'Failed to search cases')); }} placeholder="Search case by content or user" className="w-full bg-transparent py-2 text-sm outline-none" />
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto">
                  {cases.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{item.contentType}</div>
                          <div className="mt-1 text-xs text-gray-500">{item.contentId}</div>
                          <div className="mt-1 text-xs text-gray-500">{item.author?.email || item.author?.name || 'Unknown author'}</div>
                          {item.reason ? <div className="mt-2 text-xs text-gray-500">{item.reason}</div> : null}
                        </div>
                        <div className="text-right">
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(item.status)}`}>{String(item.status || '').toUpperCase()}</span>
                          <div className="mt-2 text-xs text-gray-500">Score {Number(item.score || 0).toFixed(1)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[452px] overflow-y-auto">
                {appeals.map((appeal) => (
                  <div key={appeal.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">Appeal {appeal.id}</div>
                        <div className="mt-1 text-xs text-gray-500">Case {appeal.caseId} · {appeal.targetUser?.email || appeal.submittedByUser?.email || 'Unknown user'}</div>
                        <div className="mt-2 text-xs text-gray-600">{appeal.reason}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(appeal.status)}`}>{appeal.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => resolveAppeal(appeal, 'APPROVED')} disabled={resolvingAppealId === appeal.id} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Approve</button>
                      <button onClick={() => resolveAppeal(appeal, 'RESOLVED')} disabled={resolvingAppealId === appeal.id} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Resolve</button>
                      <button onClick={() => resolveAppeal(appeal, 'REJECTED')} disabled={resolvingAppealId === appeal.id} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                    </div>
                  </div>
                ))}
                {appeals.length === 0 ? <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">No appeals in queue.</div> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <UserRoundSearch className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Trust Profiles</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr,160px]">
              <input value={trustQuery} onChange={(event) => setTrustQuery(event.target.value)} placeholder="Search user email, username, or name" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <select value={selectedRiskLevel} onChange={(event) => setSelectedRiskLevel(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">All risk levels</option>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </select>
            </div>
            <div className="mt-4 space-y-2 max-h-[240px] overflow-y-auto">
              {trustProfiles.map((profile) => (
                <button key={profile.id} onClick={() => setSelectedTrustUserId(profile.userId)} className={`w-full rounded-lg border p-3 text-left ${selectedTrustUserId === profile.userId ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{profile.user?.email || profile.userId}</div>
                      <div className="mt-1 text-xs text-gray-500">{profile.user?.name || profile.user?.username || 'Scrolith user'}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(profile.riskLevel)}`}>{profile.riskLevel}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-500">
                    <div>Score {profile.score}</div>
                    <div>Signals {profile.signalCount}</div>
                    <div>Cases {profile.moderationCaseCount}</div>
                    <div>Fraud {profile.fraudScoreSnapshot}</div>
                  </div>
                </button>
              ))}
            </div>
            {selectedTrustProfile ? (
              <div className="mt-4 rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedTrustProfile.user?.email || selectedTrustProfile.userId}</div>
                    <div className="mt-1 text-xs text-gray-500">Updated {selectedTrustProfile.lastComputedAt ? new Date(selectedTrustProfile.lastComputedAt).toLocaleString() : 'Never'}</div>
                  </div>
                  <button onClick={() => recomputeProfile(selectedTrustProfile.userId)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">{recomputingUserId === selectedTrustProfile.userId ? 'Recomputing...' : 'Recompute'}</button>
                </div>
                {selectedTrustDetail ? (
                  <div className="mt-3 grid gap-2 text-xs text-gray-600">
                    <div>KYC: {selectedTrustDetail.user?.kycStatus || 'Unknown'}</div>
                    <div>Verified: {selectedTrustDetail.user?.isVerified ? 'Yes' : 'No'}</div>
                    <div>Account violations: {selectedTrustDetail.profile?.activeViolationCount ?? 0}</div>
                    <div>Wallet fraud score: {selectedTrustDetail.profile?.fraudScoreSnapshot ?? 0}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Risk Signals</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={signalForm.identifier} onChange={(event) => setSignalForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="User email, username, or ID" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input value={signalForm.signalType} onChange={(event) => setSignalForm((current) => ({ ...current, signalType: event.target.value }))} placeholder="Signal type" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2 md:col-span-2">
                <select value={signalForm.severity} onChange={(event) => setSignalForm((current) => ({ ...current, severity: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <select value={signalForm.source} onChange={(event) => setSignalForm((current) => ({ ...current, source: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {['MANUAL', 'FRAUD', 'MODERATION', 'KYC'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <input type="datetime-local" value={signalForm.expiresAt} onChange={(event) => setSignalForm((current) => ({ ...current, expiresAt: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <textarea value={signalForm.reason} onChange={(event) => setSignalForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
              <textarea value={signalForm.metadataText} onChange={(event) => setSignalForm((current) => ({ ...current, metadataText: event.target.value }))} placeholder='Metadata JSON, e.g. {"sourceCaseId":"..."}' rows={3} className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={saveRiskSignal} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{savingSignal ? 'Saving...' : 'Add Risk Signal'}</button>
              <button onClick={() => setSignalForm(emptySignalForm)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Reset</button>
            </div>
            <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto">
              {riskSignals.map((signal) => (
                <div key={signal.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{signal.signalType}</div>
                      <div className="mt-1 text-xs text-gray-500">{signal.user?.email || signal.userId} · {signal.source}</div>
                      <div className="mt-2 text-xs text-gray-600">{signal.reason}</div>
                      {signal.expiresAt ? <div className="mt-1 text-xs text-gray-500">Expires {new Date(signal.expiresAt).toLocaleString()}</div> : null}
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(signal.severity)}`}>{signal.severity}</span>
                      <div className="mt-2">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badgeTone(signal.status)}`}>{signal.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => toggleSignalStatus(signal)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">{signal.status === 'ACTIVE' ? 'Resolve' : 'Reactivate'}</button>
                    <button onClick={() => setSelectedTrustUserId(signal.userId)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">View Trust</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModerationTrustCenter;
