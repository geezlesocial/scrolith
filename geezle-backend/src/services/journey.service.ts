import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { sendSystemEmail } from './email.service';
import { sendPushToUser } from './pushNotifications';
import {
  buildNotificationActionUrl,
  normalizeNotificationActionUrl,
  toAbsoluteFrontendUrl
} from './notificationActionUrl.service';

type TemplateFilters = {
  query?: string;
  category?: string;
  activeOnly?: boolean;
};

type FlowFilters = {
  query?: string;
  activeOnly?: boolean;
};

type RunFilters = {
  status?: string;
  limit?: number;
};

type SaveTemplateInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  type?: string;
  category?: string;
  titleTemplate?: string;
  bodyTemplate?: string;
  pushTitleTemplate?: string | null;
  pushBodyTemplate?: string | null;
  emailSubjectTemplate?: string | null;
  emailTextTemplate?: string | null;
  actionUrlTemplate?: string | null;
  defaultMeta?: unknown;
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  isSystemTemplate?: boolean;
  isActive?: boolean;
};

type SaveJourneyStepInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  templateId?: string;
  templateKey?: string;
  channel?: string;
  delayMinutes?: number;
  orderIndex?: number;
  actionUrl?: string | null;
  conditionConfig?: unknown;
  metadata?: unknown;
  isActive?: boolean;
};

type SaveJourneyFlowInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  triggerType?: string;
  audienceType?: string;
  audienceConfig?: unknown;
  metadata?: unknown;
  isSystemFlow?: boolean;
  isActive?: boolean;
  steps?: SaveJourneyStepInput[];
};

type TriggerJourneyRunInput = {
  flowId?: string;
  flowKey?: string;
  identifier?: string;
  context?: unknown;
};

type CreateQuietHourRuleInput = {
  label?: string | null;
  channel?: string;
  timezone?: string | null;
  daysOfWeek?: unknown;
  startMinute?: number;
  endMinute?: number;
  startTime?: string;
  endTime?: string;
  metadata?: unknown;
  isActive?: boolean;
};

type ResolvedUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  timezone: string | null;
  isActive: boolean;
};

type JourneyTemplateSeed = Omit<
  SaveTemplateInput,
  'id' | 'createdByStaffId' | 'updatedByStaffId'
> & {
  key: string;
  label: string;
  titleTemplate: string;
  bodyTemplate: string;
};

type JourneyFlowSeed = {
  key: string;
  label: string;
  description?: string;
  triggerType?: string;
  audienceType?: string;
  metadata?: unknown;
  steps: Array<
    SaveJourneyStepInput & {
      key: string;
      label: string;
      templateKey: string;
    }
  >;
};

const DEFAULT_NOTIFICATION_TEMPLATES: JourneyTemplateSeed[] = [
  {
    key: 'onboarding_welcome',
    label: 'Onboarding Welcome',
    description: 'Welcomes a user after signup and points them to the dashboard.',
    type: 'journey.onboarding',
    category: 'onboarding',
    titleTemplate: 'Welcome to {{platform.name}}, {{user.name}}',
    bodyTemplate: 'Your profile is ready. Start by publishing a gig, applying to a job, or joining the community.',
    pushTitleTemplate: 'Welcome to {{platform.name}}',
    pushBodyTemplate: 'Your account is ready. Explore gigs, jobs, and community recommendations.',
    emailSubjectTemplate: 'Welcome to {{platform.name}}',
    emailTextTemplate:
      'Hi {{user.name}}, your account is ready. Start by publishing a gig, applying to a job, or joining the community.',
    actionUrlTemplate: '/dashboard',
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: true,
    isSystemTemplate: true,
    isActive: true
  },
  {
    key: 'profile_completion_nudge',
    label: 'Profile Completion Nudge',
    description: 'Prompts a user to complete their profile after onboarding.',
    type: 'journey.profile_nudge',
    category: 'onboarding',
    titleTemplate: 'Complete your profile to unlock stronger discovery',
    bodyTemplate: 'Add your headline, skills, and portfolio to improve trust and ranking across Scrolith.',
    pushTitleTemplate: 'Complete your profile',
    pushBodyTemplate: 'A stronger profile improves ranking, trust, and hiring conversion.',
    emailSubjectTemplate: 'Complete your profile on {{platform.name}}',
    emailTextTemplate:
      'Add your headline, skills, and portfolio to improve trust and ranking across {{platform.name}}.',
    actionUrlTemplate: '/profile/edit',
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: true,
    isSystemTemplate: true,
    isActive: true
  },
  {
    key: 'application_status_update',
    label: 'Application Status Update',
    description: 'Lets a user know an application or proposal status changed.',
    type: 'journey.application_update',
    category: 'marketplace',
    titleTemplate: 'Your application status was updated',
    bodyTemplate: '{{statusMessage}}',
    pushTitleTemplate: 'Application update',
    pushBodyTemplate: '{{statusMessage}}',
    emailSubjectTemplate: 'Application update on {{platform.name}}',
    emailTextTemplate: '{{statusMessage}}',
    actionUrlTemplate: '/dashboard?tab=proposals',
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    isSystemTemplate: true,
    isActive: true
  },
  {
    key: 'live_room_reminder',
    label: 'Live Room Reminder',
    description: 'Reminds a user about a live room or session.',
    type: 'journey.live_reminder',
    category: 'live',
    titleTemplate: '{{eventTitle}} starts soon',
    bodyTemplate: 'Join {{eventTitle}} on {{platform.name}}.',
    pushTitleTemplate: '{{eventTitle}} starts soon',
    pushBodyTemplate: 'Tap to join {{eventTitle}}.',
    emailSubjectTemplate: '{{eventTitle}} starts soon',
    emailTextTemplate: 'Join {{eventTitle}} on {{platform.name}}.',
    actionUrlTemplate: '/live',
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: true,
    isSystemTemplate: true,
    isActive: true
  },
  {
    key: 'reactivation_nudge',
    label: 'Reactivation Nudge',
    description: 'Re-engages an inactive user with a return-to-feed prompt.',
    type: 'journey.reactivation',
    category: 'retention',
    titleTemplate: 'Fresh opportunities are waiting on {{platform.name}}',
    bodyTemplate: 'New gigs, jobs, and community conversations are ready for you.',
    pushTitleTemplate: 'New opportunities are waiting',
    pushBodyTemplate: 'Open {{platform.name}} to see new gigs, jobs, and recommendations.',
    emailSubjectTemplate: 'Come back to {{platform.name}}',
    emailTextTemplate: 'New gigs, jobs, and community conversations are ready for you on {{platform.name}}.',
    actionUrlTemplate: '/community',
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: true,
    isSystemTemplate: true,
    isActive: true
  }
];

const DEFAULT_JOURNEY_FLOWS: JourneyFlowSeed[] = [
  {
    key: 'onboarding_new_user',
    label: 'Onboarding: New User',
    description: 'Welcome plus profile-completion follow-up for new users.',
    triggerType: 'MANUAL',
    audienceType: 'USER',
    metadata: { recommended: true },
    steps: [
      { key: 'welcome', label: 'Welcome message', templateKey: 'onboarding_welcome', channel: 'ALL', delayMinutes: 0, orderIndex: 0, isActive: true },
      { key: 'profile_nudge', label: 'Profile completion reminder', templateKey: 'profile_completion_nudge', channel: 'ALL', delayMinutes: 1440, orderIndex: 1, isActive: true }
    ]
  },
  {
    key: 'marketplace_application_update',
    label: 'Marketplace: Application Update',
    description: 'Immediate application or proposal status update.',
    triggerType: 'MANUAL',
    audienceType: 'USER',
    metadata: { recommended: true },
    steps: [
      { key: 'application_update', label: 'Application update', templateKey: 'application_status_update', channel: 'ALL', delayMinutes: 0, orderIndex: 0, isActive: true }
    ]
  },
  {
    key: 'live_session_reminder',
    label: 'Live: Session Reminder',
    description: 'Reminder flow for live sessions and launches.',
    triggerType: 'MANUAL',
    audienceType: 'USER',
    steps: [
      { key: 'live_reminder', label: 'Live reminder', templateKey: 'live_room_reminder', channel: 'ALL', delayMinutes: 30, orderIndex: 0, isActive: true }
    ]
  },
  {
    key: 'reactivation_return_to_feed',
    label: 'Reactivation: Return To Feed',
    description: 'Simple win-back flow for inactive users.',
    triggerType: 'MANUAL',
    audienceType: 'USER',
    steps: [
      { key: 'return_prompt', label: 'Return to feed prompt', templateKey: 'reactivation_nudge', channel: 'ALL', delayMinutes: 0, orderIndex: 0, isActive: true }
    ]
  }
];

const QUIET_HOUR_CHANNELS = new Set(['ALL', 'IN_APP', 'PUSH', 'EMAIL']);
const JOURNEY_STEP_CHANNELS = new Set(['IN_APP', 'PUSH', 'EMAIL', 'ALL']);
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const JOURNEY_RUN_TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'SKIPPED', 'PARTIAL']);
const JOURNEY_POLL_INTERVAL_MS = 15_000;
const JOURNEY_BATCH_SIZE = 25;

let journeySeeded = false;
let runtimeStarted = false;
let processingJourneyStepRuns = false;

const cleanString = (value: unknown) => String(value ?? '').trim();
const cleanOptionalString = (value: unknown) => {
  const next = cleanString(value);
  return next.length ? next : null;
};

const cleanObject = (value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
};

const normalizeLimit = (value: unknown, fallback = 25, max = 100) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
};

const normalizeTemplateCategory = (value: unknown) => cleanString(value || 'journey') || 'journey';

const normalizeChannel = (value: unknown, fallback: 'IN_APP' | 'PUSH' | 'EMAIL' | 'ALL' = 'IN_APP') => {
  const candidate = cleanString(value).toUpperCase();
  if (JOURNEY_STEP_CHANNELS.has(candidate)) return candidate as 'IN_APP' | 'PUSH' | 'EMAIL' | 'ALL';
  return fallback;
};

const normalizeQuietHourChannel = (value: unknown) => {
  const candidate = cleanString(value).toUpperCase();
  if (QUIET_HOUR_CHANNELS.has(candidate)) return candidate;
  return 'PUSH';
};

const normalizeMinutes = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(60 * 24 - 1, parsed));
};

const parseTimeToMinute = (value: unknown, fallback = 0) => {
  const raw = cleanString(value);
  if (!raw) return fallback;
  const match = /^(\\d{1,2}):(\\d{2})$/.exec(raw);
  if (!match) return fallback;
  const hours = Math.max(0, Math.min(23, Number(match[1])));
  const minutes = Math.max(0, Math.min(59, Number(match[2])));
  return hours * 60 + minutes;
};

const normalizeDaysOfWeek = (value: unknown) => {
  const source = Array.isArray(value)
    ? value
    : cleanString(value)
      ? cleanString(value).split(',').map((entry) => entry.trim())
      : [];

  return Array.from(
    new Set(
      source
        .map((entry) => cleanString(entry).toUpperCase())
        .filter((entry) => WEEKDAYS.includes(entry))
    )
  );
};

const interpolateTemplate = (template: string | null | undefined, context: Record<string, any>) => {
  if (!template) return '';
  return String(template).replace(/\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}/g, (_match, path) => {
    const value = path.split('.').reduce((acc: any, key: string) => (acc ? acc[key] : undefined), context);
    if (value === undefined || value === null) return '';
    return String(value);
  });
};

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderJourneyEmailBody = (value: string) => {
  const blocks = String(value || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return '<p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">Open Scrolith to continue.</p>';
  }

  return blocks
    .map((block) => {
      const withBreaks = escapeHtml(block).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">${withBreaks}</p>`;
    })
    .join('');
};

const renderJourneyEmailHtml = (input: {
  title: string;
  bodyText: string;
  actionUrl?: string;
  actionLabel?: string;
  platformName: string;
  supportUrl?: string;
}) => {
  const ctaUrl = input.actionUrl ? escapeHtml(input.actionUrl) : '';
  const supportUrl = input.supportUrl ? escapeHtml(input.supportUrl) : '';
  const ctaLabel = escapeHtml(input.actionLabel || 'Open in Scrolith');
  const title = escapeHtml(input.title || input.platformName);
  const platformName = escapeHtml(input.platformName || 'Scrolith');
  const bodyHtml = renderJourneyEmailBody(input.bodyText);
  const ctaBlock = ctaUrl
    ? `
      <div style="margin:28px 0 24px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#2f6fed;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:700;">
          ${ctaLabel}
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#64748b;">If the button does not work, open this link:</p>
      <p style="margin:0;font-size:12px;line-height:1.7;color:#2563eb;word-break:break-word;">${ctaUrl}</p>
    `
    : '';
  const supportBlock = supportUrl
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Need help? Visit <a href="${supportUrl}" style="color:#2563eb;text-decoration:none;">Scrolith Support</a>.</p>`
    : '';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
      </head>
      <body style="margin:0;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:620px;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,0.08);">
                <tr>
                  <td style="padding:28px 32px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
                    <div style="font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72;">${platformName}</div>
                    <div style="margin-top:10px;font-size:26px;line-height:1.25;font-weight:800;">${title}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    ${bodyHtml}
                    ${ctaBlock}
                    ${supportBlock}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
};

const emitJourneyEvent = (event: string, payload: Record<string, any>) => {
  try {
    const io = (global as any).appIo || null;
    const communityIo = (global as any).appCommunityIo || io;
    io?.emit(event, payload);
    communityIo?.emit(event, payload);
  } catch (error) {
    console.warn('[journeys] failed to emit event', event, error);
  }
};

const resolveUserByIdentifier = async (identifier: string): Promise<ResolvedUser | null> => {
  const cleaned = cleanString(identifier);
  if (!cleaned) return null;

  return prisma.user.findFirst({
    where: {
      OR: [
        { id: cleaned },
        { email: { equals: cleaned, mode: 'insensitive' } },
        { username: { equals: cleaned, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      timezone: true,
      isActive: true
    }
  }) as unknown as ResolvedUser | null;
};

const mapNotificationTemplate = (template: any) => ({
  id: template.id,
  key: template.key,
  label: template.label,
  description: template.description || '',
  type: template.type,
  category: template.category,
  titleTemplate: template.titleTemplate,
  bodyTemplate: template.bodyTemplate,
  pushTitleTemplate: template.pushTitleTemplate || '',
  pushBodyTemplate: template.pushBodyTemplate || '',
  emailSubjectTemplate: template.emailSubjectTemplate || '',
  emailTextTemplate: template.emailTextTemplate || '',
  actionUrlTemplate: template.actionUrlTemplate || '',
  defaultMeta: template.defaultMeta || null,
  inAppEnabled: Boolean(template.inAppEnabled),
  pushEnabled: Boolean(template.pushEnabled),
  emailEnabled: Boolean(template.emailEnabled),
  isSystemTemplate: Boolean(template.isSystemTemplate),
  isActive: Boolean(template.isActive),
  createdByStaffId: template.createdByStaffId || null,
  updatedByStaffId: template.updatedByStaffId || null,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt
});

const mapJourneyStep = (step: any) => ({
  id: step.id,
  key: step.key,
  label: step.label,
  description: step.description || '',
  channel: step.channel,
  delayMinutes: Number(step.delayMinutes || 0),
  orderIndex: Number(step.orderIndex || 0),
  actionUrl: step.actionUrl || '',
  conditionConfig: step.conditionConfig || null,
  metadata: step.metadata || null,
  isActive: Boolean(step.isActive),
  templateId: step.templateId,
  templateKey: step.template?.key || '',
  templateLabel: step.template?.label || '',
  createdAt: step.createdAt,
  updatedAt: step.updatedAt
});

const mapJourneyFlow = (flow: any) => ({
  id: flow.id,
  key: flow.key,
  label: flow.label,
  description: flow.description || '',
  triggerType: flow.triggerType,
  audienceType: flow.audienceType,
  audienceConfig: flow.audienceConfig || null,
  metadata: flow.metadata || null,
  isSystemFlow: Boolean(flow.isSystemFlow),
  isActive: Boolean(flow.isActive),
  createdByStaffId: flow.createdByStaffId || null,
  updatedByStaffId: flow.updatedByStaffId || null,
  createdAt: flow.createdAt,
  updatedAt: flow.updatedAt,
  steps: Array.isArray(flow.steps) ? flow.steps.map(mapJourneyStep) : []
});

const mapQuietHourRule = (rule: any, user?: ResolvedUser | null) => ({
  id: rule.id,
  userId: rule.userId,
  label: rule.label || '',
  channel: rule.channel,
  timezone: rule.timezone || '',
  daysOfWeek: Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : [],
  startMinute: Number(rule.startMinute || 0),
  endMinute: Number(rule.endMinute || 0),
  metadata: rule.metadata || null,
  isActive: Boolean(rule.isActive),
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
  user: user
    ? {
        id: user.id,
        email: user.email,
        username: user.username || '',
        name: user.name || '',
        role: user.role,
        timezone: user.timezone || '',
        isActive: Boolean(user.isActive)
      }
    : null
});

const mapJourneyRun = (run: any, userMap?: Map<string, ResolvedUser>) => {
  const targetUser = userMap?.get(run.targetUserId || '');
  return {
    id: run.id,
    flowId: run.flowId,
    flowKey: run.flow?.key || '',
    flowLabel: run.flow?.label || '',
    targetUserId: run.targetUserId,
    initiatedByStaffId: run.initiatedByStaffId || null,
    triggerSource: run.triggerSource,
    status: run.status,
    context: run.context || null,
    results: run.results || null,
    lastError: run.lastError || '',
    startedAt: run.startedAt,
    completedAt: run.completedAt || null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    targetUser: targetUser
      ? {
          id: targetUser.id,
          email: targetUser.email,
          username: targetUser.username || '',
          name: targetUser.name || '',
          role: targetUser.role,
          timezone: targetUser.timezone || '',
          isActive: Boolean(targetUser.isActive)
        }
      : null,
    stepRuns: Array.isArray(run.stepRuns)
      ? run.stepRuns.map((stepRun: any) => ({
          id: stepRun.id,
          stepId: stepRun.stepId,
          stepKey: stepRun.step?.key || '',
          stepLabel: stepRun.step?.label || '',
          templateKey: stepRun.step?.template?.key || '',
          templateLabel: stepRun.step?.template?.label || '',
          channel: stepRun.channel,
          status: stepRun.status,
          scheduledFor: stepRun.scheduledFor,
          executedAt: stepRun.executedAt || null,
          attemptCount: Number(stepRun.attemptCount || 0),
          result: stepRun.result || null,
          errorMessage: stepRun.errorMessage || ''
        }))
      : []
  };
};

const buildJourneyContext = (input: {
  user: ResolvedUser;
  flow: any;
  step: any;
  template: any;
  runContext?: Record<string, any> | null;
}) => {
  const platformName = process.env.PLATFORM_NAME || 'Scrolith';
  const platformUrl = toAbsoluteFrontendUrl('/') || 'https://scrolith.com';
  const platformSupportUrl = toAbsoluteFrontendUrl('/support') || 'https://scrolith.com/support';
  return {
    ...(input.runContext || {}),
    platform: {
      name: platformName,
      url: platformUrl,
      supportUrl: platformSupportUrl,
      ...(input.runContext?.platform || {})
    },
    user: {
      id: input.user.id,
      name: input.user.name || input.user.email,
      email: input.user.email,
      username: input.user.username || '',
      role: input.user.role,
      timezone: input.user.timezone || ''
    },
    journey: {
      flowKey: input.flow.key,
      flowLabel: input.flow.label,
      stepKey: input.step.key,
      stepLabel: input.step.label
    },
    notification: {
      type: input.template.type,
      category: input.template.category
    }
  };
};

const getLocalDayAndMinute = (timezone: string | null | undefined, date = new Date()) => {
  const effectiveTimezone = cleanString(timezone) || 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: effectiveTimezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(date);
    const weekday = cleanString(parts.find((part) => part.type === 'weekday')?.value).toUpperCase();
    const hour = Number.parseInt(cleanString(parts.find((part) => part.type === 'hour')?.value), 10);
    const minute = Number.parseInt(cleanString(parts.find((part) => part.type === 'minute')?.value), 10);
    return {
      weekday: WEEKDAYS.includes(weekday) ? weekday : 'SUNDAY',
      minuteOfDay: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
      timezone: effectiveTimezone
    };
  } catch {
    return {
      weekday: WEEKDAYS[new Date().getUTCDay()],
      minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(),
      timezone: 'UTC'
    };
  }
};

const isRuleBlockingNow = (rule: any, channel: string, userTimezone?: string | null) => {
  if (!rule?.isActive) return false;
  if (!(rule.channel === 'ALL' || rule.channel === channel)) return false;
  const days = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : [];
  const local = getLocalDayAndMinute(rule.timezone || userTimezone || null);
  if (days.length > 0 && !days.includes(local.weekday)) return false;

  const startMinute = normalizeMinutes(rule.startMinute, 0);
  const endMinute = normalizeMinutes(rule.endMinute, 0);
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) {
    return local.minuteOfDay >= startMinute && local.minuteOfDay < endMinute;
  }
  return local.minuteOfDay >= startMinute || local.minuteOfDay < endMinute;
};

const createRealtimeNotificationPayload = (notification: any, actionUrl?: string) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  actionUrl,
  createdAt: notification.createdAt.toISOString(),
  meta: notification.meta || null
});

const refreshJourneyRunState = async (runId: string) => {
  const rows = await prisma.journeyStepRun.findMany({
    where: { runId },
    select: { status: true }
  });

  const counts = rows.reduce(
    (acc, row) => {
      const key = cleanString(row.status).toUpperCase();
      acc.total += 1;
      if (key === 'PENDING') acc.pending += 1;
      else if (key === 'PROCESSING') acc.processing += 1;
      else if (key === 'COMPLETED') acc.completed += 1;
      else if (key === 'SKIPPED') acc.skipped += 1;
      else if (key === 'FAILED') acc.failed += 1;
      return acc;
    },
    { total: 0, pending: 0, processing: 0, completed: 0, skipped: 0, failed: 0 }
  );

  let nextStatus = 'PENDING';
  if (counts.processing > 0 || (counts.completed > 0 && counts.pending > 0)) nextStatus = 'RUNNING';
  else if (counts.pending > 0) nextStatus = 'PENDING';
  else if (counts.failed > 0 && counts.completed === 0 && counts.skipped === 0) nextStatus = 'FAILED';
  else if (counts.failed > 0) nextStatus = 'PARTIAL';
  else if (counts.skipped > 0 && counts.completed === 0) nextStatus = 'SKIPPED';
  else nextStatus = 'COMPLETED';

  await prisma.journeyRun.update({
    where: { id: runId },
    data: {
      status: nextStatus,
      results: counts as any,
      completedAt: JOURNEY_RUN_TERMINAL_STATUSES.has(nextStatus) ? new Date() : null,
      updatedAt: new Date()
    }
  });
};

const deliverStepRun = async (stepRun: any) => {
  const run = stepRun.run;
  const step = stepRun.step;
  const template = step?.template;

  if (!run?.id || !step?.id || !template?.id) {
    return {
      status: 'FAILED',
      result: { error: 'Missing journey run context' },
      errorMessage: 'Missing journey run context'
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: run.targetUserId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      timezone: true,
      isActive: true
    }
  });

  if (!user?.id || !user.isActive) {
    return {
      status: 'SKIPPED',
      result: { reason: 'target_user_unavailable' },
      errorMessage: ''
    };
  }

  const [settings, quietHours] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.quietHourRule.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  const runContext = cleanObject(run.context) as Record<string, any> | null;
  const context = buildJourneyContext({
    user: user as unknown as ResolvedUser,
    flow: run.flow,
    step,
    template,
    runContext
  });

  const channel = normalizeChannel(stepRun.channel || step.channel || 'IN_APP');
  const actionUrl =
    normalizeNotificationActionUrl(
      interpolateTemplate(
        cleanOptionalString(step.actionUrl) || cleanOptionalString(template.actionUrlTemplate),
        context
      ) || buildNotificationActionUrl(template.type as any, runContext || {})
    ) || undefined;

  const baseTitle = interpolateTemplate(template.titleTemplate, context) || template.label;
  const baseBody = interpolateTemplate(template.bodyTemplate, context);
  const pushTitle = interpolateTemplate(template.pushTitleTemplate || template.titleTemplate, context) || baseTitle;
  const pushBody = interpolateTemplate(template.pushBodyTemplate || template.bodyTemplate, context) || baseBody;
  const emailSubject =
    interpolateTemplate(template.emailSubjectTemplate || template.titleTemplate, context) || baseTitle;
  const emailText = interpolateTemplate(template.emailTextTemplate || template.bodyTemplate, context) || baseBody;
  const absoluteActionUrl = toAbsoluteFrontendUrl(actionUrl);
  const emailTextWithLink =
    absoluteActionUrl && !emailText.includes(absoluteActionUrl)
      ? `${emailText}\n\nOpen in Scrolith: ${absoluteActionUrl}`
      : emailText;
  const meta = {
    ...(cleanObject(template.defaultMeta) || {}),
    ...(runContext?.meta && cleanObject(runContext.meta) ? runContext.meta : {}),
    journeyFlowKey: run.flow?.key || '',
    journeyStepKey: step.key,
    journeyRunId: run.id,
    ...(actionUrl
      ? {
          actionUrl,
          action_url: actionUrl,
          link: actionUrl
        }
      : {})
  };

  const allowInApp = template.inAppEnabled && settings?.inAppNotifications !== false;
  const allowPush = template.pushEnabled && settings?.inAppNotifications !== false;
  const allowEmail = template.emailEnabled && settings?.emailNotifications !== false;
  const result = {
    notificationCreated: false,
    pushSent: false,
    emailSent: false,
    skipped: [] as string[]
  };

  const evaluateQuietHours = (nextChannel: 'IN_APP' | 'PUSH' | 'EMAIL') =>
    quietHours.some((rule) => isRuleBlockingNow(rule, nextChannel, user.timezone));

  if (channel === 'IN_APP' || channel === 'ALL') {
    if (!allowInApp) result.skipped.push('in_app_disabled');
    else if (evaluateQuietHours('IN_APP')) result.skipped.push('in_app_quiet_hours');
    else {
      const created = await prisma.notification.create({
        data: {
          userId: user.id,
          actorId: null,
          type: template.type,
          title: baseTitle,
          body: baseBody,
          meta: meta as any
        }
      });
      realtime.emitToUser(user.id, 'notifications:new', createRealtimeNotificationPayload(created, actionUrl));
      result.notificationCreated = true;
    }
  }

  if (channel === 'PUSH' || channel === 'ALL') {
    if (!allowPush) result.skipped.push('push_disabled');
    else if (evaluateQuietHours('PUSH')) result.skipped.push('push_quiet_hours');
    else {
      const pushResult = await sendPushToUser(user.id, {
        type: template.type,
        title: pushTitle,
        body: pushBody,
        actionUrl,
        meta
      });
      result.pushSent = Number(pushResult.sent || 0) > 0;
      if (!result.pushSent && Number(pushResult.attempted || 0) === 0) {
        result.skipped.push('push_no_devices');
      }
    }
  }

  if (channel === 'EMAIL' || channel === 'ALL') {
    if (!allowEmail) result.skipped.push('email_disabled');
    else if (evaluateQuietHours('EMAIL')) result.skipped.push('email_quiet_hours');
    else if (!cleanString(user.email)) result.skipped.push('email_missing');
    else {
      const emailResult = await sendSystemEmail({
        to: user.email,
        subject: emailSubject,
        text: emailTextWithLink,
        html: renderJourneyEmailHtml({
          title: emailSubject,
          bodyText: emailText,
          actionUrl: absoluteActionUrl,
          actionLabel: 'Open in Scrolith',
          platformName: context.platform?.name || 'Scrolith',
          supportUrl: context.platform?.supportUrl
        })
      });
      result.emailSent = Boolean(emailResult.success);
      if (!result.emailSent) result.skipped.push('email_failed');
    }
  }

  if (result.notificationCreated || result.pushSent || result.emailSent) {
    return { status: 'COMPLETED', result, errorMessage: '' };
  }

  return { status: 'SKIPPED', result, errorMessage: '' };
};

export const processDueJourneyStepRuns = async () => {
  if (processingJourneyStepRuns) return;
  processingJourneyStepRuns = true;

  try {
    const dueRows = await prisma.journeyStepRun.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: new Date() }
      },
      include: {
        run: {
          include: {
            flow: {
              select: {
                id: true,
                key: true,
                label: true
              }
            }
          }
        },
        step: {
          include: {
            template: true
          }
        }
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: JOURNEY_BATCH_SIZE
    });

    for (const row of dueRows) {
      try {
        await prisma.journeyStepRun.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 }
          }
        });

        await prisma.journeyRun.update({
          where: { id: row.runId },
          data: { status: 'RUNNING' }
        });

        const outcome = await deliverStepRun(row);
        await prisma.journeyStepRun.update({
          where: { id: row.id },
          data: {
            status: outcome.status,
            executedAt: new Date(),
            result: outcome.result as any,
            errorMessage: outcome.errorMessage || null
          }
        });

        await refreshJourneyRunState(row.runId);
        emitJourneyEvent('journeys:updated', {
          action: 'step_run_processed',
          runId: row.runId,
          stepRunId: row.id,
          status: outcome.status,
          flowKey: row.run?.flow?.key || ''
        });
      } catch (error: any) {
        await prisma.journeyStepRun.updateMany({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            executedAt: new Date(),
            errorMessage: error?.message || 'Journey step delivery failed'
          }
        });
        await prisma.journeyRun.updateMany({
          where: { id: row.runId },
          data: {
            status: 'FAILED',
            lastError: error?.message || 'Journey step delivery failed',
            completedAt: new Date()
          }
        });
        emitJourneyEvent('journeys:updated', {
          action: 'step_run_failed',
          runId: row.runId,
          stepRunId: row.id,
          status: 'FAILED',
          error: error?.message || 'Journey step delivery failed'
        });
      }
    }
  } finally {
    processingJourneyStepRuns = false;
  }
};

export const ensureJourneyRuntimeReady = () => {
  if (runtimeStarted || process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') return;
  runtimeStarted = true;
  const timer = setInterval(() => {
    void processDueJourneyStepRuns().catch((error) => {
      console.error('[journeys] failed to process due journey step runs', error);
    });
  }, JOURNEY_POLL_INTERVAL_MS);
  if (typeof (timer as any).unref === 'function') {
    (timer as any).unref();
  }
  void processDueJourneyStepRuns().catch((error) => {
    console.error('[journeys] failed to process initial journey step runs', error);
  });
};

export const ensureJourneySeeds = async () => {
  if (journeySeeded) return;

  for (const templateSeed of DEFAULT_NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: templateSeed.key },
      create: {
        key: templateSeed.key,
        label: templateSeed.label,
        description: cleanOptionalString(templateSeed.description),
        type: cleanString(templateSeed.type || 'system') || 'system',
        category: normalizeTemplateCategory(templateSeed.category),
        titleTemplate: templateSeed.titleTemplate,
        bodyTemplate: templateSeed.bodyTemplate,
        pushTitleTemplate: cleanOptionalString(templateSeed.pushTitleTemplate),
        pushBodyTemplate: cleanOptionalString(templateSeed.pushBodyTemplate),
        emailSubjectTemplate: cleanOptionalString(templateSeed.emailSubjectTemplate),
        emailTextTemplate: cleanOptionalString(templateSeed.emailTextTemplate),
        actionUrlTemplate: cleanOptionalString(templateSeed.actionUrlTemplate),
        defaultMeta: (templateSeed.defaultMeta as any) || null,
        inAppEnabled: templateSeed.inAppEnabled !== false,
        pushEnabled: Boolean(templateSeed.pushEnabled),
        emailEnabled: Boolean(templateSeed.emailEnabled),
        isSystemTemplate: true,
        isActive: templateSeed.isActive !== false
      },
      update: {
        label: templateSeed.label,
        description: cleanOptionalString(templateSeed.description),
        type: cleanString(templateSeed.type || 'system') || 'system',
        category: normalizeTemplateCategory(templateSeed.category),
        titleTemplate: templateSeed.titleTemplate,
        bodyTemplate: templateSeed.bodyTemplate,
        pushTitleTemplate: cleanOptionalString(templateSeed.pushTitleTemplate),
        pushBodyTemplate: cleanOptionalString(templateSeed.pushBodyTemplate),
        emailSubjectTemplate: cleanOptionalString(templateSeed.emailSubjectTemplate),
        emailTextTemplate: cleanOptionalString(templateSeed.emailTextTemplate),
        actionUrlTemplate: cleanOptionalString(templateSeed.actionUrlTemplate),
        defaultMeta: (templateSeed.defaultMeta as any) || null,
        inAppEnabled: templateSeed.inAppEnabled !== false,
        pushEnabled: Boolean(templateSeed.pushEnabled),
        emailEnabled: Boolean(templateSeed.emailEnabled),
        isSystemTemplate: true,
        isActive: templateSeed.isActive !== false
      }
    });
  }

  const templates = await prisma.notificationTemplate.findMany({
    where: { key: { in: DEFAULT_NOTIFICATION_TEMPLATES.map((entry) => entry.key) } },
    select: { id: true, key: true }
  });
  const templateMap = new Map(templates.map((template) => [template.key, template.id]));

  for (const flowSeed of DEFAULT_JOURNEY_FLOWS) {
    const flow = await prisma.journeyFlow.upsert({
      where: { key: flowSeed.key },
      create: {
        key: flowSeed.key,
        label: flowSeed.label,
        description: cleanOptionalString(flowSeed.description),
        triggerType: cleanString(flowSeed.triggerType || 'MANUAL') || 'MANUAL',
        audienceType: cleanString(flowSeed.audienceType || 'USER') || 'USER',
        metadata: (flowSeed.metadata as any) || null,
        isSystemFlow: true,
        isActive: true
      },
      update: {
        label: flowSeed.label,
        description: cleanOptionalString(flowSeed.description),
        triggerType: cleanString(flowSeed.triggerType || 'MANUAL') || 'MANUAL',
        audienceType: cleanString(flowSeed.audienceType || 'USER') || 'USER',
        metadata: (flowSeed.metadata as any) || null,
        isSystemFlow: true,
        isActive: true
      }
    });

    for (const [index, stepSeed] of flowSeed.steps.entries()) {
      const templateId = templateMap.get(stepSeed.templateKey);
      if (!templateId) continue;
      await prisma.journeyStep.upsert({
        where: {
          flowId_key: {
            flowId: flow.id,
            key: stepSeed.key
          }
        },
        create: {
          flowId: flow.id,
          templateId,
          key: stepSeed.key,
          label: stepSeed.label,
          description: cleanOptionalString(stepSeed.description),
          channel: normalizeChannel(stepSeed.channel, 'ALL'),
          delayMinutes: normalizeMinutes(stepSeed.delayMinutes, 0),
          orderIndex: normalizeMinutes(stepSeed.orderIndex, index),
          actionUrl: cleanOptionalString(stepSeed.actionUrl),
          conditionConfig: (stepSeed.conditionConfig as any) || null,
          metadata: (stepSeed.metadata as any) || null,
          isActive: stepSeed.isActive !== false
        },
        update: {
          templateId,
          label: stepSeed.label,
          description: cleanOptionalString(stepSeed.description),
          channel: normalizeChannel(stepSeed.channel, 'ALL'),
          delayMinutes: normalizeMinutes(stepSeed.delayMinutes, 0),
          orderIndex: normalizeMinutes(stepSeed.orderIndex, index),
          actionUrl: cleanOptionalString(stepSeed.actionUrl),
          conditionConfig: (stepSeed.conditionConfig as any) || null,
          metadata: (stepSeed.metadata as any) || null,
          isActive: stepSeed.isActive !== false
        }
      });
    }
  }

  journeySeeded = true;
};

export const getJourneySummary = async () => {
  await ensureJourneySeeds();
  const [templates, activeTemplates, flows, activeFlows, steps, pendingStepRuns, recentRuns, quietHours] =
    await prisma.$transaction([
      prisma.notificationTemplate.count(),
      prisma.notificationTemplate.count({ where: { isActive: true } }),
      prisma.journeyFlow.count(),
      prisma.journeyFlow.count({ where: { isActive: true } }),
      prisma.journeyStep.count(),
      prisma.journeyStepRun.count({ where: { status: 'PENDING' } }),
      prisma.journeyRun.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.quietHourRule.count({ where: { isActive: true } })
    ]);

  return {
    templates,
    activeTemplates,
    flows,
    activeFlows,
    steps,
    pendingStepRuns,
    recentRuns,
    quietHours
  };
};

export const listNotificationTemplates = async (filters: TemplateFilters = {}) => {
  await ensureJourneySeeds();
  const query = cleanString(filters.query);
  const category = cleanString(filters.category);
  const rows = await prisma.notificationTemplate.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { type: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ category: 'asc' }, { label: 'asc' }]
  });
  return rows.map(mapNotificationTemplate);
};

export const saveNotificationTemplate = async (input: SaveTemplateInput, staffUserId?: string | null) => {
  await ensureJourneySeeds();
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const titleTemplate = cleanString(input.titleTemplate);
  const bodyTemplate = cleanString(input.bodyTemplate);

  if (!key) throw new Error('Template key is required');
  if (!label) throw new Error('Template label is required');
  if (!titleTemplate) throw new Error('Title template is required');
  if (!bodyTemplate) throw new Error('Body template is required');

  const payload = {
    key,
    label,
    description: cleanOptionalString(input.description),
    type: cleanString(input.type || 'system') || 'system',
    category: normalizeTemplateCategory(input.category),
    titleTemplate,
    bodyTemplate,
    pushTitleTemplate: cleanOptionalString(input.pushTitleTemplate),
    pushBodyTemplate: cleanOptionalString(input.pushBodyTemplate),
    emailSubjectTemplate: cleanOptionalString(input.emailSubjectTemplate),
    emailTextTemplate: cleanOptionalString(input.emailTextTemplate),
    actionUrlTemplate: cleanOptionalString(input.actionUrlTemplate),
    defaultMeta: (input.defaultMeta as any) || null,
    inAppEnabled: input.inAppEnabled !== false,
    pushEnabled: Boolean(input.pushEnabled),
    emailEnabled: Boolean(input.emailEnabled),
    isSystemTemplate: Boolean(input.isSystemTemplate),
    isActive: input.isActive !== false,
    updatedByStaffId: staffUserId || null
  };

  const stored = input.id
    ? await prisma.notificationTemplate.update({
        where: { id: input.id },
        data: payload
      })
    : await prisma.notificationTemplate.create({
        data: {
          ...payload,
          createdByStaffId: staffUserId || null
        }
      });

  return mapNotificationTemplate(stored);
};

export const deactivateNotificationTemplate = async (id: string, staffUserId?: string | null) => {
  const stored = await prisma.notificationTemplate.update({
    where: { id },
    data: {
      isActive: false,
      updatedByStaffId: staffUserId || null
    }
  });
  return mapNotificationTemplate(stored);
};

export const listJourneyFlows = async (filters: FlowFilters = {}) => {
  await ensureJourneySeeds();
  const query = cleanString(filters.query);
  const rows = await prisma.journeyFlow.findMany({
    where: {
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    include: {
      steps: {
        include: {
          template: {
            select: {
              id: true,
              key: true,
              label: true
            }
          }
        },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      }
    },
    orderBy: [{ isSystemFlow: 'desc' }, { label: 'asc' }]
  });
  return rows.map(mapJourneyFlow);
};

export const saveJourneyFlow = async (input: SaveJourneyFlowInput, staffUserId?: string | null) => {
  await ensureJourneySeeds();
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const stepsInput = Array.isArray(input.steps) ? input.steps : [];

  if (!key) throw new Error('Flow key is required');
  if (!label) throw new Error('Flow label is required');
  if (!stepsInput.length) throw new Error('At least one journey step is required');

  const flow = input.id
    ? await prisma.journeyFlow.update({
        where: { id: input.id },
        data: {
          key,
          label,
          description: cleanOptionalString(input.description),
          triggerType: cleanString(input.triggerType || 'MANUAL') || 'MANUAL',
          audienceType: cleanString(input.audienceType || 'USER') || 'USER',
          audienceConfig: (input.audienceConfig as any) || null,
          metadata: (input.metadata as any) || null,
          isSystemFlow: Boolean(input.isSystemFlow),
          isActive: input.isActive !== false,
          updatedByStaffId: staffUserId || null
        }
      })
    : await prisma.journeyFlow.create({
        data: {
          key,
          label,
          description: cleanOptionalString(input.description),
          triggerType: cleanString(input.triggerType || 'MANUAL') || 'MANUAL',
          audienceType: cleanString(input.audienceType || 'USER') || 'USER',
          audienceConfig: (input.audienceConfig as any) || null,
          metadata: (input.metadata as any) || null,
          isSystemFlow: Boolean(input.isSystemFlow),
          isActive: input.isActive !== false,
          createdByStaffId: staffUserId || null,
          updatedByStaffId: staffUserId || null
        }
      });

  const existingSteps = await prisma.journeyStep.findMany({
    where: { flowId: flow.id },
    select: { id: true }
  });
  const retainedStepIds = new Set<string>();

  for (const [index, stepInput] of stepsInput.entries()) {
    const stepKey = cleanString(stepInput.key);
    const stepLabel = cleanString(stepInput.label);
    if (!stepKey) throw new Error(`Journey step ${index + 1} key is required`);
    if (!stepLabel) throw new Error(`Journey step ${index + 1} label is required`);

    const template =
      (stepInput.templateId
        ? await prisma.notificationTemplate.findUnique({
            where: { id: stepInput.templateId },
            select: { id: true }
          })
        : null) ||
      (stepInput.templateKey
        ? await prisma.notificationTemplate.findUnique({
            where: { key: stepInput.templateKey },
            select: { id: true }
          })
        : null);

    if (!template?.id) throw new Error(`Journey step ${stepLabel} must reference a valid template`);

    const stepPayload = {
      flowId: flow.id,
      templateId: template.id,
      key: stepKey,
      label: stepLabel,
      description: cleanOptionalString(stepInput.description),
      channel: normalizeChannel(stepInput.channel, 'ALL'),
      delayMinutes: normalizeMinutes(stepInput.delayMinutes, 0),
      orderIndex: normalizeMinutes(stepInput.orderIndex, index),
      actionUrl: cleanOptionalString(stepInput.actionUrl),
      conditionConfig: (stepInput.conditionConfig as any) || null,
      metadata: (stepInput.metadata as any) || null,
      isActive: stepInput.isActive !== false
    };

    const storedStep =
      stepInput.id && existingSteps.some((step) => step.id === stepInput.id)
        ? await prisma.journeyStep.update({
            where: { id: stepInput.id },
            data: stepPayload
          })
        : await prisma.journeyStep.upsert({
            where: {
              flowId_key: {
                flowId: flow.id,
                key: stepKey
              }
            },
            create: stepPayload,
            update: stepPayload
          });

    retainedStepIds.add(storedStep.id);
  }

  const stepIdsToDeactivate = existingSteps.map((step) => step.id).filter((id) => !retainedStepIds.has(id));
  if (stepIdsToDeactivate.length > 0) {
    await prisma.journeyStep.updateMany({
      where: { id: { in: stepIdsToDeactivate } },
      data: { isActive: false }
    });
  }

  const stored = await prisma.journeyFlow.findUnique({
    where: { id: flow.id },
    include: {
      steps: {
        include: {
          template: {
            select: {
              id: true,
              key: true,
              label: true
            }
          }
        },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });

  return mapJourneyFlow(stored);
};

export const deactivateJourneyFlow = async (id: string, staffUserId?: string | null) => {
  const flow = await prisma.journeyFlow.update({
    where: { id },
    data: {
      isActive: false,
      updatedByStaffId: staffUserId || null
    }
  });

  await prisma.journeyStep.updateMany({
    where: { flowId: flow.id },
    data: { isActive: false }
  });

  const stored = await prisma.journeyFlow.findUnique({
    where: { id: flow.id },
    include: {
      steps: {
        include: {
          template: {
            select: {
              id: true,
              key: true,
              label: true
            }
          }
        },
        orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });

  return mapJourneyFlow(stored);
};

export const listJourneyRuns = async (filters: RunFilters = {}) => {
  const rows = await prisma.journeyRun.findMany({
    where: cleanString(filters.status) ? { status: cleanString(filters.status).toUpperCase() } : undefined,
    include: {
      flow: {
        select: {
          id: true,
          key: true,
          label: true
        }
      },
      stepRuns: {
        include: {
          step: {
            include: {
              template: {
                select: {
                  key: true,
                  label: true
                }
              }
            }
          }
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }]
      }
    },
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(filters.limit, 25)
  });

  const userIds = Array.from(new Set(rows.map((row) => row.targetUserId).filter(Boolean)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          timezone: true,
          isActive: true
        }
      })
    : [];
  const userMap = new Map<string, ResolvedUser>(
    users.map((user) => [user.id, user as unknown as ResolvedUser] as [string, ResolvedUser])
  );

  return rows.map((row) => mapJourneyRun(row, userMap));
};

export const triggerJourneyRun = async (input: TriggerJourneyRunInput, staffUserId?: string | null) => {
  await ensureJourneySeeds();
  const identifier = cleanString(input.identifier);
  if (!identifier) throw new Error('User identifier is required');

  const user = await resolveUserByIdentifier(identifier);
  if (!user?.id) throw new Error('User not found');
  if (!user.isActive) throw new Error('User is inactive');

  const flow =
    (input.flowId
      ? await prisma.journeyFlow.findUnique({
          where: { id: input.flowId },
          include: {
            steps: {
              where: { isActive: true },
              include: { template: true },
              orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
            }
          }
        })
      : null) ||
    (cleanString(input.flowKey)
      ? await prisma.journeyFlow.findUnique({
          where: { key: cleanString(input.flowKey) },
          include: {
            steps: {
              where: { isActive: true },
              include: { template: true },
              orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
            }
          }
        })
      : null);

  if (!flow?.id) throw new Error('Journey flow not found');
  if (!flow.isActive) throw new Error('Journey flow is inactive');
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) throw new Error('Journey flow has no active steps');

  const context = cleanObject(input.context) || null;
  const created = await prisma.$transaction(async (tx) => {
    const run = await tx.journeyRun.create({
      data: {
        flowId: flow.id,
        targetUserId: user.id,
        initiatedByStaffId: staffUserId || null,
        triggerSource: 'admin',
        status: 'PENDING',
        context: context as any
      }
    });

    const now = Date.now();
    await tx.journeyStepRun.createMany({
      data: flow.steps.map((step) => ({
        runId: run.id,
        stepId: step.id,
        targetUserId: user.id,
        channel: normalizeChannel(step.channel, 'IN_APP'),
        status: 'PENDING',
        scheduledFor: new Date(now + normalizeMinutes(step.delayMinutes, 0) * 60 * 1000)
      }))
    });

    return run;
  });

  const stored = await prisma.journeyRun.findUnique({
    where: { id: created.id },
    include: {
      flow: {
        select: {
          id: true,
          key: true,
          label: true
        }
      },
      stepRuns: {
        include: {
          step: {
            include: {
              template: {
                select: {
                  key: true,
                  label: true
                }
              }
            }
          }
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });

  emitJourneyEvent('journeys:updated', {
    action: 'run_created',
    runId: stored.id,
    flowKey: stored.flow?.key || '',
    targetUserId: stored.targetUserId
  });

  void processDueJourneyStepRuns().catch((error) => {
    console.error('[journeys] immediate processing failed', error);
  });

  return mapJourneyRun(stored, new Map<string, ResolvedUser>([[user.id, user]]));
};

export const getAdminQuietHours = async (identifier: string) => {
  const user = await resolveUserByIdentifier(identifier);
  if (!user?.id) return { user: null, rules: [] };

  const rules = await prisma.quietHourRule.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username || '',
      name: user.name || '',
      role: user.role,
      timezone: user.timezone || '',
      isActive: Boolean(user.isActive)
    },
    rules: rules.map((rule) => mapQuietHourRule(rule, user))
  };
};

export const getMyQuietHours = async (userId: string) => {
  const rules = await prisma.quietHourRule.findMany({
    where: { userId, isActive: true },
    orderBy: [{ createdAt: 'desc' }]
  });
  return rules.map((rule) => mapQuietHourRule(rule));
};

export const createMyQuietHourRule = async (userId: string, input: CreateQuietHourRuleInput) => {
  const rule = await prisma.quietHourRule.create({
    data: {
      userId,
      label: cleanOptionalString(input.label),
      channel: normalizeQuietHourChannel(input.channel),
      timezone: cleanOptionalString(input.timezone),
      daysOfWeek: normalizeDaysOfWeek(input.daysOfWeek),
      startMinute:
        input.startMinute !== undefined ? normalizeMinutes(input.startMinute, 0) : parseTimeToMinute(input.startTime, 22 * 60),
      endMinute:
        input.endMinute !== undefined ? normalizeMinutes(input.endMinute, 0) : parseTimeToMinute(input.endTime, 7 * 60),
      metadata: (input.metadata as any) || null,
      isActive: input.isActive !== false
    }
  });

  emitJourneyEvent('notifications:preferences_updated', {
    action: 'quiet_hours_created',
    userId,
    ruleId: rule.id
  });

  return mapQuietHourRule(rule);
};

export const deactivateMyQuietHourRule = async (userId: string, id: string) => {
  const current = await prisma.quietHourRule.findUnique({ where: { id } });
  if (!current?.id || current.userId !== userId) throw new Error('Quiet hour rule not found');

  const rule = await prisma.quietHourRule.update({
    where: { id },
    data: { isActive: false }
  });

  emitJourneyEvent('notifications:preferences_updated', {
    action: 'quiet_hours_deactivated',
    userId,
    ruleId: rule.id
  });

  return mapQuietHourRule(rule);
};

ensureJourneyRuntimeReady();
