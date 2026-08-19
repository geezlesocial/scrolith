import { ChannelVisibility } from '@prisma/client';

/**
 * Convert API or persisted visibility input into the exact Prisma enum value
 * required by CommunityClub. Invalid values retain the existing public default.
 */
export const normalizeCommunityClubVisibility = (value: unknown): ChannelVisibility => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === ChannelVisibility.PRIVATE ? ChannelVisibility.PRIVATE : ChannelVisibility.PUBLIC;
};
