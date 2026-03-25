import type { DealFlowContractTemplate, DealFlowSettings, DealFlowTemplate } from '../types'

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

export const DEFAULT_DEAL_FLOW_SETTINGS: DealFlowSettings = {
  enabled: true,
  allowCreateBriefFromChat: true,
  allowBriefToProposal: true,
  autoCreatePrivateJobs: true,
  defaultCategory: 'General',
  allowedCategories: ['General', 'Development', 'Design', 'Marketing', 'Content', 'Operations'],
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

const toString = (value: any, fallback: string) => {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

const normalizeContractType = (value: any, fallback: string) => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'FIXED' || normalized === 'HOURLY') return normalized
  return fallback
}

const normalizePaymentCycle = (value: any, fallback: string) => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'WEEKLY' || normalized === 'BIWEEKLY' || normalized === 'MONTHLY') return normalized
  return fallback
}

export const normalizeDealFlowSettings = (raw: any): DealFlowSettings => {
  const source = raw && typeof raw === 'object' ? raw : {}
  const allowedCategoriesRaw = Array.isArray(source.allowedCategories)
    ? source.allowedCategories
    : Array.isArray(source.allowed_categories)
      ? source.allowed_categories
      : []

  const templatesRaw = Array.isArray(source.templates) ? source.templates : DEFAULT_TEMPLATES
  const contractTemplatesRaw = Array.isArray(source.contractTemplates)
    ? source.contractTemplates
    : Array.isArray(source.contract_templates)
      ? source.contract_templates
      : DEFAULT_CONTRACT_TEMPLATES

  return {
    enabled: toBoolean(source.enabled, Boolean(DEFAULT_DEAL_FLOW_SETTINGS.enabled)),
    allowCreateBriefFromChat: toBoolean(
      source.allowCreateBriefFromChat ?? source.allow_create_brief_from_chat,
      Boolean(DEFAULT_DEAL_FLOW_SETTINGS.allowCreateBriefFromChat)
    ),
    allowBriefToProposal: toBoolean(
      source.allowBriefToProposal ?? source.allow_brief_to_proposal,
      Boolean(DEFAULT_DEAL_FLOW_SETTINGS.allowBriefToProposal)
    ),
    autoCreatePrivateJobs: toBoolean(
      source.autoCreatePrivateJobs ?? source.auto_create_private_jobs,
      Boolean(DEFAULT_DEAL_FLOW_SETTINGS.autoCreatePrivateJobs)
    ),
    defaultCategory: toString(
      source.defaultCategory ?? source.default_category,
      String(DEFAULT_DEAL_FLOW_SETTINGS.defaultCategory || 'General')
    ),
    allowedCategories: Array.from(
      new Set(
        allowedCategoriesRaw.map((entry: any) => String(entry || '').trim()).filter(Boolean)
      )
    ).length
      ? Array.from(
          new Set(
            allowedCategoriesRaw.map((entry: any) => String(entry || '').trim()).filter(Boolean)
          )
        )
      : [...(DEFAULT_DEAL_FLOW_SETTINGS.allowedCategories || [])],
    templates: templatesRaw
      .map((template: any, index: number) => ({
        id: toString(template?.id, DEFAULT_TEMPLATES[index]?.id || `template_${index + 1}`),
        label: toString(template?.label, DEFAULT_TEMPLATES[index]?.label || 'Template'),
        category: toString(template?.category, DEFAULT_TEMPLATES[index]?.category || 'General'),
        summary: String(template?.summary || DEFAULT_TEMPLATES[index]?.summary || '').trim() || undefined
      }))
      .filter((template: DealFlowTemplate) => Boolean(template.id)),
    timeline: {
      briefs: toBoolean(source.timeline?.briefs, Boolean(DEFAULT_DEAL_FLOW_SETTINGS.timeline?.briefs)),
      proposals: toBoolean(source.timeline?.proposals, Boolean(DEFAULT_DEAL_FLOW_SETTINGS.timeline?.proposals)),
      contracts: toBoolean(source.timeline?.contracts, Boolean(DEFAULT_DEAL_FLOW_SETTINGS.timeline?.contracts))
    },
    proposalDefaults: {
      timelineDays: toNumber(
        source.proposalDefaults?.timelineDays ??
          source.proposalDefaults?.timeline_days ??
          source.proposal_defaults?.timelineDays ??
          source.proposal_defaults?.timeline_days,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults?.timelineDays || 14),
        1,
        365
      ),
      paymentCycle: toString(
        source.proposalDefaults?.paymentCycle ??
          source.proposalDefaults?.payment_cycle ??
          source.proposal_defaults?.paymentCycle ??
          source.proposal_defaults?.payment_cycle,
        String(DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults?.paymentCycle || 'WEEKLY')
      ).toUpperCase(),
      coverLetterIntro: String(
        source.proposalDefaults?.coverLetterIntro ??
          source.proposalDefaults?.cover_letter_intro ??
          source.proposal_defaults?.coverLetterIntro ??
          source.proposal_defaults?.cover_letter_intro ??
          DEFAULT_DEAL_FLOW_SETTINGS.proposalDefaults?.coverLetterIntro ??
          ''
      ).trim()
    },
    contractTemplates: contractTemplatesRaw
      .map((template: any, index: number) => ({
        id: toString(template?.id, DEFAULT_CONTRACT_TEMPLATES[index]?.id || `contract_template_${index + 1}`),
        label: toString(template?.label, DEFAULT_CONTRACT_TEMPLATES[index]?.label || 'Contract template'),
        contractType: normalizeContractType(
          template?.contractType ?? template?.contract_type,
          String(DEFAULT_CONTRACT_TEMPLATES[index]?.contractType || 'FIXED')
        ),
        paymentCycle: normalizePaymentCycle(
          template?.paymentCycle ?? template?.payment_cycle,
          String(DEFAULT_CONTRACT_TEMPLATES[index]?.paymentCycle || 'MONTHLY')
        ),
        milestoneCount: toNumber(
          template?.milestoneCount ?? template?.milestone_count,
          Number(DEFAULT_CONTRACT_TEMPLATES[index]?.milestoneCount ?? 0),
          0,
          12
        ),
        summary: String(template?.summary || DEFAULT_CONTRACT_TEMPLATES[index]?.summary || '').trim() || undefined
      }))
      .filter((template: DealFlowContractTemplate) => Boolean(template.id)),
    contractDefaults: {
      startLeadDays: toNumber(
        source.contractDefaults?.startLeadDays ??
          source.contractDefaults?.start_lead_days ??
          source.contract_defaults?.startLeadDays ??
          source.contract_defaults?.start_lead_days,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults?.startLeadDays || 2),
        0,
        30
      ),
      fixedMilestoneCount: toNumber(
        source.contractDefaults?.fixedMilestoneCount ??
          source.contractDefaults?.fixed_milestone_count ??
          source.contract_defaults?.fixedMilestoneCount ??
          source.contract_defaults?.fixed_milestone_count,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults?.fixedMilestoneCount || 3),
        1,
        12
      ),
      hourlyWeeklyCap: toNumber(
        source.contractDefaults?.hourlyWeeklyCap ??
          source.contractDefaults?.hourly_weekly_cap ??
          source.contract_defaults?.hourlyWeeklyCap ??
          source.contract_defaults?.hourly_weekly_cap,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults?.hourlyWeeklyCap || 40),
        1,
        168
      ),
      upfrontPercent: toNumber(
        source.contractDefaults?.upfrontPercent ??
          source.contractDefaults?.upfront_percent ??
          source.contract_defaults?.upfrontPercent ??
          source.contract_defaults?.upfront_percent,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.contractDefaults?.upfrontPercent || 30),
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
        Boolean(DEFAULT_DEAL_FLOW_SETTINGS.contractRules?.allowFixedContracts)
      ),
      allowHourlyContracts: toBoolean(
        source.contractRules?.allowHourlyContracts ??
          source.contractRules?.allow_hourly_contracts ??
          source.contract_rules?.allowHourlyContracts ??
          source.contract_rules?.allow_hourly_contracts,
        Boolean(DEFAULT_DEAL_FLOW_SETTINGS.contractRules?.allowHourlyContracts)
      ),
      requireMilestonesForFixed: toBoolean(
        source.contractRules?.requireMilestonesForFixed ??
          source.contractRules?.require_milestones_for_fixed ??
          source.contract_rules?.requireMilestonesForFixed ??
          source.contract_rules?.require_milestones_for_fixed,
        Boolean(DEFAULT_DEAL_FLOW_SETTINGS.contractRules?.requireMilestonesForFixed)
      ),
      maxMilestones: toNumber(
        source.contractRules?.maxMilestones ??
          source.contractRules?.max_milestones ??
          source.contract_rules?.maxMilestones ??
          source.contract_rules?.max_milestones,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.contractRules?.maxMilestones || 8),
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
        Number(DEFAULT_DEAL_FLOW_SETTINGS.feePolicy?.clientFeePercent || 0),
        0,
        100
      ),
      contractorFeePercent: toNumber(
        source.feePolicy?.contractorFeePercent ??
          source.feePolicy?.contractor_fee_percent ??
          source.fee_policy?.contractorFeePercent ??
          source.fee_policy?.contractor_fee_percent,
        Number(DEFAULT_DEAL_FLOW_SETTINGS.feePolicy?.contractorFeePercent || 0),
        0,
        100
      ),
      allowDeposits: toBoolean(
        source.feePolicy?.allowDeposits ??
          source.feePolicy?.allow_deposits ??
          source.fee_policy?.allowDeposits ??
          source.fee_policy?.allow_deposits,
        Boolean(DEFAULT_DEAL_FLOW_SETTINGS.feePolicy?.allowDeposits)
      )
    }
  }
}
