export const ENGAGEMENT_EVENT_TYPES = {
  POST_IMPRESSION: 'engagement.post.impression',
  PROFILE_SEARCH_APPEARANCE: 'engagement.profile.search_appearance',
  MARKETPLACE_LISTING_IMPRESSION: 'engagement.marketplace.listing.impression',
  SCROLL_IMPRESSION: 'engagement.scroll.impression',
  PROFILE_DIRECT_VIEW: 'engagement.profile.direct_view',
  CONTENT_REACH: 'engagement.content.reach',
  MARKETPLACE_LISTING_SAVE: 'engagement.marketplace.listing.save',
  MARKETPLACE_LISTING_INQUIRY: 'engagement.marketplace.listing.inquiry',
  QUALIFIED_OPPORTUNITY: 'engagement.opportunity.qualified'
} as const;

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[keyof typeof ENGAGEMENT_EVENT_TYPES];

export type EngagementSignalInput = {
  sourceEventId: string;
  eventType: EngagementEventType | string;
  entityType: string;
  entityId: string;
  ownerId: string;
  actorId?: string | null;
  aggregateCount: number;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
};

export const DEFAULT_ENGAGEMENT_TEMPLATES: Record<string, { title: string; body: string; deepLink: string }> = {
  [ENGAGEMENT_EVENT_TYPES.POST_IMPRESSION]: {
    title: 'Your post is gaining reach',
    body: 'Your post has reached {{count}} impressions.',
    deepLink: '/feed'
  },
  [ENGAGEMENT_EVENT_TYPES.PROFILE_SEARCH_APPEARANCE]: {
    title: 'Your profile is being discovered',
    body: 'Your profile has appeared in {{count}} searches.',
    deepLink: '/profile/analytics'
  },
  [ENGAGEMENT_EVENT_TYPES.MARKETPLACE_LISTING_IMPRESSION]: {
    title: 'Your listing is getting attention',
    body: 'Your listing has reached {{count}} views.',
    deepLink: '/marketplace/my-listings'
  },
  [ENGAGEMENT_EVENT_TYPES.SCROLL_IMPRESSION]: {
    title: 'Your Scroll is reaching more people',
    body: 'Your Scroll has reached {{count}} impressions.',
    deepLink: '/scroll'
  },
  [ENGAGEMENT_EVENT_TYPES.PROFILE_DIRECT_VIEW]: {
    title: 'Your profile is getting noticed',
    body: 'Your profile has received {{count}} visits.',
    deepLink: '/profile/analytics'
  },
  [ENGAGEMENT_EVENT_TYPES.CONTENT_REACH]: {
    title: 'Your content is reaching people',
    body: 'Your content has reached {{count}} people.',
    deepLink: '/analytics'
  },
  [ENGAGEMENT_EVENT_TYPES.MARKETPLACE_LISTING_SAVE]: {
    title: 'Your listing was saved',
    body: 'Your listing has been saved {{count}} times.',
    deepLink: '/marketplace/my-listings'
  },
  [ENGAGEMENT_EVENT_TYPES.MARKETPLACE_LISTING_INQUIRY]: {
    title: 'Your listing has buyer interest',
    body: 'Your listing has received {{count}} inquiries.',
    deepLink: '/marketplace/my-listings'
  },
  [ENGAGEMENT_EVENT_TYPES.QUALIFIED_OPPORTUNITY]: {
    title: 'You have a qualified opportunity',
    body: 'You have received {{count}} qualified opportunities.',
    deepLink: '/opportunities'
  }
};
