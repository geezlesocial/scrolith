/**
 * Phase 29.3 — Enterprise Messaging Groups creation wizard (6 steps).
 * Submits via MessagingService.createEnterpriseGroup (Phase 29.1 API).
 */
import React, { useMemo, useState } from 'react';
import { MessagingService } from '../../services/messaging';
import { JOIN_POLICY_HELP, VISIBILITY_HELP } from '../../utils/groupMessagingUx';
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  Lock,
  Shield,
  Users,
  Sparkles,
  Check
} from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  onCreated: (conversationId: string) => void;
  onError?: (message: string) => void;
};

const STEPS = [
  'Identity',
  'Privacy',
  'Joining',
  'Permissions',
  'Content',
  'Review'
] as const;

const CATEGORIES = [
  'Family',
  'Friends',
  'Work',
  'Project',
  'Community',
  'Support',
  'Other'
];

const defaultContent = {
  allowImages: true,
  allowVideos: true,
  allowFiles: true,
  allowAudio: true,
  allowVoice: true,
  allowGifs: true,
  allowStickers: true,
  allowPolls: true,
  allowEvents: true,
  allowLocation: false,
  allowContacts: false,
  allowReactions: true,
  allowEditing: true,
  allowDelete: true,
  allowForward: true,
  allowCopy: true,
  allowExternalLinks: true
};

const GroupCreateWizard: React.FC<Props> = ({
  open,
  onClose,
  currentUserId,
  onCreated,
  onError
}) => {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Work');
  const [accentColor, setAccentColor] = useState('#4f46e5');
  const [emoji, setEmoji] = useState('💬');
  const [language, setLanguage] = useState('en');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState(
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : ''
  );
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'SECRET'>('PRIVATE');
  const [joinPolicy, setJoinPolicy] = useState<'OPEN' | 'REQUEST' | 'INVITE_ONLY'>('INVITE_ONLY');
  const [inviteExpiryHours, setInviteExpiryHours] = useState(168);
  const [inviteMaxUses, setInviteMaxUses] = useState<number | ''>('');
  const [messagingMode, setMessagingMode] = useState('EVERYONE');
  const [memberIdsRaw, setMemberIdsRaw] = useState('');
  const [content, setContent] = useState({ ...defaultContent });

  const memberIds = useMemo(
    () =>
      Array.from(
        new Set(
          memberIdsRaw
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter((id) => id && id !== currentUserId)
        )
      ),
    [memberIdsRaw, currentUserId]
  );

  if (!open) return null;

  const canNext = () => {
    if (step === 0) return name.trim().length >= 2;
    return true;
  };

  const effectiveJoinPolicy =
    visibility === 'SECRET' ? 'INVITE_ONLY' : joinPolicy;

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const data = await MessagingService.createEnterpriseGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        language: language || undefined,
        country: country || undefined,
        timezone: timezone || undefined,
        emoji: emoji || undefined,
        accentColor: accentColor || undefined,
        visibility,
        joinPolicy: effectiveJoinPolicy,
        messagingMode,
        memberUserIds: memberIds,
        content,
        // invite defaults stored for first invite after create (wizard review only)
        inviteDefaults: {
          expiresInHours: inviteExpiryHours,
          maxUses: inviteMaxUses === '' ? undefined : Number(inviteMaxUses)
        }
      });
      const id = String(data?.id || data?.conversationId || '').trim();
      if (!id) throw new Error('Group created without id');
      onCreated(id);
      // reset
      setStep(0);
      setName('');
      setDescription('');
      setMemberIdsRaw('');
      setContent({ ...defaultContent });
    } catch (e: any) {
      onError?.(e?.message || 'Failed to create group');
    } finally {
      setBusy(false);
    }
  };

  const toggleContent = (key: keyof typeof defaultContent) => {
    setContent((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create messaging group"
      data-testid="group-create-wizard"
    >
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Create messaging group</h2>
              <p className="text-xs text-slate-500">
                Step {step + 1} of {STEPS.length}: {STEPS[step]}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              onClick={() => !busy && onClose()}
              disabled={busy}
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-indigo-600' : 'bg-slate-200'}`}
              />
            ))}
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {step === 0 && (
            <div className="space-y-3" data-testid="wizard-step-identity">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 to-white p-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-sm"
                  style={{ backgroundColor: `${accentColor}22` }}
                >
                  {emoji || '💬'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {name.trim() || 'Group name preview'}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {description.trim() || 'Description preview'}
                  </div>
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="e.g. Product Team"
                  data-testid="wizard-group-name"
                  maxLength={120}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[72px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="What is this group for?"
                  maxLength={2000}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emoji</span>
                  <input
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accent</span>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-xl border border-slate-200"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Language</span>
                  <input
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="en"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Country</span>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="US"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timezone</span>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Initial members (user ids, optional)
                </span>
                <input
                  value={memberIdsRaw}
                  onChange={(e) => setMemberIdsRaw(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="userId1, userId2"
                  data-testid="wizard-member-ids"
                />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3" data-testid="wizard-step-privacy">
              {(
                [
                  { key: 'PUBLIC' as const, icon: Globe2, title: 'Public' },
                  { key: 'PRIVATE' as const, icon: Users, title: 'Private' },
                  { key: 'SECRET' as const, icon: Lock, title: 'Secret' }
                ] as const
              ).map(({ key, icon: Icon, title }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setVisibility(key);
                    if (key === 'SECRET') setJoinPolicy('INVITE_ONLY');
                    if (key === 'PUBLIC' && joinPolicy === 'INVITE_ONLY') setJoinPolicy('OPEN');
                  }}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    visibility === key
                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  data-testid={`wizard-visibility-${key.toLowerCase()}`}
                >
                  <Icon className="mt-0.5 h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    <p className="mt-0.5 text-xs text-slate-600">{VISIBILITY_HELP[key]}</p>
                  </div>
                  {visibility === key ? <Check className="ml-auto h-5 w-5 text-indigo-600" /> : null}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3" data-testid="wizard-step-joining">
              {visibility === 'SECRET' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Secret groups force invite-only joining. No discovery or previews.
                </div>
              ) : null}
              {(
                [
                  { key: 'OPEN' as const, title: 'Open join' },
                  { key: 'REQUEST' as const, title: 'Approval required' },
                  { key: 'INVITE_ONLY' as const, title: 'Invite only' }
                ] as const
              ).map(({ key, title }) => (
                <button
                  key={key}
                  type="button"
                  disabled={visibility === 'SECRET' && key !== 'INVITE_ONLY'}
                  onClick={() => setJoinPolicy(key)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                    effectiveJoinPolicy === key
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200'
                  } disabled:opacity-40`}
                >
                  <div className="font-semibold text-slate-900">{title}</div>
                  <p className="text-xs text-slate-600">{JOIN_POLICY_HELP[key]}</p>
                </button>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="block space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-slate-500">
                    Invite expiry (hours)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={inviteExpiryHours}
                    onChange={(e) => setInviteExpiryHours(Number(e.target.value) || 168)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-slate-500">Max uses</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="Unlimited"
                    value={inviteMaxUses}
                    onChange={(e) =>
                      setInviteMaxUses(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Invite links and QR codes can be generated after creation from Group settings.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" data-testid="wizard-step-permissions">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Who can send messages
                </span>
                <select
                  value={messagingMode}
                  onChange={(e) => setMessagingMode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  data-testid="wizard-messaging-mode"
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="ADMINS_ONLY">Admins only</option>
                  <option value="MODS_PLUS">Moderators and admins</option>
                  <option value="ANNOUNCEMENT">Announcement only</option>
                  <option value="READ_ONLY">Read only</option>
                </select>
              </label>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <div className="mb-1 flex items-center gap-1 font-semibold text-slate-800">
                  <Shield className="h-3.5 w-3.5" /> Role matrix
                </div>
                <p>
                  Owner and Admins manage members, invites, and group info. Moderators help moderate.
                  Members participate subject to messaging mode and content settings. Granular
                  overrides are available after creation in Permissions.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2" data-testid="wizard-step-content">
              {(
                [
                  ['allowImages', 'Images'],
                  ['allowVideos', 'Videos'],
                  ['allowFiles', 'Documents / files'],
                  ['allowAudio', 'Audio'],
                  ['allowVoice', 'Voice notes'],
                  ['allowGifs', 'GIFs'],
                  ['allowStickers', 'Stickers'],
                  ['allowPolls', 'Polls'],
                  ['allowEvents', 'Events'],
                  ['allowLocation', 'Location'],
                  ['allowReactions', 'Reactions'],
                  ['allowExternalLinks', 'External links']
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(content[key])}
                    onChange={() => toggleContent(key)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                </label>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3" data-testid="wizard-step-review">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                    style={{ backgroundColor: `${accentColor}33` }}
                  >
                    {emoji}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-900">{name.trim()}</div>
                    <div className="text-xs text-slate-500">
                      {visibility} · {effectiveJoinPolicy} · {messagingMode}
                    </div>
                  </div>
                </div>
                {description.trim() ? (
                  <p className="mt-3 text-sm text-slate-600">{description.trim()}</p>
                ) : null}
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  <li>Category: {category}</li>
                  <li>Language: {language || '—'}</li>
                  <li>Members to add: {memberIds.length}</li>
                  <li>
                    Content:{' '}
                    {Object.entries(content)
                      .filter(([, v]) => v)
                      .map(([k]) => k.replace('allow', ''))
                      .join(', ') || 'None'}
                  </li>
                </ul>
              </div>
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 text-indigo-500" />
                You become Owner. Existing DMs are unaffected. This creates a Messaging Group, not a
                Community group.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!canNext() || busy}
              data-testid="wizard-next"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!canNext() || busy}
              data-testid="wizard-create-submit"
              onClick={() => void submit()}
            >
              {busy ? 'Creating…' : 'Create group'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default GroupCreateWizard;
