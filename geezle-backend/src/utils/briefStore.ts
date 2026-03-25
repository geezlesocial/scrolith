import prisma from './prismaClient'

const PROJECT_BRIEF_SCOPE = 'project_briefs_store'

export type StoredBriefParticipant = {
  id: string
  name?: string
  role?: string
}

export type StoredBriefSourceMessage = {
  id: string
  sender_id?: string
  sender_name?: string
  snippet: string
  timestamp: string
}

export type StoredBriefHistoryEntry = {
  id: string
  type:
    | 'brief_created'
    | 'brief_updated'
    | 'proposal_created'
    | 'proposal_shortlisted'
    | 'proposal_accepted'
    | 'contract_created'
  actor_user_id?: string
  proposal_id?: string
  contract_id?: string
  timestamp: string
  summary?: string
  metadata?: Record<string, any> | null
}

export type StoredBriefProposalSummary = {
  proposal_id: string
  freelancer_id?: string
  freelancer_name?: string
  status?: string
  proposed_amount?: number
  proposed_timeline?: number
  created_at: string
  updated_at: string
}

export type StoredBriefContractSummary = {
  contract_id: string
  status?: string
  payment_cycle?: string
  start_date?: string | null
  title?: string
  contract_value?: number | null
  delivery_days?: number | null
  milestones?: any[]
  payment_schedule?: Record<string, any> | null
  created_at: string
}

export type StoredBriefRecord = {
  id: string
  user_id: string
  prompt: string
  title: string
  category: string
  budget_range: string
  timeline: string
  description: string
  required_skills: string[]
  screening_questions: string[]
  created_at: string
  updated_at: string
  conversation_id?: string
  template_id?: string
  participant_summary?: StoredBriefParticipant[]
  source_messages?: StoredBriefSourceMessage[]
  linked_job_id?: string | null
  linked_proposals?: StoredBriefProposalSummary[]
  linked_contract?: StoredBriefContractSummary | null
  history?: StoredBriefHistoryEntry[]
}

type BriefStore = {
  items: StoredBriefRecord[]
}

const defaultStore = (): BriefStore => ({ items: [] })

const loadStore = async (): Promise<BriefStore> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: PROJECT_BRIEF_SCOPE } })
    const raw = record?.data && typeof record.data === 'object' ? (record.data as any) : {}
    const items = Array.isArray(raw?.items) ? raw.items : []
    return { items }
  } catch (error) {
    console.warn('[briefStore] Failed to load store', error)
    return defaultStore()
  }
}

const saveStore = async (store: BriefStore): Promise<BriefStore> => {
  const payload = {
    items: Array.isArray(store?.items) ? store.items : []
  }
  await prisma.appSetting.upsert({
    where: { scope: PROJECT_BRIEF_SCOPE },
    create: { scope: PROJECT_BRIEF_SCOPE, data: payload as any },
    update: { data: payload as any }
  })
  return payload
}

const sortItems = (items: StoredBriefRecord[]) =>
  [...items].sort((left, right) =>
    String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || ''))
  )

const nowIso = () => new Date().toISOString()

export const listBriefRecords = async () => {
  const store = await loadStore()
  return sortItems(store.items || [])
}

export const getBriefRecordById = async (id: string) => {
  const store = await loadStore()
  return (store.items || []).find((item) => String(item.id || '') === String(id || '')) || null
}

export const upsertBriefRecord = async (record: StoredBriefRecord) => {
  const store = await loadStore()
  const items = Array.isArray(store.items) ? [...store.items] : []
  const index = items.findIndex((item) => String(item.id || '') === String(record.id || ''))
  const nextRecord = {
    ...record,
    linked_proposals: Array.isArray(record.linked_proposals) ? record.linked_proposals : [],
    history: Array.isArray(record.history) ? record.history : []
  }
  if (index >= 0) {
    items[index] = {
      ...items[index],
      ...nextRecord,
      updated_at: nextRecord.updated_at || nowIso()
    }
  } else {
    items.unshift(nextRecord)
  }
  await saveStore({ items })
  return items.find((item) => item.id === nextRecord.id) || nextRecord
}

export const appendBriefHistory = async (briefId: string, entry: StoredBriefHistoryEntry) => {
  const store = await loadStore()
  const items = Array.isArray(store.items) ? [...store.items] : []
  const index = items.findIndex((item) => String(item.id || '') === String(briefId || ''))
  if (index < 0) return null
  const current = items[index]
  const history = Array.isArray(current.history) ? [...current.history] : []
  history.push(entry)
  items[index] = {
    ...current,
    history,
    updated_at: nowIso()
  }
  await saveStore({ items })
  return items[index]
}

export const attachProposalToBrief = async (
  briefId: string,
  proposal: StoredBriefProposalSummary,
  historyEntry?: StoredBriefHistoryEntry
) => {
  const store = await loadStore()
  const items = Array.isArray(store.items) ? [...store.items] : []
  const index = items.findIndex((item) => String(item.id || '') === String(briefId || ''))
  if (index < 0) return null
  const current = items[index]
  const proposals = Array.isArray(current.linked_proposals) ? [...current.linked_proposals] : []
  const proposalIndex = proposals.findIndex(
    (entry) => String(entry.proposal_id || '') === String(proposal.proposal_id || '')
  )
  if (proposalIndex >= 0) {
    proposals[proposalIndex] = { ...proposals[proposalIndex], ...proposal }
  } else {
    proposals.push(proposal)
  }
  const history = Array.isArray(current.history) ? [...current.history] : []
  if (historyEntry) history.push(historyEntry)
  items[index] = {
    ...current,
    linked_proposals: proposals,
    history,
    updated_at: nowIso()
  }
  await saveStore({ items })
  return items[index]
}

export const attachContractToBriefByProposalId = async (
  proposalId: string,
  contract: StoredBriefContractSummary,
  historyEntry?: StoredBriefHistoryEntry
) => {
  const store = await loadStore()
  const items = Array.isArray(store.items) ? [...store.items] : []
  const index = items.findIndex((item) =>
    Array.isArray(item.linked_proposals)
      ? item.linked_proposals.some((proposal) => String(proposal.proposal_id || '') === String(proposalId || ''))
      : false
  )
  if (index < 0) return null
  const current = items[index]
  const proposals = Array.isArray(current.linked_proposals) ? [...current.linked_proposals] : []
  const proposalIndex = proposals.findIndex(
    (entry) => String(entry.proposal_id || '') === String(proposalId || '')
  )
  if (proposalIndex >= 0) {
    proposals[proposalIndex] = {
      ...proposals[proposalIndex],
      status: contract.status || proposals[proposalIndex].status,
      updated_at: contract.created_at || nowIso()
    }
  }
  const history = Array.isArray(current.history) ? [...current.history] : []
  if (historyEntry) history.push(historyEntry)
  items[index] = {
    ...current,
    linked_proposals: proposals,
    linked_contract: contract,
    history,
    updated_at: nowIso()
  }
  await saveStore({ items })
  return items[index]
}
