/**
 * Event → NI category / notification type mapping (Phase 10.6).
 */
import type { PreferenceCategoryKey } from '../preferences/preference.types';
import { categoryFromLegacyEngagementType } from '../preferences/preference.validation';
import type { EventDomainSource, EventEnvelope } from './event.types';
import { PLACEHOLDER_EVENT_SOURCES } from './event.types';

export type EventMappingResult = {
  notificationType: string;
  category: PreferenceCategoryKey | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'none';
  notes: string[];
  isPlaceholderSource: boolean;
};

const fromSourceDefault = (source: string): PreferenceCategoryKey | 'unknown' => {
  switch (source) {
    case 'messaging':
      return 'messages';
    case 'posts':
      return 'system';
    case 'comments':
      return 'comments';
    case 'reactions':
      return 'likes';
    case 'follows':
      return 'followers';
    case 'jobs':
      return 'jobs';
    case 'marketplace':
      return 'marketplace';
    case 'communities':
      return 'communities';
    case 'companies':
      return 'companies';
    case 'system':
      return 'system';
    case 'scrolitha':
    case 'discovery':
    case 'search':
      return 'future';
    default:
      return 'unknown';
  }
};

/** Extract last segment of dotted type: messaging.message.created → message.created / created */
const typeTail = (type: string) => {
  const parts = String(type || '')
    .toLowerCase()
    .split('.')
    .filter(Boolean);
  return parts.slice(-2).join('.') || String(type || '').toLowerCase();
};

/**
 * Map envelope to NI notification type + preference category.
 */
export const mapEnvelopeToNotificationHints = (envelope: EventEnvelope): EventMappingResult => {
  const source = String(envelope.source || 'unknown').toLowerCase();
  const type = String(envelope.type || '').toLowerCase();
  const notes: string[] = [];
  const isPlaceholderSource = (PLACEHOLDER_EVENT_SOURCES as string[]).includes(source);

  // Legacy engagement-style types
  const legacy = categoryFromLegacyEngagementType(type);
  if (legacy) {
    return {
      notificationType: type,
      category: legacy,
      confidence: 'high',
      notes: ['mapped_via_legacy_engagement_type'],
      isPlaceholderSource
    };
  }

  // Dotted domain types
  if (type.includes('mention')) {
    return {
      notificationType: type.includes('comment') ? 'mention_comment' : 'mention_post',
      category: 'mentions',
      confidence: 'high',
      notes: ['mapped_mention'],
      isPlaceholderSource
    };
  }

  if (source === 'messaging' || type.includes('message') || type.includes('dm')) {
    return {
      notificationType: type || 'message_received',
      category: 'messages',
      confidence: 'high',
      notes: ['mapped_messaging'],
      isPlaceholderSource
    };
  }

  if (source === 'comments' || type.includes('comment')) {
    if (type.includes('reply')) {
      return {
        notificationType: type || 'comment_reply',
        category: 'replies',
        confidence: 'high',
        notes: ['mapped_reply'],
        isPlaceholderSource
      };
    }
    return {
      notificationType: type || 'comment_on_post',
      category: 'comments',
      confidence: 'high',
      notes: ['mapped_comment'],
      isPlaceholderSource
    };
  }

  if (source === 'reactions' || type.includes('reaction') || type.includes('like')) {
    return {
      notificationType: type || 'reaction_on_post',
      category: 'likes',
      confidence: 'high',
      notes: ['mapped_reaction'],
      isPlaceholderSource
    };
  }

  if (source === 'follows' || type.includes('follow')) {
    return {
      notificationType: type.includes('post') ? 'followed_new_post' : 'followed_you',
      category: 'followers',
      confidence: 'high',
      notes: ['mapped_follow'],
      isPlaceholderSource
    };
  }

  if (source === 'jobs' || type.includes('job') || type.includes('proposal') || type.includes('application')) {
    return {
      notificationType: type || 'job_application_created',
      category: 'jobs',
      confidence: 'high',
      notes: ['mapped_jobs'],
      isPlaceholderSource
    };
  }

  if (source === 'marketplace' || type.includes('order') || type.includes('listing')) {
    return {
      notificationType: type || 'marketplace_event',
      category: 'marketplace',
      confidence: 'medium',
      notes: ['mapped_marketplace'],
      isPlaceholderSource
    };
  }

  if (source === 'communities' || type.includes('community') || type.includes('group')) {
    return {
      notificationType: type || 'community_event',
      category: 'communities',
      confidence: 'medium',
      notes: ['mapped_communities'],
      isPlaceholderSource
    };
  }

  if (source === 'companies' || type.includes('company') || type.includes('page')) {
    return {
      notificationType: type || 'company_event',
      category: 'companies',
      confidence: 'medium',
      notes: ['mapped_companies'],
      isPlaceholderSource
    };
  }

  if (source === 'system' || type.includes('security') || type.includes('admin')) {
    return {
      notificationType: type || 'system_event',
      category: 'system',
      confidence: type.includes('security') ? 'high' : 'medium',
      notes: ['mapped_system'],
      isPlaceholderSource
    };
  }

  if (source === 'posts') {
    return {
      notificationType: type || 'post_event',
      category: fromSourceDefault('posts'),
      confidence: 'low',
      notes: ['mapped_posts_generic'],
      isPlaceholderSource
    };
  }

  if (isPlaceholderSource) {
    notes.push('placeholder_source_no_producer_wiring');
    return {
      notificationType: type || `${source}.event`,
      category: 'future',
      confidence: 'none',
      notes,
      isPlaceholderSource: true
    };
  }

  const cat = fromSourceDefault(source);
  notes.push(`fallback_source:${source}`, `type_tail:${typeTail(type)}`);
  return {
    notificationType: type || 'unknown_event',
    category: cat,
    confidence: cat === 'unknown' ? 'none' : 'low',
    notes,
    isPlaceholderSource
  };
};

export const isPlaceholderEventSource = (source: EventDomainSource | string): boolean =>
  (PLACEHOLDER_EVENT_SOURCES as string[]).includes(String(source || '').toLowerCase());
