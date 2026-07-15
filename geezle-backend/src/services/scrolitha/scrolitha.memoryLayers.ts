/**
 * Layered persistent AI memory architecture.
 * Short-term session memory remains in sessionStore; durable layers use
 * ScrolithaUserPreference.metadata (no schema migration).
 * All layers honor retention policies and privacy controls.
 */
import prisma from '../../utils/prismaClient';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import { getSessionMemory, type SessionMemoryBag } from './scrolitha.sessionMemory';
import {
  getUserPrivacyControls,
  type ScrolithaPrivacyControls
} from './scrolitha.privacyControls';

export type MemoryLayerKind =
  | 'session'
  | 'conversation'
  | 'userPreference'
  | 'professionalProfile'
  | 'organization'
  | 'community'
  | 'project'
  | 'relationship';

export type MemoryRetentionPolicy = {
  /** Max age in ms; 0 = session-only / discard immediately after use window */
  maxAgeMs: number;
  /** Max entries per layer */
  maxEntries: number;
  /** Whether layer may be used for personalization */
  allowPersonalization: boolean;
};

export type MemoryEntry = {
  id: string;
  layer: MemoryLayerKind;
  key: string;
  value: string;
  /** Non-sensitive tags only */
  tags?: string[];
  confidence?: number;
  source?: string;
  createdAt: string;
  expiresAt: string;
  entityId?: string | null;
  entityType?: string | null;
};

export type LayeredMemorySnapshot = {
  userId: string;
  generatedAt: string;
  layers: Record<MemoryLayerKind, MemoryEntry[]>;
  retention: Record<MemoryLayerKind, MemoryRetentionPolicy>;
  privacy: Pick<
    ScrolithaPrivacyControls,
    'memoryEnabled' | 'personalizationEnabled' | 'shareOrgMemory'
  >;
  promptSafeSummary: string;
};

const DEFAULT_RETENTION: Record<MemoryLayerKind, MemoryRetentionPolicy> = {
  session: {
    maxAgeMs: 30 * 60_000,
    maxEntries: 12,
    allowPersonalization: true
  },
  conversation: {
    maxAgeMs: 12 * 60 * 60_000,
    maxEntries: 40,
    allowPersonalization: true
  },
  userPreference: {
    maxAgeMs: 180 * 24 * 60 * 60_000,
    maxEntries: 50,
    allowPersonalization: true
  },
  professionalProfile: {
    maxAgeMs: 365 * 24 * 60 * 60_000,
    maxEntries: 30,
    allowPersonalization: true
  },
  organization: {
    maxAgeMs: 90 * 24 * 60 * 60_000,
    maxEntries: 40,
    allowPersonalization: true
  },
  community: {
    maxAgeMs: 60 * 24 * 60 * 60_000,
    maxEntries: 40,
    allowPersonalization: true
  },
  project: {
    maxAgeMs: 120 * 24 * 60 * 60_000,
    maxEntries: 40,
    allowPersonalization: true
  },
  relationship: {
    maxAgeMs: 90 * 24 * 60 * 60_000,
    maxEntries: 50,
    allowPersonalization: true
  }
};

const META_KEY = 'memoryLayers';
const text = (v: unknown) => String(v || '').trim();
const truncate = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

const nowIso = () => new Date().toISOString();

const isExpired = (entry: MemoryEntry, now = Date.now()) => {
  const exp = Date.parse(entry.expiresAt);
  return Number.isFinite(exp) && exp <= now;
};

const sanitizeEntry = (raw: unknown, layer: MemoryLayerKind): MemoryEntry | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, any>;
  const key = text(o.key).slice(0, 80);
  const value = truncate(text(o.value), 400);
  if (!key || !value) return null;
  const createdAt = text(o.createdAt) || nowIso();
  const expiresAt = text(o.expiresAt) || nowIso();
  return {
    id: text(o.id) || `${layer}:${key}:${createdAt}`,
    layer,
    key,
    value,
    tags: Array.isArray(o.tags)
      ? o.tags.map((t: unknown) => text(t).slice(0, 40)).filter(Boolean).slice(0, 8)
      : undefined,
    confidence: Number.isFinite(Number(o.confidence))
      ? Math.max(0, Math.min(1, Number(o.confidence)))
      : undefined,
    source: text(o.source).slice(0, 80) || undefined,
    createdAt,
    expiresAt,
    entityId: text(o.entityId) || null,
    entityType: text(o.entityType) || null
  };
};

const pruneLayer = (
  entries: MemoryEntry[],
  policy: MemoryRetentionPolicy,
  now = Date.now()
): MemoryEntry[] => {
  return entries
    .filter((e) => !isExpired(e, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, policy.maxEntries);
};

export const resolveRetentionPolicies = (
  override?: Partial<Record<MemoryLayerKind, Partial<MemoryRetentionPolicy>>>
): Record<MemoryLayerKind, MemoryRetentionPolicy> => {
  const out = { ...DEFAULT_RETENTION } as Record<MemoryLayerKind, MemoryRetentionPolicy>;
  if (!override) return out;
  for (const kind of Object.keys(DEFAULT_RETENTION) as MemoryLayerKind[]) {
    const o = override[kind];
    if (!o) continue;
    out[kind] = {
      maxAgeMs: Number.isFinite(Number(o.maxAgeMs))
        ? Math.max(0, Number(o.maxAgeMs))
        : DEFAULT_RETENTION[kind].maxAgeMs,
      maxEntries: Number.isFinite(Number(o.maxEntries))
        ? Math.max(1, Math.min(200, Number(o.maxEntries)))
        : DEFAULT_RETENTION[kind].maxEntries,
      allowPersonalization:
        o.allowPersonalization !== undefined
          ? Boolean(o.allowPersonalization)
          : DEFAULT_RETENTION[kind].allowPersonalization
    };
  }
  return out;
};

const readStoredLayers = (metadata: unknown): Record<MemoryLayerKind, MemoryEntry[]> => {
  const empty = emptyLayers();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return empty;
  const bag = (metadata as any)[META_KEY];
  if (!bag || typeof bag !== 'object') return empty;
  const retention = resolveRetentionPolicies((metadata as any).memoryRetention);
  const now = Date.now();
  for (const kind of Object.keys(empty) as MemoryLayerKind[]) {
    if (kind === 'session') continue;
    const list = Array.isArray(bag[kind]) ? bag[kind] : [];
    empty[kind] = pruneLayer(
      list.map((e: unknown) => sanitizeEntry(e, kind)).filter(Boolean) as MemoryEntry[],
      retention[kind],
      now
    );
  }
  return empty;
};

const emptyLayers = (): Record<MemoryLayerKind, MemoryEntry[]> => ({
  session: [],
  conversation: [],
  userPreference: [],
  professionalProfile: [],
  organization: [],
  community: [],
  project: [],
  relationship: []
});

const sessionToEntries = (bag: SessionMemoryBag | null): MemoryEntry[] => {
  if (!bag?.turns?.length) return [];
  const policy = DEFAULT_RETENTION.session;
  const now = Date.now();
  return bag.turns
    .slice(-policy.maxEntries)
    .map((t, idx) => {
      const createdAt = new Date(t.at || now).toISOString();
      const expiresAt = new Date((t.at || now) + policy.maxAgeMs).toISOString();
      return {
        id: `session:${bag.sessionKey}:${idx}`,
        layer: 'session' as const,
        key: t.role || 'turn',
        value: truncate(text(t.text), 400),
        tags: t.classification ? [t.classification] : undefined,
        source: 'session_memory',
        createdAt,
        expiresAt,
        entityId: t.entityId || null,
        entityType: t.entityType || null
      };
    })
    .filter((e) => e.value);
};

/**
 * Remember a non-sensitive fact in a durable layer (preference metadata).
 * Never stores raw message bodies as permanent memory unless truncated preference facts.
 */
export const rememberMemoryFact = async (input: {
  userId: string;
  layer: Exclude<MemoryLayerKind, 'session'>;
  key: string;
  value: string;
  tags?: string[];
  confidence?: number;
  source?: string;
  entityId?: string | null;
  entityType?: string | null;
  retentionOverrideMs?: number;
}): Promise<MemoryEntry | null> => {
  const userId = text(input.userId);
  if (!userId) return null;

  const privacy = await getUserPrivacyControls(userId);
  if (!privacy.memoryEnabled) return null;
  if (input.layer === 'organization' && !privacy.shareOrgMemory) return null;

  const retention = resolveRetentionPolicies();
  const policy = retention[input.layer];
  const maxAge =
    typeof input.retentionOverrideMs === 'number' && input.retentionOverrideMs > 0
      ? input.retentionOverrideMs
      : policy.maxAgeMs;

  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + maxAge).toISOString();
  const entry: MemoryEntry = {
    id: `${input.layer}:${text(input.key).slice(0, 40)}:${Date.now()}`,
    layer: input.layer,
    key: text(input.key).slice(0, 80),
    value: truncate(text(input.value), 400),
    tags: (input.tags || []).map((t) => text(t).slice(0, 40)).filter(Boolean).slice(0, 8),
    confidence: input.confidence,
    source: text(input.source).slice(0, 80) || 'user_signal',
    createdAt,
    expiresAt,
    entityId: text(input.entityId) || null,
    entityType: text(input.entityType) || null
  };
  if (!entry.key || !entry.value) return null;

  const pref = await prisma.scrolithaUserPreference.findUnique({ where: { userId } });
  const baseMeta =
    pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
      ? { ...(pref.metadata as Record<string, any>) }
      : {};

  const layers = readStoredLayers(baseMeta);
  const existing = layers[input.layer].filter(
    (e) => e.key.toLowerCase() !== entry.key.toLowerCase()
  );
  layers[input.layer] = pruneLayer([entry, ...existing], policy);

  baseMeta[META_KEY] = {
    conversation: layers.conversation,
    userPreference: layers.userPreference,
    professionalProfile: layers.professionalProfile,
    organization: layers.organization,
    community: layers.community,
    project: layers.project,
    relationship: layers.relationship,
    updatedAt: createdAt
  };

  await prisma.scrolithaUserPreference.upsert({
    where: { userId },
    create: {
      userId,
      quickActions: [],
      troubleshootingMode: 'standard',
      assistantTone: 'concise',
      metadata: baseMeta
    },
    update: { metadata: baseMeta }
  });

  enterpriseCache.delete('session', hashCacheKey(['memsnap', userId]));
  return entry;
};

export const clearMemoryLayer = async (
  userId: string,
  layer?: MemoryLayerKind | 'all'
): Promise<{ cleared: string }> => {
  const uid = text(userId);
  if (!uid) return { cleared: 'none' };

  if (layer === 'session' || layer === 'all') {
    // Session store is keyed per session; caller may pass session clears separately.
  }

  if (!layer || layer === 'all') {
    const pref = await prisma.scrolithaUserPreference.findUnique({ where: { userId: uid } });
    const baseMeta =
      pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
        ? { ...(pref.metadata as Record<string, any>) }
        : {};
    delete baseMeta[META_KEY];
    if (pref) {
      await prisma.scrolithaUserPreference.update({
        where: { userId: uid },
        data: { metadata: baseMeta }
      });
    }
    enterpriseCache.delete('session', hashCacheKey(['memsnap', uid]));
    return { cleared: 'all_durable' };
  }

  if (layer === 'session') return { cleared: 'session_client_side' };

  const pref = await prisma.scrolithaUserPreference.findUnique({ where: { userId: uid } });
  if (!pref) return { cleared: layer };
  const baseMeta =
    pref.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
      ? { ...(pref.metadata as Record<string, any>) }
      : {};
  const layers = readStoredLayers(baseMeta);
  layers[layer] = [];
  baseMeta[META_KEY] = {
    conversation: layers.conversation,
    userPreference: layers.userPreference,
    professionalProfile: layers.professionalProfile,
    organization: layers.organization,
    community: layers.community,
    project: layers.project,
    relationship: layers.relationship,
    updatedAt: nowIso()
  };
  await prisma.scrolithaUserPreference.update({
    where: { userId: uid },
    data: { metadata: baseMeta }
  });
  enterpriseCache.delete('session', hashCacheKey(['memsnap', uid]));
  return { cleared: layer };
};

/**
 * Build layered memory snapshot for personalization / prompts (privacy-safe).
 */
export const getLayeredMemorySnapshot = async (input: {
  userId: string;
  sessionKey?: string | null;
}): Promise<LayeredMemorySnapshot> => {
  const userId = text(input.userId);
  const cacheKey = hashCacheKey(['memsnap', userId, input.sessionKey || '']);
  const cached = enterpriseCache.get<LayeredMemorySnapshot>('session', cacheKey);
  if (cached) return cached;

  const privacy = await getUserPrivacyControls(userId);
  const retention = resolveRetentionPolicies();
  const layers = emptyLayers();

  if (privacy.memoryEnabled) {
    const pref = await prisma.scrolithaUserPreference.findUnique({
      where: { userId },
      select: { metadata: true, assistantTone: true, quickActions: true, troubleshootingMode: true }
    });
    const stored = readStoredLayers(pref?.metadata);
    Object.assign(layers, stored);

    // Preference layer from structured preference fields
    if (pref) {
      layers.userPreference = pruneLayer(
        [
          {
            id: 'pref:tone',
            layer: 'userPreference',
            key: 'assistantTone',
            value: pref.assistantTone || 'concise',
            source: 'user_preference',
            createdAt: nowIso(),
            expiresAt: new Date(Date.now() + retention.userPreference.maxAgeMs).toISOString()
          },
          {
            id: 'pref:trouble',
            layer: 'userPreference',
            key: 'troubleshootingMode',
            value: pref.troubleshootingMode || 'standard',
            source: 'user_preference',
            createdAt: nowIso(),
            expiresAt: new Date(Date.now() + retention.userPreference.maxAgeMs).toISOString()
          },
          ...layers.userPreference
        ],
        retention.userPreference
      );
    }

    // Conversation summaries (durable, short)
    try {
      const convos = await prisma.scrolithaConversation.findMany({
        where: { userId, status: 'open' },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { id: true, summary: true, pageContext: true, updatedAt: true }
      });
      layers.conversation = pruneLayer(
        convos
          .filter((c) => c.summary)
          .map((c) => ({
            id: `convo:${c.id}`,
            layer: 'conversation' as const,
            key: c.pageContext || 'conversation',
            value: truncate(text(c.summary), 280),
            source: 'conversation_summary',
            createdAt: c.updatedAt.toISOString(),
            expiresAt: new Date(
              c.updatedAt.getTime() + retention.conversation.maxAgeMs
            ).toISOString()
          })),
        retention.conversation
      );
    } catch {
      // optional
    }

    // Professional profile memory from public User.profile (permission-safe self-read)
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          username: true,
          profile: { select: { title: true, bio: true, skills: true, location: true } }
        }
      });
      if (user?.profile) {
        const facts: MemoryEntry[] = [];
        if (user.profile.title) {
          facts.push({
            id: 'prof:title',
            layer: 'professionalProfile',
            key: 'title',
            value: truncate(user.profile.title, 120),
            source: 'profile',
            createdAt: nowIso(),
            expiresAt: new Date(
              Date.now() + retention.professionalProfile.maxAgeMs
            ).toISOString()
          });
        }
        if (user.profile.skills?.length) {
          facts.push({
            id: 'prof:skills',
            layer: 'professionalProfile',
            key: 'skills',
            value: user.profile.skills.slice(0, 12).join(', '),
            source: 'profile',
            tags: user.profile.skills.slice(0, 8),
            createdAt: nowIso(),
            expiresAt: new Date(
              Date.now() + retention.professionalProfile.maxAgeMs
            ).toISOString()
          });
        }
        if (user.profile.location) {
          facts.push({
            id: 'prof:location',
            layer: 'professionalProfile',
            key: 'location',
            value: truncate(user.profile.location, 80),
            source: 'profile',
            createdAt: nowIso(),
            expiresAt: new Date(
              Date.now() + retention.professionalProfile.maxAgeMs
            ).toISOString()
          });
        }
        layers.professionalProfile = pruneLayer(
          [...facts, ...layers.professionalProfile],
          retention.professionalProfile
        );
      }
    } catch {
      // optional
    }
  }

  // Session layer always available when key provided (short-term)
  if (input.sessionKey) {
    layers.session = sessionToEntries(getSessionMemory(input.sessionKey));
  }

  if (!privacy.shareOrgMemory) {
    layers.organization = [];
  }

  const promptSafeSummary = buildPromptSafeMemorySummary(layers, privacy, retention);

  const snapshot: LayeredMemorySnapshot = {
    userId,
    generatedAt: nowIso(),
    layers,
    retention,
    privacy: {
      memoryEnabled: privacy.memoryEnabled,
      personalizationEnabled: privacy.personalizationEnabled,
      shareOrgMemory: privacy.shareOrgMemory
    },
    promptSafeSummary
  };

  enterpriseCache.set('session', cacheKey, snapshot, 20_000);
  return snapshot;
};

export const buildPromptSafeMemorySummary = (
  layers: Record<MemoryLayerKind, MemoryEntry[]>,
  privacy: Pick<ScrolithaPrivacyControls, 'memoryEnabled' | 'personalizationEnabled'>,
  retention: Record<MemoryLayerKind, MemoryRetentionPolicy>
): string => {
  if (!privacy.memoryEnabled) {
    return 'User memory is disabled by privacy controls.';
  }
  const parts: string[] = [];
  const order: MemoryLayerKind[] = [
    'userPreference',
    'professionalProfile',
    'conversation',
    'project',
    'community',
    'organization',
    'relationship',
    'session'
  ];
  for (const kind of order) {
    if (!retention[kind].allowPersonalization && kind !== 'session') continue;
    const entries = layers[kind]?.slice(0, 4) || [];
    if (!entries.length) continue;
    const bits = entries.map((e) => `${e.key}=${e.value}`).join('; ');
    parts.push(`[${kind}] ${bits}`);
  }
  if (!parts.length) return 'No durable memory facts available.';
  return truncate(parts.join(' | '), 900);
};

export const getDefaultRetentionPolicies = () => resolveRetentionPolicies();
