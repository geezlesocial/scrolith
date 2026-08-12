export const COMMUNITY_CLUB_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE'
} as const;

export type CommunityClubVisibility = (typeof COMMUNITY_CLUB_VISIBILITY)[keyof typeof COMMUNITY_CLUB_VISIBILITY];

export const buildCommunityEventActiveWhere = (now = new Date()) => ({
  endTime: { gte: now }
});
