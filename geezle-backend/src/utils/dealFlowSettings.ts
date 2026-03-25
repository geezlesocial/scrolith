type DealFlowTemplate = {
  id: string
  label: string
  category: string
  summary?: string
}

type DealFlowTimelineSettings = {
  briefs: boolean
  proposals: boolean
  contracts: boolean
}

type DealFlowProposalDefaults = {
  timelineDays: number
  paymentCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  coverLetterIntro: string
}

type DealFlowContractTemplate = {
  id: string
  label: string
  contractType: 'FIXED' | 'HOURLY'
  paymentCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  milestoneCount?: number
  summary?: string
}

type DealFlowContractDefaults = {
  startLeadDays: number
  fixedMilestoneCount: number
  hourlyWeeklyCap: number
  upfrontPercent: number
}

type DealFlowContractRules = {
  allowFixedContracts: boolean
  allowHourlyContracts: boolean
  requireMilestonesForFixed: boolean
  maxMilestones: number
}

type DealFlowFeePolicy = {
  clientFeePercent: number
  contractorFeePercent: number
  allowDeposits: boolean
}

export type DealFlowSettingsNormalized = {
  enabled: boolean
  allowCreateBriefFromChat: boolean
  allowBriefToProposal: boolean
  autoCreatePrivateJobs: boolean
  defaultCategory: string
  allowedCategories: string[]
  templates: DealFlowTemplate[]
  timeline: DealFlowTimelineSettings
  proposalDefaults: DealFlowProposalDefaults
  contractTemplates: DealFlowContractTemplate[]
  contractDefaults: DealFlowContractDefaults
  contractRules: DealFlowContractRules
  feePolicy: DealFlowFeePolicy
}

const DEFAULT_TEMPLATES: DealFlowTemplate[] = [
  {
    id: 'general_project',
    label: 'General Project',
    category: 'General',
    summary: 'Use for broad project scoping, deliverables, timeline, and budget alignment.'
  },
  {
    id: 'website_build',
    label: 'Website Build',
    category: 'Development',
    summary: 'Capture pages, integrations, launch goals, and technical constraints.'
  },
  {
    id: 'brand_campaign',
    label: 'Brand Campaign',
    category: 'Marketing',
    summary: 'Scope assets, channels, audience, timeline, and reporting expectations.'
  }
]

const DEFAULT_ALLOWED_CATEGORIES = [
  'General',
  'Development',
  'Design',
  'Marketing',
  'Content',
  'Operations'
]

const DEFAULT_CONTRACT_TEMPLATES: DealFlowContractTemplate[] = [
  {
    id: 'fixed_milestone_delivery',
    label: 'Fixed Milestone Delivery',
    contractType: 'FIXED',
    paymentCycle: 'MONTHLY',
    milestoneCount: 3,
    summary: 'Use for scoped delivery work with milestone-based approvals and payout checkpoints.'
  },
  {
    id: 'hourly_retainer',
    label: 'Hourly Retainer',
    contractType: 'HOURLY',
    paymentCycle: 'WEEKLY',
    milestoneCount: 0,
    summary: 'Use for ongoing retainer work with a weekly review and payment cadence.'
  }
]

export const DEFAULT_DEAL_FLOW_SETTINGS: DealFlowSettingsNormalized = {
  enabled: true,
  allowCreateBriefFromChat: true,
  allowBriefToProposal: true,
  autoCreatePrivateJobs: true,
  defaultCategory: 'General',
  allowedCategories: DEFAULT_ALLOWED_CATEGORIES,
  templates: DEFAULT_TEMPLATES,
  timeline: {
    briefs: true,
    proposals: true,
    contracts: true
  },
  proposalDefaults: {
    timelineDays: 14,
    paymentCycle: 'WEEKLY',
    coverLetterIntro: ''
  },
  contractTemplates: DEFAULT_CONTRACT_TEMPLATES,
  contractDefaults: {
    startLeadDays: 2,
    fixedMilestoneCount: 3,
    hourlyWeeklyCap: 40,
    upfrontPercent: 30
  },
  contractRules: {
    allowFixedContracts: true,
    allowHourlyContracts: true,
    requireMilestonesForFixed: true,
    maxMilestones: 8
  },
  feePolicy: {
    clientFeePercent: 0,
    contractorFeePercent: 0,
    allowDeposits: true
  }
}

const toBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return fallback
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const toNumber = (value: any, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

const toNonEmptyString = (value: any, fallback: string) => {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

const normalizeTemplate = (value: any, fallback: DealFlowTemplate, index: number): DealFlowTemplate => {
  const template = value && typeof value === 'object' ? value : {}
  return {
    id: toNonEmptyString(template.id, fallback.id || `template_${index + 1}`),
    label: toNonEmptyString(template.label, fallback.label),
    category: toNonEmptyString(template.category, fallback.category),
    summary: String(template.summary || fallback.summary || '').trim() || undefined
  }
}

const normalizePaymentCycle = (value: any, fallback: DealFlowProposalDefaults['paymentCycle']) => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'WEEKLY' || normalized === 'BIWEEKLY' || normalized === 'MONTHLY') {
    return normalized
  }
  return fallback
}

const normalizeContractType = (value: any, fallback: DealFlowContractTemplate['contractType']) => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'FIXED' || normalized === 'HOURLY') return normalized
  return fallback
}

const normalizeContractTemplate = (
  value: any,
  fallback: DealFlowContractTemplate,
  index: number
): DealFlowContractTemplate => {
  const template = value && typeof value === 'object' ? value : {}
  return {
    id: toNonEmptyString(template.id, fallback.id || `contract_template_${index + 1}`),
    label: toNonEmptyString(template.label, fallback.label),
    contractType: normalizeContractType(template.contractType ?? template.contract_type, fallback.contractType),
    paymentCycle: normalizePaymentCycle(
      template.paymentCycle ?? template.payment_cycle,
      fallback.paymentCycle
    ),
    milestoneCount: toNumber(
      template.milestoneCount ?? template.milestone_count,
      Number(fallback.milestoneCount || 0),
      0,
      12
    ),
    summary: String(template.summary || fallback.summary || '').trim() || undefined
  }
}

export const normalizeDealFlowSettings = (raw: any): DealFlowSettingsNormalized => {
  const source = raw && typeof raw === 'object' ? raw : {}
  const allowedCategories = Array.from(
    new Set(
      (Array.isArray(source.allowedCategories) ? source.allowedCategories : source.allowed_categories) || []
    )
  )
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)

  const templatesRaw = Array.isArray(source.templates) ? source.templates : []
  const templates = (templatesRaw.length ? templatesRaw : DEFAULT_TEMPLATES).map((entry, index) =>
    normalizeTemplate(entry, DEFAULT_TEMPLATES[index] || DEFAULT_TEMPLATES[0], index)
  )
  const contractTemplatesRaw = Array.isArray(source.contractTemplates ?? source.contract_templates)
    ? (source.contractTemplates ?? source.contract_templates)
    : []
  const contractTemplates = (
    contractTemplatesRaw.length ? contractTemplatesRaw : DEFAULT_CONTRACT_TEMPLATES
  ).map((entry: any, index: number) =>
    normalizeContractTemplate(
      entry,
      DEFAULT_CONTRACT_TEMPLATES[index] || DEFAULT_CONTRACT_TEMPLATES[0],
      index
    )
  )

  const defaultCategory = toNonEmptyString(
    source.defaultCategory ?? source.default_category,
    DEFAULT_DEAL_FLOW_SETTINGS.defaultCategory
  )

  return {
    enabled: toBoolean(source.enabled, DEFAULT_DEAL_FLOW_SETTINGS.enabled),
    allowCreateBriefFromChat: toBoolean(
      source.allowCreateBriefFromChat ?? source.allow_create_brief_from_chat,
      DEFAULT_DEAL_FLOW_SETTINGS.allowCreateBriefFromChat
    ),
    allowBriefToProposal: toBoolean(
      source.allowBriefToProposal ?? source.allow_brief_to_proposal,
      DEFAULT_DEAL_FLOW_SETTINGS.allowBriefToProposal
    ),
    autoCreatePrivateJobs: toBoolean(
      source.autoCreatePrivateJobs ?? source.auto_create_private_jobs,
      DEFAULT_DEAL_FLOW_SETTINGS.autoCreatePrivateJobs
    ),
    defaultCategory,
    allowedCategories: allowedCategories.length ? allowedCategories : DEFAULT_ALLOWED_CATEGORIES,
    templates,
    timeline: {
      briefs: toBoolean(
        source.timeline?.briefs ?? source.timeline?.show_briefs,
        DEFAULT_DEAL_FLOW_SETTINGS.timeline.briefs
      ),
      proposals: toBoolean(
        source.timeline?.proposals ?? source.timeline?.show_proposals,
        DEFAULT_DEAL_FLOW_SETTINGS.timeline.proposals
      ),
      contracts: toBoolean(
        source.timeline?.contracts ?? source.timeline?.show_contracts,
        DEFAULT_DEAL_FLOW_SETTINGS.timeline.contracts
      )
    },
    proposalDefaults: {
      timelineDays: toNumber(
        source.proposalDefaults?.timelineDays ??
          source.proposalDefaults?.timeline_days ??
          source.proposal_defaults?.timelineDays ??
          source.proposal_defaults?.timeline_days,
        DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults.timelineDays,
        1,
        365
      ),
      paymentCycle: normalizePaymentCycle(
        source.proposalDefaults?.paymentCycle ??
          source.proposalDefaults?.payment_cycle ??
          source.proposal_defaults?.paymentCycle ??
          source.proposal_defaults?.payment_cycle,
        DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults.paymentCycle
      ),
      coverLetterIntro: String(
        source.proposalDefaults?.coverLetterIntro ??
          source.proposalDefaults?.cover_letter_intro ??
          source.proposal_defaults?.coverLetterIntro ??
          source.proposal_defaults?.cover_letter_intro ??
          DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults.coverLetterIntro
      ).trim()
    },
    contractTemplates,
    contractDefaults: {
      startLeadDays: toNumber(
        source.contractDefaults?.startLeadDays ??
          source.contractDefaults?.start_lead_days ??
          source.contract_defaults?.startLeadDays ??
          source.contract_defaults?.start_lead_days,
        DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults.startLeadDays,
        0,
        30
      ),
      fixedMilestoneCount: toNumber(
        source.contractDefaults?.fixedMilestoneCount ??
          source.contractDefaults?.fixed_milestone_count ??
          source.contract_defaults?.fixedMilestoneCount ??
          source.contract_defaults?.fixed_milestone_count,
        DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults.fixedMilestoneCount,
        1,
        12
      ),
      hourlyWeeklyCap: toNumber(
        source.contractDefaults?.hourlyWeeklyCap ??
          source.contractDefaults?.hourly_weekly_cap ??
          source.contract_defaults?.hourlyWeeklyCap ??
          source.contract_defaults?.hourly_weekly_cap,
        DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults.hourlyWeeklyCap,
        1,
        168
      ),
      upfrontPercent: toNumber(
        source.contractDefaults?.upfrontPercent ??
          source.contractDefaults?.upfront_percent ??
          source.contract_defaults?.upfrontPercent ??
          source.contract_defaults?.upfront_percent,
        DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults.upfrontPercent,
        0,
        100
      )
    },
    contractRules: {
      allowFixedContracts: toBoolean(
        source.contractRules?.allowFixedContracts ??
          source.contractRules?.allow_fixed_contracts ??
          source.contract_rules?.allowFixedContracts ??
          source.contract_rules?.allow_fixed_contracts,
        DEFAULT_DEAL_FLOW_SETTINGS.contractRules.allowFixedContracts
      ),
      allowHourlyContracts: toBoolean(
        source.contractRules?.allowHourlyContracts ??
          source.contractRules?.allow_hourly_contracts ??
          source.contract_rules?.allowHourlyContracts ??
          source.contract_rules?.allow_hourly_contracts,
        DEFAULT_DEAL_FLOW_SETTINGS.contractRules.allowHourlyContracts
      ),
      requireMilestonesForFixed: toBoolean(
        source.contractRules?.requireMilestonesForFixed ??
          source.contractRules?.require_milestones_for_fixed ??
          source.contract_rules?.requireMilestonesForFixed ??
          source.contract_rules?.require_milestones_for_fixed,
        DEFAULT_DEAL_FLOW_SETTINGS.contractRules.requireMilestonesForFixed
      ),
      maxMilestones: toNumber(
        source.contractRules?.maxMilestones ??
          source.contractRules?.max_milestones ??
          source.contract_rules?.maxMilestones ??
          source.contract_rules?.max_milestones,
        DEFAULT_DEAL_FLOW_SETTINGS.contractRules.maxMilestones,
        1,
        20
      )
    },
    feePolicy: {
      clientFeePercent: toNumber(
        source.feePolicy?.clientFeePercent ??
          source.feePolicy?.client_fee_percent ??
          source.fee_policy?.clientFeePercent ??
          source.fee_policy?.client_fee_percent,
        DEFAULT_DEAL_FLOW_SETTINGS.feePolicy.clientFeePercent,
        0,
        100
      ),
      contractorFeePercent: toNumber(
        source.feePolicy?.contractorFeePercent ??
          source.feePolicy?.contractor_fee_percent ??
          source.fee_policy?.contractorFeePercent ??
          source.fee_policy?.contractor_fee_percent,
        DEFAULT_DEAL_FLOW_SETTINGS.feePolicy.contractorFeePercent,
        0,
        100
      ),
      allowDeposits: toBoolean(
        source.feePolicy?.allowDeposits ??
          source.feePolicy?.allow_deposits ??
          source.fee_policy?.allowDeposits ??
          source.fee_policy?.allow_deposits,
        DEFAULT_DEAL_FLOW_SETTINGS.feePolicy.allowDeposits
      )
    }
  }
}
