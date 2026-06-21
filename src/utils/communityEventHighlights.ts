import type { CommunityEvent } from '../types';

export type HighlightCommunityEvent = {
  id: string;
  title: string;
  description: string;
  type: string;
  hostName: string;
  image: string;
  location: string;
  attendees: number;
  maxAttendees: number | null;
  isRegistered: boolean;
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date | null;
  isLive: boolean;
  category: 'office-hours' | 'ama' | 'event';
  badge: string;
  timingLabel: string;
  metaLabel: string;
};

const OFFICE_HOUR_PATTERN = /\b(office\s*hours?|drop-?in|clinic|coaching|mentor(?:ing)?|ask me anything|ama|q&a)\b/i;
const AMA_PATTERN = /\b(ask me anything|ama|q&a)\b/i;
const LIVE_WINDOW_GRACE_MS = 20 * 60 * 1000;

const formatFutureLabel = (date: Date) => {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'Starting now';
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `Starts in ${minutes}m`;
  const hours = Math.round(diffMs / 3600000);
  if (hours < 24) return `Starts in ${hours}h`;
  const days = Math.round(diffMs / 86400000);
  if (days <= 7) return `Starts in ${days}d`;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatMetaLabel = (event: {
  attendees: number;
  location: string;
  hostName: string;
  startDate: Date;
}) => {
  const parts = [
    event.hostName,
    `${Math.max(0, Number(event.attendees || 0))} attending`,
    event.location || '',
    event.startDate.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  ].filter(Boolean);
  return parts.join(' · ');
};

const resolveEventWindow = (event: any) => {
  const startTime = String(event?.startTime || event?.start_time || '').trim();
  const endTime = String(event?.endTime || event?.end_time || '').trim();
  const startDate = startTime ? new Date(startTime) : null;
  const endDate = endTime ? new Date(endTime) : null;
  if (!startDate || !Number.isFinite(startDate.getTime())) return null;
  const safeEndDate = endDate && Number.isFinite(endDate.getTime()) ? endDate : null;
  return {
    startTime,
    endTime,
    startDate,
    endDate: safeEndDate
  };
};

export const getHighlightedCommunityEvents = (
  events: CommunityEvent[] | any[] | null | undefined,
  limit = 3
): HighlightCommunityEvent[] => {
  const now = Date.now();
  const normalized = (Array.isArray(events) ? events : [])
    .map((event) => {
      const window = resolveEventWindow(event);
      if (!window) return null;
      const endTime = window.endDate?.getTime() ?? window.startDate.getTime() + 60 * 60 * 1000;
      if (endTime < now - LIVE_WINDOW_GRACE_MS) return null;
      const title = String(event?.title || '').trim();
      const description = String(event?.description || '').trim();
      const hostName = String(event?.hostName || event?.host_name || 'Scrolith host').trim();
      const type = String(event?.type || 'event').trim().toLowerCase();
      const classifierSource = `${title} ${description} ${type}`.trim();
      const isAma = AMA_PATTERN.test(classifierSource);
      const isOfficeHours = OFFICE_HOUR_PATTERN.test(classifierSource) || type === 'webinar';
      const isLive = window.startDate.getTime() <= now && endTime >= now;
      const category: HighlightCommunityEvent['category'] = isAma ? 'ama' : isOfficeHours ? 'office-hours' : 'event';
      const badge = isLive ? 'Live now' : event?.isRegistered || event?.is_registered ? 'Joined' : isAma ? 'AMA' : isOfficeHours ? 'Office hours' : 'Event';
      const timingLabel = isLive ? 'Live now' : formatFutureLabel(window.startDate);
      return {
        id: String(event?.id || '').trim(),
        title: title || 'Scrolith event',
        description: description || 'Join a live session, ask questions, and stay close to creator or company updates.',
        type,
        hostName,
        image: String(event?.image || '').trim(),
        location: String(event?.location || '').trim(),
        attendees: Number(event?.attendees || 0),
        maxAttendees:
          event?.maxAttendees === null || event?.maxAttendees === undefined
            ? event?.max_attendees === null || event?.max_attendees === undefined
              ? null
              : Number(event?.max_attendees || 0)
            : Number(event?.maxAttendees || 0),
        isRegistered: Boolean(event?.isRegistered ?? event?.is_registered),
        startTime: window.startTime,
        endTime: window.endTime,
        startDate: window.startDate,
        endDate: window.endDate,
        isLive,
        category,
        badge,
        timingLabel,
        metaLabel: formatMetaLabel({
          attendees: Number(event?.attendees || 0),
          location: String(event?.location || '').trim(),
          hostName,
          startDate: window.startDate
        })
      } satisfies HighlightCommunityEvent;
    })
    .filter((event): event is HighlightCommunityEvent => Boolean(event?.id));

  return normalized
    .sort((left, right) => {
      const leftPriority = left.isLive ? 0 : left.category === 'ama' ? 1 : left.category === 'office-hours' ? 2 : 3;
      const rightPriority = right.isLive ? 0 : right.category === 'ama' ? 1 : right.category === 'office-hours' ? 2 : 3;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.startDate.getTime() - right.startDate.getTime();
    })
    .slice(0, Math.max(1, limit));
};
