/**
 * Phase 20.2.4 — Enterprise mention parsing, special tokens, and persistence.
 * Server-authoritative. Client suggestions are never trusted for fan-out.
 * Does not implement OCR/KYC or alter reaction/comment schemas.
 */
import prisma from '../../utils/prismaClient';
import {
  createEngagementNotification,
  filterRecipientsForNotification,
  canUserViewPostForNotification,
  buildSnippet
} from '../engagementNotifications.service';
import {
  isScrolithaUsername,
  getScrolithaPlatformUserId
} from '../scrolitha/scrolitha.platformIdentity';

export type MentionKind =
  | 'USER'
  | 'EVERYONE'
  | 'MODERATORS'
  | 'ADMINS'
  | 'SCROLITHA'
  | 'RESERVED';

export type ParsedMentionToken = {
  raw: string;
  token: string;
  kind: MentionKind;
  start: number;
  end: number;
};

export type ResolvedMentionTarget = {
  kind: MentionKind;
  rawToken: string;
  targetUserId?: string | null;
  recipientIds: string[];
  skippedReason?: string | null;
};

const EVERYONE_RATE_WINDOW_MS = 60 * 60 * 1000;
const EVERYONE_RATE_MAX = 3;
const EVERYONE_MAX_RECIPIENTS = Number(process.env.MENTION_EVERYONE_MAX_RECIPIENTS || 500);

const everyoneRateWindow = new Map<string, { start: number; count: number }>();

/** Reserved future tokens — parsed but not fanned out. */
export const RESERVED_MENTION_TOKENS = new Set(['verified', 'staff']);

/** Collective tokens with special expansion rules. */
export const SPECIAL_MENTION_TOKENS: Record<string, MentionKind> = {
  everyone: 'EVERYONE',
  moderators: 'MODERATORS',
  mods: 'MODERATORS',
  admins: 'ADMINS',
  admin: 'ADMINS'
};

export const SCROLITHA_MENTION_ALIASES = new Set(['scrolitha', 'ai', 'scrolitha_ai', 'scrolitha-bot']);

const normalizeToken = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');

/**
 * Extract @tokens including short specials (@ai) and standard usernames.
 * Unknown tokens stay plain text at render time; only resolved IDs notify.
 */
export const parseMentionTokens = (content: string): ParsedMentionToken[] => {
  const text = String(content || '');
  // Allow 2+ chars so @ai works; usernames still validated at resolve time.
  const regex = /(^|[^@\w])@([a-zA-Z0-9_.]{2,30})/g;
  const out: ParsedMentionToken[] = [];
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const token = normalizeToken(match[2] || '');
    if (!token) {
      match = regex.exec(text);
      continue;
    }
    const atIndex = (match.index || 0) + (match[1] ? match[1].length : 0);
    const kind = classifyMentionToken(token);
    out.push({
      raw: `@${match[2]}`,
      token,
      kind,
      start: atIndex,
      end: atIndex + match[2].length + 1
    });
    match = regex.exec(text);
  }
  return out;
};

export const classifyMentionToken = (token: string): MentionKind => {
  const t = normalizeToken(token);
  if (SCROLITHA_MENTION_ALIASES.has(t) || isScrolithaUsername(t)) return 'SCROLITHA';
  if (RESERVED_MENTION_TOKENS.has(t)) return 'RESERVED';
  if (SPECIAL_MENTION_TOKENS[t]) return SPECIAL_MENTION_TOKENS[t];
  return 'USER';
};

/** Backward-compatible username list (users + scrolitha aliases). Special collectives excluded. */
export const extractEnterpriseMentionUsernames = (content: string): string[] => {
  const tokens = parseMentionTokens(content);
  const usernames = new Set<string>();
  for (const t of tokens) {
    if (t.kind === 'USER' || t.kind === 'SCROLITHA') usernames.add(t.token);
  }
  return Array.from(usernames);
};

const allowEveryoneRate = (authorId: string) => {
  const now = Date.now();
  const row = everyoneRateWindow.get(authorId);
  if (!row || now - row.start > EVERYONE_RATE_WINDOW_MS) {
    everyoneRateWindow.set(authorId, { start: now, count: 1 });
    return true;
  }
  if (row.count >= EVERYONE_RATE_MAX) return false;
  row.count += 1;
  return true;
};

const filterBlocked = async (actorId: string, candidateIds: string[]) => {
  const unique = Array.from(new Set(candidateIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!actorId || !unique.length) return [];
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: actorId, blockedId: { in: unique } },
        { blockedId: actorId, blockerId: { in: unique } }
      ]
    },
    select: { blockerId: true, blockedId: true }
  });
  const blocked = new Set<string>();
  blocks.forEach((b) => {
    if (b.blockerId === actorId) blocked.add(b.blockedId);
    if (b.blockedId === actorId) blocked.add(b.blockerId);
  });
  return unique.filter((id) => id !== actorId && !blocked.has(id));
};

const activeUserFilter = {
  isActive: true
} as const;

export const resolveMentionFanout = async (input: {
  authorId: string;
  content: string;
  postId?: string | null;
  clubId?: string | null;
  isPostAuthor?: boolean;
}): Promise<ResolvedMentionTarget[]> => {
  const authorId = String(input.authorId || '').trim();
  const tokens = parseMentionTokens(input.content);
  if (!authorId || !tokens.length) return [];

  const results: ResolvedMentionTarget[] = [];
  const seenKinds = new Set<string>();

  for (const token of tokens) {
    const dedupeKey = `${token.kind}:${token.token}`;
    if (seenKinds.has(dedupeKey)) continue;
    seenKinds.add(dedupeKey);

    if (token.kind === 'RESERVED') {
      results.push({
        kind: 'RESERVED',
        rawToken: token.raw,
        recipientIds: [],
        skippedReason: 'RESERVED_FUTURE'
      });
      continue;
    }

    if (token.kind === 'SCROLITHA') {
      const scrolithaId = await getScrolithaPlatformUserId().catch(() => null);
      results.push({
        kind: 'SCROLITHA',
        rawToken: token.raw,
        targetUserId: scrolithaId,
        recipientIds: [], // AI path — no human notification
        skippedReason: scrolithaId ? null : 'SCROLITHA_IDENTITY_MISSING'
      });
      continue;
    }

    if (token.kind === 'EVERYONE') {
      if (!input.isPostAuthor) {
        results.push({
          kind: 'EVERYONE',
          rawToken: token.raw,
          recipientIds: [],
          skippedReason: 'EVERYONE_AUTHOR_ONLY'
        });
        continue;
      }
      if (!allowEveryoneRate(authorId)) {
        results.push({
          kind: 'EVERYONE',
          rawToken: token.raw,
          recipientIds: [],
          skippedReason: 'EVERYONE_RATE_LIMITED'
        });
        continue;
      }
      const follows = await prisma.userFollow.findMany({
        where: { followeeId: authorId, follower: activeUserFilter },
        take: EVERYONE_MAX_RECIPIENTS,
        select: { followerId: true },
        orderBy: { createdAt: 'desc' }
      });
      const ids = await filterBlocked(
        authorId,
        follows.map((f) => f.followerId)
      );
      results.push({
        kind: 'EVERYONE',
        rawToken: token.raw,
        recipientIds: ids.slice(0, EVERYONE_MAX_RECIPIENTS)
      });
      continue;
    }

    if (token.kind === 'MODERATORS' || token.kind === 'ADMINS') {
      const clubId = String(input.clubId || '').trim();
      if (!clubId) {
        results.push({
          kind: token.kind,
          rawToken: token.raw,
          recipientIds: [],
          skippedReason: 'COMMUNITY_SCOPE_REQUIRED'
        });
        continue;
      }
      const roles =
        token.kind === 'ADMINS'
          ? ['admin', 'owner', 'ADMIN', 'OWNER']
          : ['moderator', 'admin', 'owner', 'MODERATOR', 'ADMIN', 'OWNER'];
      const members = await prisma.clubMembership.findMany({
        where: {
          clubId,
          status: 'active',
          role: { in: roles },
          user: activeUserFilter
        },
        select: { userId: true }
      });
      // Always include club owner
      const club = await prisma.communityClub.findUnique({
        where: { id: clubId },
        select: { ownerId: true }
      });
      const rawIds = [
        ...members.map((m) => m.userId),
        ...(club?.ownerId ? [club.ownerId] : [])
      ];
      const ids = await filterBlocked(authorId, rawIds);
      results.push({
        kind: token.kind,
        rawToken: token.raw,
        recipientIds: ids
      });
      continue;
    }

    // USER
    const user = await prisma.user.findFirst({
      where: {
        username: { equals: token.token, mode: 'insensitive' },
        isActive: true
      },
      select: { id: true, username: true }
    });
    if (!user) {
      results.push({
        kind: 'USER',
        rawToken: token.raw,
        recipientIds: [],
        skippedReason: 'UNKNOWN_USERNAME'
      });
      continue;
    }
    const allowed = await filterBlocked(authorId, [user.id]);
    results.push({
      kind: 'USER',
      rawToken: token.raw,
      targetUserId: user.id,
      recipientIds: allowed
    });
  }

  return results;
};

export const persistMentionRecords = async (input: {
  authorId: string;
  sourceType: 'POST' | 'COMMENT';
  sourceId: string;
  postId?: string | null;
  commentId?: string | null;
  clubId?: string | null;
  resolved: ResolvedMentionTarget[];
}) => {
  const created: Array<{ mentionId: string; kind: MentionKind; recipientIds: string[] }> = [];
  for (const item of input.resolved) {
    if (item.kind === 'RESERVED') continue;
    try {
      const mention = await prisma.mention.create({
        data: {
          authorId: input.authorId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          postId: input.postId || null,
          commentId: input.commentId || null,
          clubId: input.clubId || null,
          kind: item.kind,
          rawToken: item.rawToken,
          targetUserId: item.targetUserId || null,
          status: 'ACTIVE',
          recipientCount: item.recipientIds.length,
          metadata: item.skippedReason ? { skippedReason: item.skippedReason } : undefined
        }
      });
      if (item.recipientIds.length) {
        await prisma.mentionRecipient.createMany({
          data: item.recipientIds.map((recipientId) => ({
            mentionId: mention.id,
            recipientId,
            status: 'PENDING'
          })),
          skipDuplicates: true
        });
      }
      created.push({ mentionId: mention.id, kind: item.kind, recipientIds: item.recipientIds });
    } catch (error) {
      console.warn('[mentions] persist failed', error);
    }
  }
  return created;
};

export const notifyMentionRecipients = async (input: {
  authorId: string;
  actorName: string;
  post: { id: string; authorId: string; visibility?: string | null; mentions?: string[] | null };
  commentId?: string | null;
  content: string;
  resolved: ResolvedMentionTarget[];
  mentionRecords?: Array<{ mentionId: string; kind: MentionKind; recipientIds: string[] }>;
}) => {
  const snippet = buildSnippet(input.content || '', 100);
  const baseUrl = input.commentId
    ? `/post/${input.post.id}?comment=${input.commentId}`
    : `/post/${input.post.id}`;

  const allRecipientIds = Array.from(
    new Set(input.resolved.flatMap((r) => (r.kind === 'SCROLITHA' ? [] : r.recipientIds)))
  );
  if (!allRecipientIds.length) return { notified: 0 };

  const filtered = await filterRecipientsForNotification(
    input.commentId ? 'mention_comment' : 'mention_post',
    allRecipientIds
  );

  let notified = 0;
  for (const recipientId of filtered) {
    const canView = await canUserViewPostForNotification(
      {
        authorId: input.post.authorId,
        visibility: input.post.visibility,
        mentions: input.post.mentions
      },
      recipientId
    );
    if (!canView) continue;

    const matched = input.resolved.find((r) => r.recipientIds.includes(recipientId));
    const kindLabel =
      matched?.kind === 'EVERYONE'
        ? 'via @everyone'
        : matched?.kind === 'MODERATORS'
          ? 'as a moderator'
          : matched?.kind === 'ADMINS'
            ? 'as an admin'
            : '';

    const message = input.commentId
      ? `${input.actorName} mentioned you in a comment${kindLabel ? ` ${kindLabel}` : ''}.`
      : `${input.actorName} mentioned you in a post${kindLabel ? ` ${kindLabel}` : ''}.`;

    try {
      const row = await createEngagementNotification({
        recipientId,
        actorId: input.authorId,
        type: input.commentId ? 'mention_comment' : 'mention_post',
        title: 'You were mentioned',
        message,
        actionUrl: `${baseUrl}&mention=${encodeURIComponent(recipientId)}`,
        metadata: {
          postId: input.post.id,
          commentId: input.commentId || null,
          actorId: input.authorId,
          mentionedUserId: recipientId,
          mentionKind: matched?.kind || 'USER',
          snippet
        },
        skipRecipientChecks: true,
        dedupeWindowMinutes: 10,
        dedupeMetaKeys: ['postId', 'commentId', 'mentionedUserId', 'actorId']
      });

      const record = input.mentionRecords?.find((m) => m.recipientIds.includes(recipientId));
      if (record && row?.id) {
        await prisma.mentionRecipient.updateMany({
          where: { mentionId: record.mentionId, recipientId },
          data: { status: 'NOTIFIED', notificationId: row.id }
        });
      }
      notified += 1;
    } catch (error) {
      console.warn('[mentions] notify failed', error);
    }
  }
  return { notified };
};

/**
 * Ranked mention autocomplete candidates.
 */
export const searchMentionUsers = async (input: {
  actorId: string;
  query: string;
  clubId?: string | null;
  limit?: number;
}) => {
  const actorId = String(input.actorId || '').trim();
  const q = String(input.query || '')
    .trim()
    .replace(/^@+/, '')
    .slice(0, 40);
  const limit = Math.max(1, Math.min(30, Number(input.limit || 12) || 12));
  if (!actorId || !q) return [];

  const blocked = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: actorId }, { blockedId: actorId }]
    },
    select: { blockerId: true, blockedId: true }
  });
  const excluded = new Set<string>([actorId]);
  blocked.forEach((b) => {
    if (b.blockerId === actorId) excluded.add(b.blockedId);
    if (b.blockedId === actorId) excluded.add(b.blockerId);
  });

  const specials: Array<Record<string, unknown>> = [];
  const qLower = q.toLowerCase();
  if ('everyone'.startsWith(qLower) || qLower === 'every') {
    specials.push({
      id: 'special:everyone',
      username: 'everyone',
      name: 'Everyone (your followers)',
      avatar: null,
      isVerified: false,
      mentionKind: 'EVERYONE',
      isSpecial: true
    });
  }
  if (input.clubId && ('moderators'.startsWith(qLower) || 'mods'.startsWith(qLower))) {
    specials.push({
      id: 'special:moderators',
      username: 'moderators',
      name: 'Community moderators',
      avatar: null,
      isVerified: false,
      mentionKind: 'MODERATORS',
      isSpecial: true
    });
  }
  if (input.clubId && ('admins'.startsWith(qLower) || qLower === 'admin')) {
    specials.push({
      id: 'special:admins',
      username: 'admins',
      name: 'Community admins',
      avatar: null,
      isVerified: false,
      mentionKind: 'ADMINS',
      isSpecial: true
    });
  }
  if (SCROLITHA_MENTION_ALIASES.has(qLower) || 'scrolitha'.startsWith(qLower) || qLower === 'ai') {
    specials.push({
      id: 'special:scrolitha',
      username: 'Scrolitha',
      name: 'Scrolitha AI',
      avatar: null,
      isVerified: true,
      mentionKind: 'SCROLITHA',
      isSpecial: true,
      isScrolitha: true
    });
  }

  const clubMemberIds: string[] = [];
  if (input.clubId) {
    const members = await prisma.clubMembership.findMany({
      where: { clubId: input.clubId, status: 'active' },
      select: { userId: true },
      take: 500
    });
    members.forEach((m) => clubMemberIds.push(m.userId));
  }

  const followRows = await prisma.userFollow.findMany({
    where: {
      OR: [{ followerId: actorId }, { followeeId: actorId }]
    },
    select: { followerId: true, followeeId: true },
    take: 1000
  });
  const following = new Set<string>();
  const followers = new Set<string>();
  followRows.forEach((row) => {
    if (row.followerId === actorId) following.add(row.followeeId);
    if (row.followeeId === actorId) followers.add(row.followerId);
  });

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      id: excluded.size ? { notIn: Array.from(excluded) } : undefined,
      OR: [
        { username: { startsWith: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } }
      ]
    },
    take: 40,
    select: {
      id: true,
      username: true,
      name: true,
      avatar: true,
      role: true,
      isVerified: true,
      kycStatus: true
    }
  });

  const scored = users
    .filter((u) => String(u.username || '').trim())
    .map((u) => {
      const username = String(u.username || '');
      const uname = username.toLowerCase();
      const name = String(u.name || '').toLowerCase();
      let score = 0;
      if (uname === qLower) score += 1000;
      else if (uname.startsWith(qLower)) score += 500;
      else if (uname.includes(qLower)) score += 200;
      if (name.startsWith(qLower)) score += 120;
      else if (name.includes(qLower)) score += 40;
      if (clubMemberIds.includes(u.id)) score += 300;
      if (following.has(u.id) && followers.has(u.id)) score += 180;
      else if (following.has(u.id)) score += 120;
      else if (followers.has(u.id)) score += 80;
      if (u.isVerified) score += 15;
      return {
        id: u.id,
        username,
        name: u.name,
        avatar: u.avatar,
        role: u.role,
        isVerified: Boolean(u.isVerified),
        mentionKind: 'USER' as const,
        isSpecial: false,
        isFollowing: following.has(u.id),
        isFollower: followers.has(u.id),
        isMutual: following.has(u.id) && followers.has(u.id),
        isCommunityMember: clubMemberIds.includes(u.id),
        score
      };
    })
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
    .slice(0, limit);

  return [...specials, ...scored].slice(0, limit + specials.length);
};
