/**
 * Phase 22.3B — Enterprise messaging privacy settings panel.
 * Global privacy controls (not conversation-scoped).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MessagingService } from '../../services/messaging';
import {
  MESSAGING_PRIVACY_DEFAULTS,
  type DirectMessageAudience,
  type MessagingPrivacySettings,
  type PrivacyAudience
} from '../../utils/messagingPrivacy';
import { Loader2, Shield, Bell, Eye, MessageCircle, Users } from 'lucide-react';

type Props = {
  open: boolean;
  /** Optional external status callback */
  onSaved?: (settings: MessagingPrivacySettings) => void;
  onError?: (message: string) => void;
};

const AUDIENCE_OPTIONS: { value: PrivacyAudience; label: string; hint: string }[] = [
  { value: 'EVERYONE', label: 'Everyone', hint: 'Anyone allowed by platform policy' },
  { value: 'CONTACTS', label: 'Contacts', hint: 'People you follow or who follow you' },
  { value: 'NOBODY', label: 'Nobody', hint: 'Hidden from others' }
];

const DM_OPTIONS: { value: DirectMessageAudience; label: string; hint: string }[] = [
  { value: 'EVERYONE', label: 'Everyone', hint: 'Anyone can start a new message' },
  { value: 'CONTACTS', label: 'Contacts', hint: 'Only contacts can start new DMs' },
  { value: 'FOLLOWERS', label: 'Followers', hint: 'Only people who follow you' },
  { value: 'NOBODY', label: 'Nobody', hint: 'No new unsolicited DMs (existing chats stay open)' }
];

const ToggleRow: React.FC<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ id, label, description, checked, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-3 py-2.5">
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-900">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-gray-500">{description}</p>
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer touch-manipulation rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

const AudienceGroup: React.FC<{
  name: string;
  label: string;
  description: string;
  value: PrivacyAudience;
  disabled?: boolean;
  onChange: (next: PrivacyAudience) => void;
  options?: typeof AUDIENCE_OPTIONS;
}> = ({ name, label, description, value, disabled, onChange, options = AUDIENCE_OPTIONS }) => (
  <fieldset className="space-y-2 py-2" disabled={disabled}>
    <legend className="text-sm font-medium text-gray-900">{label}</legend>
    <p className="text-xs text-gray-500">{description}</p>
    <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex min-h-11 cursor-pointer touch-manipulation items-start gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
            value === opt.value
              ? 'border-blue-300 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            disabled={disabled}
            onChange={() => onChange(opt.value as PrivacyAudience)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="font-medium text-gray-900">{opt.label}</span>
            <span className="mt-0.5 block text-xs text-gray-500">{opt.hint}</span>
          </span>
        </label>
      ))}
    </div>
  </fieldset>
);

const MessagingPrivacySettingsPanel: React.FC<Props> = ({ open, onSaved, onError }) => {
  const [settings, setSettings] = useState<MessagingPrivacySettings>({ ...MESSAGING_PRIVACY_DEFAULTS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const next = await MessagingService.getMessagingPrivacySettings();
      setSettings(next);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load privacy settings';
      setLoadError(msg);
      setSettings({ ...MESSAGING_PRIVACY_DEFAULTS });
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPatch = async (patch: Partial<MessagingPrivacySettings>) => {
    const prev = settings;
    const optimistic = { ...prev, ...patch };
    setSettings(optimistic);
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await MessagingService.patchMessagingPrivacySettings(patch);
      setSettings(saved);
      setStatusMsg('Privacy settings saved.');
      onSaved?.(saved);
    } catch (e: any) {
      setSettings(prev);
      const msg = e?.response?.data?.error || e?.message || 'Unable to update privacy settings.';
      setStatusMsg(null);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500" data-testid="messaging-privacy-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading privacy settings…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 py-4" data-testid="messaging-privacy-error">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="messaging-privacy-panel" aria-busy={saving}>
      <p className="text-xs text-gray-500">
        These controls apply to <span className="font-semibold">all conversations</span>. Changes sync across your
        devices. Existing authorized chats are not deleted when you restrict who can message you.
      </p>

      {statusMsg ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
          {statusMsg}
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="privacy-presence-heading">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-indigo-600" />
          <h4 id="privacy-presence-heading" className="text-sm font-semibold text-gray-900">
            Presence
          </h4>
        </div>
        <AudienceGroup
          name="onlineStatusVisibility"
          label="Online status"
          description="Who can see when you are online, away, or offline."
          value={settings.onlineStatusVisibility}
          disabled={saving}
          onChange={(onlineStatusVisibility) => void applyPatch({ onlineStatusVisibility })}
        />
        <AudienceGroup
          name="lastSeenVisibility"
          label="Last seen"
          description="Who can see your last-seen timestamp (independent of online status)."
          value={settings.lastSeenVisibility}
          disabled={saving}
          onChange={(lastSeenVisibility) => void applyPatch({ lastSeenVisibility })}
        />
      </section>

      <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="privacy-indicators-heading">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" />
          <h4 id="privacy-indicators-heading" className="text-sm font-semibold text-gray-900">
            Read, typing & recording
          </h4>
        </div>
        <ToggleRow
          id="read-receipts"
          label="Read receipts"
          description="When off, others will not see that you read their messages. Your unread counts still update correctly."
          checked={settings.readReceiptsEnabled}
          disabled={saving}
          onChange={(readReceiptsEnabled) => void applyPatch({ readReceiptsEnabled })}
        />
        <ToggleRow
          id="typing-indicators"
          label="Typing indicators"
          description="When off, others will not see when you are typing."
          checked={settings.typingIndicatorsEnabled}
          disabled={saving}
          onChange={(typingIndicatorsEnabled) => void applyPatch({ typingIndicatorsEnabled })}
        />
        <ToggleRow
          id="recording-indicators"
          label="Recording indicators"
          description="When off, others will not see when you are recording a voice note. Recording still works."
          checked={settings.recordingIndicatorsEnabled}
          disabled={saving}
          onChange={(recordingIndicatorsEnabled) => void applyPatch({ recordingIndicatorsEnabled })}
        />
      </section>

      <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="privacy-audience-heading">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          <h4 id="privacy-audience-heading" className="text-sm font-semibold text-gray-900">
            Who can reach you
          </h4>
        </div>
        <fieldset className="space-y-2 py-2" disabled={saving}>
          <legend className="text-sm font-medium text-gray-900">Who can message me</legend>
          <p className="text-xs text-gray-500">
            Controls new direct conversations only. Existing chats remain unless you block someone.
          </p>
          <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Who can message me">
            {DM_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex min-h-11 cursor-pointer touch-manipulation items-start gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                  settings.directMessageAudience === opt.value
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="directMessageAudience"
                  value={opt.value}
                  checked={settings.directMessageAudience === opt.value}
                  disabled={saving}
                  onChange={() => void applyPatch({ directMessageAudience: opt.value })}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-gray-900">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-2 flex items-start gap-2">
          <Users className="mt-1 h-4 w-4 shrink-0 text-violet-600" />
          <div className="min-w-0 flex-1">
            <AudienceGroup
              name="groupInviteAudience"
              label="Who can add me to groups"
              description="Applies to invites, invite links, and admin member-add APIs."
              value={settings.groupInviteAudience}
              disabled={saving}
              onChange={(groupInviteAudience) => void applyPatch({ groupInviteAudience })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 p-4" aria-labelledby="privacy-notify-heading">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-600" />
          <h4 id="privacy-notify-heading" className="text-sm font-semibold text-gray-900">
            Notifications
          </h4>
        </div>
        <ToggleRow
          id="message-previews"
          label="Message previews in notifications"
          description="When off, push and system notifications show a generic title without message body or attachment details."
          checked={settings.notificationMessagePreviewEnabled}
          disabled={saving}
          onChange={(notificationMessagePreviewEnabled) =>
            void applyPatch({ notificationMessagePreviewEnabled })
          }
        />
      </section>

      {settings.updatedAt ? (
        <p className="text-[11px] text-gray-400">
          Last updated {new Date(settings.updatedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
};

export default MessagingPrivacySettingsPanel;
