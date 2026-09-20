export type ContractTypeDb = 'FIXED' | 'HOURLY'
export type PaymentCycleDb = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY'
export type PaymentCycleView = 'weekly' | 'bi-weekly' | 'monthly'
export type ContractMilestoneStatus = 'pending' | 'submitted' | 'approved' | 'paid'

export interface ContractMilestoneRecord {
  id: string
  title: string
  description?: string
  amount: number
  dueDate: string
  order: number
  status: ContractMilestoneStatus
  submittedAt?: string
  approvedAt?: string
  paidAt?: string
}

export interface ContractPaymentScheduleRecord {
  model: 'fixed' | 'hourly'
  paymentCycle: PaymentCycleView
  contractValue?: number
  hourlyRate?: number
  weeklyHourCap?: number
  depositPercent?: number
  milestoneCount?: number
  clientFeePercent?: number
  contractorFeePercent?: number
  allowDeposits?: boolean
}

type DealFlowContractTemplateLike = {
  id?: string
  contractType?: string
  contract_type?: string
  paymentCycle?: string
  payment_cycle?: string
  milestoneCount?: number
  milestone_count?: number
  summary?: string
}

type DealFlowSettingsLike = {
  contractTemplates?: DealFlowContractTemplateLike[]
  contract_templates?: DealFlowContractTemplateLike[]
  contractDefaults?: {
    startLeadDays?: number
    start_lead_days?: number
    fixedMilestoneCount?: number
    fixed_milestone_count?: number
    hourlyWeeklyCap?: number
    hourly_weekly_cap?: number
    upfrontPercent?: number
    upfront_percent?: number
  }
  contract_defaults?: {
    startLeadDays?: number
    start_lead_days?: number
    fixedMilestoneCount?: number
    fixed_milestone_count?: number
    hourlyWeeklyCap?: number
    hourly_weekly_cap?: number
    upfrontPercent?: number
    upfront_percent?: number
  }
  contractRules?: {
    allowFixedContracts?: boolean
    allow_fixed_contracts?: boolean
    allowHourlyContracts?: boolean
    allow_hourly_contracts?: boolean
    requireMilestonesForFixed?: boolean
    require_milestones_for_fixed?: boolean
    maxMilestones?: number
    max_milestones?: number
  }
  contract_rules?: {
    allowFixedContracts?: boolean
    allow_fixed_contracts?: boolean
    allowHourlyContracts?: boolean
    allow_hourly_contracts?: boolean
    requireMilestonesForFixed?: boolean
    require_milestones_for_fixed?: boolean
    maxMilestones?: number
    max_milestones?: number
  }
  feePolicy?: {
    clientFeePercent?: number
    client_fee_percent?: number
    contractorFeePercent?: number
    contractor_fee_percent?: number
    allowDeposits?: boolean
    allow_deposits?: boolean
  }
  fee_policy?: {
    clientFeePercent?: number
    client_fee_percent?: number
    contractorFeePercent?: number
    contractor_fee_percent?: number
    allowDeposits?: boolean
    allow_deposits?: boolean
  }
}

type ProposalLike = {
  proposedAmount?: number
  proposedTimeline?: number
  job?: {
    type?: string | null
    description?: string | null
  } | null
}

const clampNumber = (value: any, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

const asMoney = (value: any, fallback = 0) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return Number(fallback.toFixed(2))
  return Number(numeric.toFixed(2))
}

const slugify = (value: string) =>
  String(value || '').slice(0, 256)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const normalizePaymentCycleDb = (value: any, fallback: PaymentCycleDb = 'WEEKLY'): PaymentCycleDb => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'BIWEEKLY' || normalized === 'BI_WEEKLY' || normalized === 'BI-WEEKLY') return 'BI_WEEKLY'
  if (normalized === 'MONTHLY') return 'MONTHLY'
  if (normalized === 'WEEKLY') return 'WEEKLY'
  return fallback
}

export const paymentCycleDbToView = (value: any): PaymentCycleView => {
  const normalized = normalizePaymentCycleDb(value)
  if (normalized === 'BI_WEEKLY') return 'bi-weekly'
  if (normalized === 'MONTHLY') return 'monthly'
  return 'weekly'
}

export const normalizeContractTypeDb = (value: any, fallback: ContractTypeDb = 'FIXED'): ContractTypeDb => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'HOURLY') return 'HOURLY'
  if (normalized === 'FIXED') return 'FIXED'
  return fallback
}

const resolveTemplate = (settings: DealFlowSettingsLike | null | undefined, templateId: string) => {
  const templates = Array.isArray(settings?.contractTemplates ?? settings?.contract_templates)
    ? ((settings?.contractTemplates ?? settings?.contract_templates) as DealFlowContractTemplateLike[])
    : []
  return templates.find((entry) => String(entry?.id || '').trim() === templateId) || null
}

export const normalizeStoredMilestones = (raw: any): ContractMilestoneRecord[] => {
  if (!Array.isArray(raw)) return []
  const normalized = raw
    .map((entry: any, index: number) => {
      const dueDate = new Date(entry?.dueDate ?? entry?.due_date ?? Date.now())
      const normalizedDate = Number.isNaN(dueDate.getTime()) ? new Date() : dueDate
      const statusRaw = String(entry?.status || '').trim().toLowerCase()
      const status: ContractMilestoneStatus =
        statusRaw === 'submitted' || statusRaw === 'approved' || statusRaw === 'paid' ? (statusRaw as ContractMilestoneStatus) : 'pending'
      const amount = asMoney(entry?.amount, 0)
      const title = String(entry?.title || '').trim()
      if (!title || amount <= 0) return null
      return {
        id: String(entry?.id || `${slugify(title) || 'milestone'}_${index + 1}`),
        title,
        description: String(entry?.description || '').trim() || undefined,
        amount,
        dueDate: normalizedDate.toISOString(),
        order: Number.isFinite(Number(entry?.order)) ? Math.max(0, Math.trunc(Number(entry.order))) : index,
        status,
        submittedAt: String((entry?.submittedAt ?? entry?.submitted_at) || '').trim() || undefined,
        approvedAt: String((entry?.approvedAt ?? entry?.approved_at) || '').trim() || undefined,
        paidAt: String((entry?.paidAt ?? entry?.paid_at) || '').trim() || undefined
      }
    })
    .filter(Boolean) as ContractMilestoneRecord[]

  return normalized.sort((left, right) => left.order - right.order)
}

export const normalizeStoredPaymentSchedule = (raw: any): ContractPaymentScheduleRecord | null => {
  if (!raw || typeof raw !== 'object') return null
  const model = String(raw.model || '').trim().toLowerCase() === 'hourly' ? 'hourly' : 'fixed'
  return {
    model,
    paymentCycle: paymentCycleDbToView(raw.paymentCycle ?? raw.payment_cycle),
    contractValue: raw.contractValue !== undefined || raw.contract_value !== undefined ? asMoney(raw.contractValue ?? raw.contract_value, 0) : undefined,
    hourlyRate: raw.hourlyRate !== undefined || raw.hourly_rate !== undefined ? asMoney(raw.hourlyRate ?? raw.hourly_rate, 0) : undefined,
    weeklyHourCap: raw.weeklyHourCap !== undefined || raw.weekly_hour_cap !== undefined ? clampNumber(raw.weeklyHourCap ?? raw.weekly_hour_cap, 0, 0, 168) : undefined,
    depositPercent: raw.depositPercent !== undefined || raw.deposit_percent !== undefined ? clampNumber(raw.depositPercent ?? raw.deposit_percent, 0, 0, 100) : undefined,
    milestoneCount: raw.milestoneCount !== undefined || raw.milestone_count !== undefined ? clampNumber(raw.milestoneCount ?? raw.milestone_count, 0, 0, 20) : undefined,
    clientFeePercent: raw.clientFeePercent !== undefined || raw.client_fee_percent !== undefined ? clampNumber(raw.clientFeePercent ?? raw.client_fee_percent, 0, 0, 100) : undefined,
    contractorFeePercent: raw.contractorFeePercent !== undefined || raw.contractor_fee_percent !== undefined ? clampNumber(raw.contractorFeePercent ?? raw.contractor_fee_percent, 0, 0, 100) : undefined,
    allowDeposits: raw.allowDeposits !== undefined || raw.allow_deposits !== undefined ? Boolean(raw.allowDeposits ?? raw.allow_deposits) : undefined
  }
}

export const buildContractPlan = (input: {
  proposal: ProposalLike
  payload?: any
  settings?: DealFlowSettingsLike | null
}) => {
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {}
  const settings = input.settings || {}
  const contractDefaults = (settings.contractDefaults ?? settings.contract_defaults) || {}
  const contractRules = (settings.contractRules ?? settings.contract_rules) || {}
  const feePolicy = (settings.feePolicy ?? settings.fee_policy) || {}

  const templateId = String((payload.templateId ?? payload.template_id) || '').trim()
  const template = templateId ? resolveTemplate(settings, templateId) : null
  const defaultType =
    String(input.proposal?.job?.type || '').trim().toUpperCase() === 'HOURLY' ? 'HOURLY' : 'FIXED'
  const contractType = normalizeContractTypeDb(
    payload.contractType ?? payload.contract_type ?? template?.contractType,
    defaultType as ContractTypeDb
  )

  const allowFixedContracts =
    contractRules.allowFixedContracts ?? contractRules.allow_fixed_contracts ?? true
  const allowHourlyContracts =
    contractRules.allowHourlyContracts ?? contractRules.allow_hourly_contracts ?? true
  if (contractType === 'FIXED' && allowFixedContracts === false) {
    throw new Error('Fixed contracts are disabled by deal flow policy')
  }
  if (contractType === 'HOURLY' && allowHourlyContracts === false) {
    throw new Error('Hourly contracts are disabled by deal flow policy')
  }

  const startLeadDays = clampNumber(
    contractDefaults.startLeadDays ?? contractDefaults.start_lead_days,
    2,
    0,
    30
  )
  const startDateRaw = payload.startDate ?? payload.start_date
  const startDate = startDateRaw
    ? new Date(startDateRaw)
    : new Date(Date.now() + startLeadDays * 24 * 60 * 60 * 1000)
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Invalid contract start date')
  }

  const paymentCycle = normalizePaymentCycleDb(
    payload.paymentCycle ?? payload.payment_cycle ?? template?.paymentCycle,
    contractType === 'HOURLY' ? 'WEEKLY' : 'MONTHLY'
  )
  const deliveryDays = Math.max(
    1,
    Math.trunc(
      clampNumber(
        payload.deliveryDays ?? payload.delivery_days ?? input.proposal?.proposedTimeline,
        14,
        1,
        365
      )
    )
  )
  const description = String(
    payload.description ??
      payload.scopeSummary ??
      payload.scope_summary ??
      template?.summary ??
      input.proposal?.job?.description ??
      ''
  ).trim()

  const clientFeePercent = clampNumber(
    feePolicy.clientFeePercent ?? feePolicy.client_fee_percent,
    0,
    0,
    100
  )
  const contractorFeePercent = clampNumber(
    feePolicy.contractorFeePercent ?? feePolicy.contractor_fee_percent,
    0,
    0,
    100
  )
  const allowDeposits = Boolean(feePolicy.allowDeposits ?? feePolicy.allow_deposits ?? true)
  const depositPercent = clampNumber(
    contractDefaults.upfrontPercent ?? contractDefaults.upfront_percent,
    30,
    0,
    100
  )

  if (contractType === 'HOURLY') {
    const hourlyRate = asMoney(
      payload.hourlyRate ?? payload.hourly_rate ?? input.proposal?.proposedAmount,
      0
    )
    if (hourlyRate <= 0) {
      throw new Error('Hourly contracts require a positive hourly rate')
    }

    const weeklyHourCap = Math.trunc(
      clampNumber(
        payload.weeklyHourCap ??
          payload.weekly_hour_cap ??
          contractDefaults.hourlyWeeklyCap ??
          contractDefaults.hourly_weekly_cap,
        40,
        1,
        168
      )
    )

    return {
      contractType,
      startDate,
      paymentCycle,
      description,
      deliveryDays,
      hourlyRate,
      contractValue: null,
      milestones: [] as ContractMilestoneRecord[],
      paymentSchedule: {
        model: 'hourly',
        paymentCycle: paymentCycleDbToView(paymentCycle),
        hourlyRate,
        weeklyHourCap,
        depositPercent: allowDeposits ? depositPercent : 0,
        clientFeePercent,
        contractorFeePercent,
        allowDeposits
      } as ContractPaymentScheduleRecord
    }
  }

  const contractValue = asMoney(
    payload.contractValue ?? payload.contract_value ?? input.proposal?.proposedAmount,
    0
  )
  if (contractValue <= 0) {
    throw new Error('Fixed contracts require a positive contract value')
  }

  const requireMilestonesForFixed =
    contractRules.requireMilestonesForFixed ?? contractRules.require_milestones_for_fixed ?? true
  const maxMilestones = Math.trunc(
    clampNumber(
      contractRules.maxMilestones ?? contractRules.max_milestones,
      8,
      1,
      20
    )
  )
  const rawMilestones = normalizeStoredMilestones(payload.milestones)

  let milestones = rawMilestones
  if (!milestones.length && requireMilestonesForFixed) {
    const milestoneCount = Math.trunc(
      clampNumber(
        template?.milestoneCount ??
          template?.milestone_count ??
          contractDefaults.fixedMilestoneCount ??
          contractDefaults.fixed_milestone_count,
        3,
        1,
        Math.min(12, maxMilestones)
      )
    )

    const baseAmount = Number((contractValue / milestoneCount).toFixed(2))
    const running = Array.from({ length: milestoneCount }, (_, index) => {
      const amount = index === milestoneCount - 1
        ? Number((contractValue - baseAmount * (milestoneCount - 1)).toFixed(2))
        : baseAmount
      const offsetDays = Math.max(0, Math.round(((index + 1) * deliveryDays) / milestoneCount) - 1)
      return {
        id: `milestone_${index + 1}`,
        title: index === 0 ? 'Kickoff and discovery' : index === milestoneCount - 1 ? 'Final delivery' : `Milestone ${index + 1}`,
        amount,
        dueDate: new Date(startDate.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString(),
        order: index,
        status: 'pending' as ContractMilestoneStatus
      }
    })
    milestones = running
  }

  if (milestones.length > maxMilestones) {
    throw new Error(`Fixed contracts can include at most ${maxMilestones} milestones`)
  }

  if (requireMilestonesForFixed && milestones.length === 0) {
    throw new Error('Fixed contracts require at least one milestone')
  }

  const milestoneTotal = asMoney(
    milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0),
    0
  )
  if (milestones.length && Math.abs(milestoneTotal - contractValue) > 0.01) {
    throw new Error('Milestone amounts must add up to the fixed contract value')
  }

  return {
    contractType,
    startDate,
    paymentCycle,
    description,
    deliveryDays,
    hourlyRate: 0,
    contractValue,
    milestones,
    paymentSchedule: {
      model: 'fixed',
      paymentCycle: paymentCycleDbToView(paymentCycle),
      contractValue,
      depositPercent: allowDeposits ? depositPercent : 0,
      milestoneCount: milestones.length,
      clientFeePercent,
      contractorFeePercent,
      allowDeposits
    } as ContractPaymentScheduleRecord
  }
}
