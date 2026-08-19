import { ChannelVisibility } from '@prisma/client';
import { normalizeCommunityClubVisibility } from '../utils/communityClubVisibility';

describe('CommunityClub visibility normalization', () => {
  test('returns Prisma enum members for supported API values', () => {
    expect(normalizeCommunityClubVisibility('public')).toBe(ChannelVisibility.PUBLIC);
    expect(normalizeCommunityClubVisibility('PRIVATE')).toBe(ChannelVisibility.PRIVATE);
  });

  test('defensively defaults invalid values to public', () => {
    expect(normalizeCommunityClubVisibility(undefined)).toBe(ChannelVisibility.PUBLIC);
    expect(normalizeCommunityClubVisibility('not-a-visibility')).toBe(ChannelVisibility.PUBLIC);
  });
});
