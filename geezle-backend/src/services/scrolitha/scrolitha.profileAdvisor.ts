import prisma from '../../utils/prismaClient';
import { generateScrolithaText } from './scrolitha.ollama';
import { writeScrolithaAuditLog } from './scrolitha.audit';
import type { ScrolithaActor } from './scrolitha.types';

const MAX_TEXT = 900;
const MAX_ITEMS = 12;
const PROFILE_FIELDS = new Set(['title', 'bio', 'location', 'skills', 'languages', 'portfolioUrl', 'githubUrl', 'linkedinUrl', 'websiteUrl']);
const text = (value: unknown, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);
const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => text(item, 120)).filter(Boolean).slice(0, MAX_ITEMS) : []);

export type ProfileSuggestion = {
  id: string;
  field: string;
  category: 'positioning' | 'proof' | 'discoverability' | 'completeness';
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  suggestedValue?: string | string[];
  requiresApproval: true;
};

const buildSnapshot = async (userId: string) => {
  const [user, profile, availability, hiring, gigCount, jobCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true, country: true, updatedAt: true } }),
    prisma.profile.findUnique({ where: { userId }, select: { title: true, bio: true, location: true, skills: true, languages: true, portfolioUrl: true, githubUrl: true, linkedinUrl: true, websiteUrl: true, portfolio: true, experienceItems: true, certifications: true, updatedAt: true } }),
    prisma.professionalAvailability.findUnique({ where: { userId }, select: { isActive: true, availabilityTypes: true, services: true } }),
    prisma.clientHiringStatus.findUnique({ where: { userId }, select: { isActive: true, status: true } }),
    prisma.gig.count({ where: { userId, isActive: true } }),
    prisma.job.count({ where: { clientId: userId } })
  ]);
  if (!user) throw new Error('User not found');
  return {
    profileVersion: profile?.updatedAt?.toISOString() || user.updatedAt.toISOString(),
    identity: { name: text(user.name, 160), username: text(user.username, 80), country: text(user.country, 120) },
    profile: {
      title: text(profile?.title, 220), bio: text(profile?.bio), location: text(profile?.location, 180), skills: list(profile?.skills), languages: list(profile?.languages),
      links: { portfolio: text(profile?.portfolioUrl, 300), github: text(profile?.githubUrl, 300), linkedin: text(profile?.linkedinUrl, 300), website: text(profile?.websiteUrl, 300) },
      portfolioItems: Array.isArray(profile?.portfolio) ? profile?.portfolio.slice(0, 6) : [], experienceItems: Array.isArray(profile?.experienceItems) ? profile?.experienceItems.slice(0, 6) : [], certifications: Array.isArray(profile?.certifications) ? profile?.certifications.slice(0, 6) : []
    },
    availability: { active: Boolean(availability?.isActive), types: list(availability?.availabilityTypes), services: list(availability?.services) },
    hiring: { active: Boolean(hiring?.isActive), status: text(hiring?.status, 80) }, activity: { activeGigs: gigCount, jobsPosted: jobCount }
  };
};

const deterministicSuggestions = (snapshot: any): ProfileSuggestion[] => {
  const result: ProfileSuggestion[] = [];
  if (!snapshot.profile.title) result.push({ id: 'title', field: 'title', category: 'positioning', priority: 'high', title: 'Add a clear professional headline', reason: 'A headline helps people understand your value immediately.', suggestedValue: 'Add your role, specialty, and the outcome you help create.', requiresApproval: true });
  if (!snapshot.profile.bio) result.push({ id: 'bio', field: 'bio', category: 'positioning', priority: 'high', title: 'Add a concise professional summary', reason: 'A short, outcome-focused summary improves profile comprehension and discovery.', suggestedValue: 'Describe who you help, what you do, and the proof or outcome you bring.', requiresApproval: true });
  if (!snapshot.profile.skills.length) result.push({ id: 'skills', field: 'skills', category: 'discoverability', priority: 'high', title: 'Add relevant skills', reason: 'Skills improve matching and search relevance.', suggestedValue: ['Add your strongest skill', 'Add a supporting skill'], requiresApproval: true });
  if (!snapshot.profile.links.linkedin && !snapshot.profile.links.website && !snapshot.profile.links.portfolio) result.push({ id: 'proof', field: 'portfolioUrl', category: 'proof', priority: 'medium', title: 'Add a proof or portfolio link', reason: 'A verified destination gives visitors evidence of your work.', suggestedValue: '', requiresApproval: true });
  return result.slice(0, 8);
};

const parseSuggestions = (raw: string, snapshot: any): ProfileSuggestion[] => {
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.suggestions;
    if (!Array.isArray(rows)) return deterministicSuggestions(snapshot);
    return rows.map((row: any, index: number) => ({
      id: text(row.id, 80) || `suggestion-${index + 1}`, field: text(row.field, 80), category: ['positioning', 'proof', 'discoverability', 'completeness'].includes(row.category) ? row.category : 'completeness', priority: ['high', 'medium', 'low'].includes(row.priority) ? row.priority : 'medium', title: text(row.title, 180), reason: text(row.reason, 500), ...(typeof row.suggestedValue === 'string' || Array.isArray(row.suggestedValue) ? { suggestedValue: Array.isArray(row.suggestedValue) ? list(row.suggestedValue) : text(row.suggestedValue, 500) } : {}), requiresApproval: true as const
    })).filter((row: ProfileSuggestion) => PROFILE_FIELDS.has(row.field) && row.title && row.reason).slice(0, 8);
  } catch { return deterministicSuggestions(snapshot); }
};

export const analyzeMyProfile = async (actor: ScrolithaActor) => {
  const started = Date.now();
  const snapshot = await buildSnapshot(actor.id);
  let suggestions = deterministicSuggestions(snapshot);
  try {
    const result = await generateScrolithaText({ scope: actor.scope, systemPrompt: 'Return JSON only: {"suggestions":[{"id":"","field":"","category":"positioning|proof|discoverability|completeness","priority":"high|medium|low","title":"","reason":"","suggestedValue":""}]}. Never include private data or propose changes outside the allowed fields.', userPrompt: `Review this profile snapshot and recommend the most important improvements. Keep suggestions specific and actionable.\n${JSON.stringify(snapshot)}`, maxTokens: 700, temperature: 0.2 });
    suggestions = parseSuggestions(result.text, snapshot);
  } catch { /* deterministic recommendations remain available when the model is unavailable */ }
  await writeScrolithaAuditLog({ actor, eventType: 'profile_analysis', intent: 'profile_improvement', redactedPayload: { fields: Object.keys(snapshot.profile), suggestionCount: suggestions.length }, resultSummary: `Profile analyzed in ${Date.now() - started}ms` });
  return { profileVersion: snapshot.profileVersion, suggestions, snapshot: { identity: snapshot.identity, availability: snapshot.availability, hiring: snapshot.hiring, activity: snapshot.activity }, latencyMs: Date.now() - started, approvalRequired: true };
};

export const applyApprovedProfileImprovements = async (actor: ScrolithaActor, input: { profileVersion?: unknown; changes?: Record<string, unknown> }) => {
  const current = await buildSnapshot(actor.id);
  if (input.profileVersion && String(input.profileVersion) !== current.profileVersion) throw new Error('Profile changed since analysis. Analyze again before applying suggestions.');
  const changes: Record<string, any> = {};
  for (const [field, value] of Object.entries(input.changes || {})) {
    if (!PROFILE_FIELDS.has(field)) continue;
    changes[field] = field === 'skills' || field === 'languages' ? list(value) : text(value, field === 'bio' ? 1800 : 500);
  }
  if (!Object.keys(changes).length) throw new Error('No approved profile changes supplied');
  const updated = await prisma.profile.upsert({ where: { userId: actor.id }, create: { userId: actor.id, ...changes }, update: changes, select: { updatedAt: true } });
  await writeScrolithaAuditLog({ actor, eventType: 'profile_improvement_applied', intent: 'profile_improvement', redactedPayload: { fields: Object.keys(changes) }, resultSummary: 'Approved profile improvements applied', confirmationStatus: 'confirmed' });
  return { appliedFields: Object.keys(changes), profileVersion: updated.updatedAt.toISOString(), approvalRequired: false };
};
