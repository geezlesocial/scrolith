import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react';
import type { DealFlowSettings } from '../../types';
import type { Proposal, AcceptProposalData } from '../../services/proposals';

interface AcceptProposalContractModalProps {
  open: boolean;
  proposal: Proposal | null;
  dealFlowConfig?: DealFlowSettings | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: AcceptProposalData) => Promise<void> | void;
}

type DraftMilestone = {
  id: string;
  title: string;
  description: string;
  amount: string;
  dueDate: string;
};

const toDateInput = (value: Date) => {
  const next = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return next.toISOString().slice(0, 10);
};

const makeMilestoneId = () => `milestone_${Math.random().toString(36).slice(2, 9)}`;

const createSeedMilestones = (
  count: number,
  total: number,
  startDate: string,
  deliveryDays: number
): DraftMilestone[] => {
  const safeCount = Math.max(1, count);
  const start = startDate ? new Date(startDate) : new Date();
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const baseAmount = Number((total / safeCount).toFixed(2));

  return Array.from({ length: safeCount }, (_, index) => {
    const amount =
      index === safeCount - 1
        ? Number((total - baseAmount * (safeCount - 1)).toFixed(2))
        : baseAmount;
    const offsetDays = Math.max(0, Math.round(((index + 1) * deliveryDays) / safeCount) - 1);
    const due = new Date(safeStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return {
      id: makeMilestoneId(),
      title:
        index === 0
          ? 'Kickoff and discovery'
          : index === safeCount - 1
            ? 'Final delivery'
            : `Milestone ${index + 1}`,
      description: '',
      amount: String(amount),
      dueDate: toDateInput(due)
    };
  });
};

const normalizePaymentCycle = (value: string | undefined) => {
  const normalized = String(value || 'WEEKLY').trim().toUpperCase();
  if (normalized === 'BIWEEKLY' || normalized === 'BI-WEEKLY' || normalized === 'BI_WEEKLY') return 'BIWEEKLY';
  if (normalized === 'MONTHLY') return 'MONTHLY';
  return 'WEEKLY';
};

const resolveDefaultContractType = (proposal: Proposal | null, dealFlowConfig?: DealFlowSettings | null) => {
  const rules = dealFlowConfig?.contractRules ?? dealFlowConfig?.contract_rules;
  const allowFixed = rules?.allowFixedContracts ?? rules?.allow_fixed_contracts ?? true;
  const allowHourly = rules?.allowHourlyContracts ?? rules?.allow_hourly_contracts ?? true;
  const jobType = String(proposal?.jobType || '').trim().toUpperCase();
  if (!allowHourly) return 'fixed';
  if (!allowFixed) return 'hourly';
  return jobType === 'HOURLY' ? 'hourly' : 'fixed';
};

export const AcceptProposalContractModal: React.FC<AcceptProposalContractModalProps> = ({
  open,
  proposal,
  dealFlowConfig,
  loading = false,
  onClose,
  onSubmit
}) => {
  const contractTemplates = useMemo(
    () => dealFlowConfig?.contractTemplates ?? dealFlowConfig?.contract_templates ?? [],
    [dealFlowConfig]
  );

  const [templateId, setTemplateId] = useState('');
  const [contractType, setContractType] = useState<'fixed' | 'hourly'>('fixed');
  const [startDate, setStartDate] = useState('');
  const [paymentCycle, setPaymentCycle] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('14');
  const [weeklyHourCap, setWeeklyHourCap] = useState('40');
  const [milestones, setMilestones] = useState<DraftMilestone[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const defaults = dealFlowConfig?.contractDefaults ?? dealFlowConfig?.contract_defaults;
    const defaultType = resolveDefaultContractType(proposal, dealFlowConfig);
    const leadDays = Number(defaults?.startLeadDays ?? defaults?.start_lead_days ?? 2);
    const start = new Date();
    start.setDate(start.getDate() + Math.max(0, leadDays));
    const seededDeliveryDays = Number(proposal?.proposedTimeline || 14);
    const seededValue = Number(proposal?.proposedAmount || 0);
    const seededMilestoneCount = Number(
      defaults?.fixedMilestoneCount ?? defaults?.fixed_milestone_count ?? 3
    );

    setTemplateId('');
    setContractType(defaultType);
    setStartDate(toDateInput(start));
    setPaymentCycle(normalizePaymentCycle(dealFlowConfig?.proposalDefaults?.paymentCycle));
    setDescription('');
    setHourlyRate(defaultType === 'hourly' ? String(seededValue || 0) : '');
    setContractValue(defaultType === 'fixed' ? String(seededValue || 0) : '');
    setDeliveryDays(String(seededDeliveryDays || 14));
    setWeeklyHourCap(
      String(defaults?.hourlyWeeklyCap ?? defaults?.hourly_weekly_cap ?? 40)
    );
    setMilestones(
      defaultType === 'fixed'
        ? createSeedMilestones(seededMilestoneCount, seededValue || 0, toDateInput(start), seededDeliveryDays || 14)
        : []
    );
    setError('');
  }, [dealFlowConfig, open, proposal]);

  useEffect(() => {
    if (!open || !templateId) return;
    const template = contractTemplates.find((entry) => String(entry.id || '').trim() === templateId);
    if (!template) return;
    const nextType = String(template.contractType || template.contract_type || '').trim().toUpperCase() === 'HOURLY'
      ? 'hourly'
      : 'fixed';
    setContractType(nextType);
    setPaymentCycle(normalizePaymentCycle(String((template.paymentCycle ?? template.payment_cycle) || paymentCycle)));
    if (template.summary) setDescription(String(template.summary));
    if (nextType === 'fixed') {
      const nextValue = Number(contractValue || proposal?.proposedAmount || 0);
      const nextDays = Number(deliveryDays || proposal?.proposedTimeline || 14);
      const count = Number(template.milestoneCount ?? template.milestone_count ?? 3);
      setMilestones(createSeedMilestones(count, nextValue, startDate, nextDays));
    } else {
      setMilestones([]);
    }
  }, [contractTemplates, contractValue, deliveryDays, open, paymentCycle, proposal?.proposedAmount, proposal?.proposedTimeline, startDate, templateId]);

  useEffect(() => {
    if (!open) return;
    if (contractType === 'hourly') {
      if (milestones.length) setMilestones([]);
      return;
    }
    if (milestones.length) return;
    const defaults = dealFlowConfig?.contractDefaults ?? dealFlowConfig?.contract_defaults;
    const count = Number(defaults?.fixedMilestoneCount ?? defaults?.fixed_milestone_count ?? 3);
    const total = Number(contractValue || proposal?.proposedAmount || 0);
    const days = Number(deliveryDays || proposal?.proposedTimeline || 14);
    setMilestones(createSeedMilestones(count, total, startDate, days));
  }, [contractType, contractValue, dealFlowConfig, deliveryDays, milestones.length, open, proposal?.proposedAmount, proposal?.proposedTimeline, startDate]);

  if (!open || !proposal) return null;

  const rules = dealFlowConfig?.contractRules ?? dealFlowConfig?.contract_rules;
  const allowFixed = rules?.allowFixedContracts ?? rules?.allow_fixed_contracts ?? true;
  const allowHourly = rules?.allowHourlyContracts ?? rules?.allow_hourly_contracts ?? true;
  const maxMilestones = Number(rules?.maxMilestones ?? rules?.max_milestones ?? 8);
  const requireMilestones = rules?.requireMilestonesForFixed ?? rules?.require_milestones_for_fixed ?? true;

  const totalMilestoneAmount = milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0);

  const handleMilestoneChange = (id: string, key: keyof DraftMilestone, value: string) => {
    setMilestones((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [key]: value } : entry))
    );
  };

  const handleAddMilestone = () => {
    if (milestones.length >= maxMilestones) return;
    const nextDue = milestones[milestones.length - 1]?.dueDate || startDate;
    setMilestones((current) => [
      ...current,
      {
        id: makeMilestoneId(),
        title: `Milestone ${current.length + 1}`,
        description: '',
        amount: '0',
        dueDate: nextDue
      }
    ]);
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSubmit = async () => {
    setError('');
    const nextDeliveryDays = Math.max(1, Number(deliveryDays || 14));
    const nextStartDate = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(nextStartDate.getTime())) {
      setError('Choose a valid contract start date.');
      return;
    }

    if (contractType === 'hourly') {
      const nextRate = Number(hourlyRate || 0);
      if (!Number.isFinite(nextRate) || nextRate <= 0) {
        setError('Enter a valid hourly rate.');
        return;
      }
    } else {
      const nextValue = Number(contractValue || 0);
      if (!Number.isFinite(nextValue) || nextValue <= 0) {
        setError('Enter a valid fixed contract value.');
        return;
      }
      if (requireMilestones && milestones.length === 0) {
        setError('Add at least one milestone for a fixed contract.');
        return;
      }
      if (milestones.some((entry) => !entry.title.trim() || !entry.dueDate || Number(entry.amount || 0) <= 0)) {
        setError('Each milestone needs a title, due date, and positive amount.');
        return;
      }
      if (milestones.length > 0 && Math.abs(totalMilestoneAmount - nextValue) > 0.01) {
        setError('Milestone amounts must add up to the fixed contract value.');
        return;
      }
    }

    await onSubmit({
      templateId: templateId || undefined,
      contractType,
      startDate: nextStartDate.toISOString(),
      paymentCycle,
      description: description.trim() || undefined,
      hourlyRate: contractType === 'hourly' ? Number(hourlyRate || 0) : undefined,
      contractValue: contractType === 'fixed' ? Number(contractValue || 0) : undefined,
      deliveryDays: nextDeliveryDays,
      weeklyHourCap: contractType === 'hourly' ? Number(weeklyHourCap || 0) : undefined,
      milestones:
        contractType === 'fixed'
          ? milestones.map((entry, index) => ({
              id: entry.id,
              title: entry.title.trim(),
              description: entry.description.trim() || undefined,
              amount: Number(entry.amount || 0),
              dueDate: new Date(entry.dueDate).toISOString(),
              order: index
            }))
          : undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 md:p-6">
      <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 md:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Proposal to Contract</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Accept {proposal.freelancerName}&apos;s proposal</h3>
              <p className="mt-1 text-sm text-slate-500">
                Build the live contract plan before the proposal moves into the active deal pipeline.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 md:px-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">{proposal.jobTitle || 'Untitled job'}</span>
                    {proposal.jobBudget ? <span className="rounded-full bg-white px-3 py-1">{proposal.jobBudget}</span> : null}
                    <span className="rounded-full bg-white px-3 py-1">${proposal.proposedAmount.toFixed(2)} proposed</span>
                    <span className="rounded-full bg-white px-3 py-1">{proposal.proposedTimeline} day timeline</span>
                  </div>
                  {proposal.coverLetter ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{proposal.coverLetter}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {contractTemplates.length ? (
                    <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contract Template</span>
                      <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">Choose a template</option>
                        {contractTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contract Type</span>
                    <select
                      value={contractType}
                      onChange={(e) => setContractType(e.target.value === 'hourly' ? 'hourly' : 'fixed')}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {allowFixed ? <option value="fixed">Fixed price</option> : null}
                      {allowHourly ? <option value="hourly">Hourly</option> : null}
                    </select>
                  </label>

                  <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Start Date</span>
                    <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full border-0 bg-transparent px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                  </label>

                  <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Payment Cycle</span>
                    <select
                      value={paymentCycle}
                      onChange={(e) => setPaymentCycle(normalizePaymentCycle(e.target.value) as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="WEEKLY">Weekly</option>
                      <option value="BIWEEKLY">Bi-weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </label>

                  <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 md:col-span-2">
                    <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contract Summary</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Capture deliverables, approval checkpoints, communication rules, or any terms both parties should see in the contract."
                    />
                  </label>

                  {contractType === 'hourly' ? (
                    <>
                      <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Hourly Rate</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={hourlyRate}
                          onChange={(e) => setHourlyRate(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Weekly Hour Cap</span>
                        <input
                          type="number"
                          min={1}
                          max={168}
                          value={weeklyHourCap}
                          onChange={(e) => setWeeklyHourCap(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contract Value</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={contractValue}
                          onChange={(e) => setContractValue(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Delivery Window (days)</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={deliveryDays}
                          onChange={(e) => setDeliveryDays(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </>
                  )}
                </div>

                {contractType === 'fixed' ? (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Milestone Schedule</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Track delivery checkpoints and payment visibility inside the contract timeline.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddMilestone}
                        disabled={milestones.length >= maxMilestones}
                        className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add milestone
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {milestones.map((milestone, index) => (
                        <div key={milestone.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_160px_170px_auto]">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Title</label>
                              <input
                                type="text"
                                value={milestone.title}
                                onChange={(e) => handleMilestoneChange(milestone.id, 'title', e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Amount</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={milestone.amount}
                                onChange={(e) => handleMilestoneChange(milestone.id, 'amount', e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Due Date</label>
                              <input
                                type="date"
                                value={milestone.dueDate}
                                onChange={(e) => handleMilestoneChange(milestone.id, 'dueDate', e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveMilestone(milestone.id)}
                                disabled={milestones.length <= 1}
                                className="rounded-xl border border-rose-200 p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                                title={`Remove milestone ${index + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3">
                            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Deliverable Notes</label>
                            <textarea
                              rows={2}
                              value={milestone.description}
                              onChange={(e) => handleMilestoneChange(milestone.id, 'description', e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Contract Snapshot</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Mode</span>
                      <span className="font-semibold capitalize">{contractType}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Starts</span>
                      <span className="font-semibold">{startDate || 'TBD'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Cycle</span>
                      <span className="font-semibold">{paymentCycle.replace('BIWEEKLY', 'Bi-weekly').replace('WEEKLY', 'Weekly').replace('MONTHLY', 'Monthly')}</span>
                    </div>
                    {contractType === 'hourly' ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Rate</span>
                          <span className="font-semibold">${Number(hourlyRate || 0).toFixed(2)}/hr</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Weekly cap</span>
                          <span className="font-semibold">{weeklyHourCap || 0} hours</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Contract value</span>
                          <span className="font-semibold">${Number(contractValue || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Milestones</span>
                          <span className="font-semibold">{milestones.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Milestone total</span>
                          <span className={`font-semibold ${Math.abs(totalMilestoneAmount - Number(contractValue || 0)) > 0.01 ? 'text-amber-300' : 'text-emerald-300'}`}>
                            ${totalMilestoneAmount.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-bold text-slate-900">Policy Guardrails</h4>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                    <li>Allowed modes: {allowFixed && allowHourly ? 'Fixed and hourly' : allowFixed ? 'Fixed only' : 'Hourly only'}.</li>
                    <li>Maximum milestones per fixed contract: {maxMilestones}.</li>
                    <li>{requireMilestones ? 'Fixed contracts require milestone checkpoints.' : 'Milestones are optional for fixed contracts.'}</li>
                  </ul>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}
              </aside>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-end md:px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Creating contract...' : 'Accept Proposal & Create Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcceptProposalContractModal;
