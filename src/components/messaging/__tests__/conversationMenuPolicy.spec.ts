import { describe, expect, it } from 'vitest';
import {
  buildConversationMenuItems,
  groupMenuItemsBySection
} from '../conversationMenuPolicy';

describe('conversationMenuPolicy', () => {
  it('DM menu includes delete conversation and messaging privacy', () => {
    const items = buildConversationMenuItems({
      isStarred: false,
      isMuted: false,
      isArchived: false,
      label: 'other',
      isGroup: false,
      isDm: true
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('manage_settings');
    expect(ids).toContain('delete');
    expect(ids).not.toContain('group_settings');
    const del = items.find((i) => i.id === 'delete');
    expect(del?.label).toBe('Delete conversation');
    expect(del?.destructive).toBe(true);
  });

  it('group menu uses leave group and group settings', () => {
    const items = buildConversationMenuItems({
      isStarred: true,
      isMuted: true,
      isArchived: true,
      label: 'jobs',
      isGroup: true,
      isDm: false
    });
    expect(items.some((i) => i.id === 'group_settings')).toBe(true);
    expect(items.find((i) => i.id === 'delete')?.label).toBe('Leave group');
    expect(items.find((i) => i.id === 'toggle_star')?.label).toBe('Remove Star');
    expect(items.find((i) => i.id === 'toggle_mute')?.label).toBe('Unmute');
    expect(items.find((i) => i.id === 'archive')?.label).toBe('Unarchive');
    expect(items.find((i) => i.id === 'label_jobs')?.label).toBe('Remove Jobs label');
  });

  it('menu sections keep privacy out of organization', () => {
    const items = buildConversationMenuItems({
      isStarred: false,
      isMuted: false,
      isArchived: false,
      label: 'other',
      isGroup: false,
      isDm: true
    });
    const groups = groupMenuItemsBySection(items);
    const privacy = groups.find((g) => g.section === 'privacy_safety');
    const org = groups.find((g) => g.section === 'organization');
    expect(privacy?.items.some((i) => i.id === 'manage_settings')).toBe(true);
    expect(privacy?.items.some((i) => i.id === 'report_block')).toBe(true);
    expect(org?.items.some((i) => i.id === 'manage_settings')).toBe(false);
  });
});
