/**
 * Phase 22.3B — conversation three-dot menu information architecture.
 * Pure helpers for grouping + labels (unit-testable without React).
 */

export type ConversationMenuAction =
  | 'move_other'
  | 'label_jobs'
  | 'mark_unread'
  | 'toggle_star'
  | 'toggle_mute'
  | 'archive'
  | 'report_block'
  | 'delete'
  | 'manage_settings'
  | 'group_settings'
  | 'leave_group';

export type MenuSectionId = 'organization' | 'notifications' | 'conversation' | 'privacy_safety' | 'destructive';

export type ConversationMenuItem = {
  id: ConversationMenuAction;
  label: string;
  section: MenuSectionId;
  destructive?: boolean;
  /** Feature flag key on messagingControls (optional) */
  controlKey?: string;
};

export type ConversationMenuState = {
  isStarred: boolean;
  isMuted: boolean;
  isArchived: boolean;
  label: 'jobs' | 'other';
  isGroup: boolean;
  isDm: boolean;
};

export const buildConversationMenuItems = (state: ConversationMenuState): ConversationMenuItem[] => {
  const items: ConversationMenuItem[] = [
    {
      id: 'move_other',
      label: 'Move to Other',
      section: 'organization',
      controlKey: 'enableMoveToOther'
    },
    {
      id: 'label_jobs',
      label: state.label === 'jobs' ? 'Remove Jobs label' : 'Label as Jobs',
      section: 'organization',
      controlKey: 'enableLabelAsJobs'
    },
    {
      id: 'toggle_star',
      label: state.isStarred ? 'Remove Star' : 'Star',
      section: 'organization',
      controlKey: 'enableStar'
    },
    {
      id: 'mark_unread',
      label: 'Mark as unread',
      section: 'organization',
      controlKey: 'enableMarkUnread'
    },
    {
      id: 'archive',
      label: state.isArchived ? 'Unarchive' : 'Archive',
      section: 'organization',
      controlKey: 'enableArchive'
    },
    {
      id: 'toggle_mute',
      label: state.isMuted ? 'Unmute' : 'Mute',
      section: 'notifications',
      controlKey: 'enableMute'
    },
    {
      id: 'manage_settings',
      label: 'Messaging privacy',
      section: 'privacy_safety',
      controlKey: 'enableManageMessageSettings'
    },
    {
      id: 'report_block',
      label: 'Report / Block',
      section: 'privacy_safety',
      controlKey: 'enableReportBlock'
    }
  ];

  if (state.isGroup) {
    items.push({
      id: 'group_settings',
      label: 'Group settings & members',
      section: 'conversation'
    });
    items.push({
      id: 'delete',
      label: 'Leave group',
      section: 'destructive',
      destructive: true,
      controlKey: 'enableDeleteConversation'
    });
  } else {
    items.push({
      id: 'delete',
      label: 'Delete conversation',
      section: 'destructive',
      destructive: true,
      controlKey: 'enableDeleteConversation'
    });
  }

  return items;
};

export const SECTION_LABELS: Record<MenuSectionId, string> = {
  organization: 'Organization',
  notifications: 'Notifications',
  conversation: 'Conversation',
  privacy_safety: 'Privacy and safety',
  destructive: ''
};

export const SECTION_ORDER: MenuSectionId[] = [
  'organization',
  'notifications',
  'conversation',
  'privacy_safety',
  'destructive'
];

export const groupMenuItemsBySection = (items: ConversationMenuItem[]) => {
  return SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    items: items.filter((item) => item.section === section)
  })).filter((group) => group.items.length > 0);
};
