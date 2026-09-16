import React from 'react';
import { ChevronRight, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import {
  getRememberedProfiles,
  initialsForRememberedProfile,
  removeRememberedProfile,
  type RememberedProfile
} from '../../services/rememberedProfiles';

type Props = {
  compact?: boolean;
  onContinue: (profile: RememberedProfile) => void;
  onUseAnother: () => void;
};

export const RememberedProfilesPanel: React.FC<Props> = ({ compact = false, onContinue, onUseAnother }) => {
  const [profiles, setProfiles] = React.useState<RememberedProfile[]>([]);

  const refresh = React.useCallback(() => setProfiles(getRememberedProfiles()), []);
  React.useEffect(() => {
    refresh();
    window.addEventListener('scrolith:remembered-profiles-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('scrolith:remembered-profiles-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  if (!profiles.length) return null;

  const remove = (event: React.MouseEvent, userId: string) => {
    event.preventDefault();
    event.stopPropagation();
    removeRememberedProfile(userId);
    refresh();
  };

  return (
    <section
      aria-labelledby="remembered-profiles-title"
      className={`rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50/70 ${compact ? 'p-3' : 'p-4'}`}
      data-testid="remembered-profiles-panel"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-600 p-2 text-white shadow-sm" aria-hidden="true">
          <UsersRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="remembered-profiles-title" className="text-sm font-bold text-slate-950">Welcome back</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">Continue securely with a profile used on this device.</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {profiles.map((profile) => (
          <div key={profile.userId} className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/85 p-2.5 shadow-sm">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-blue-100 text-center text-sm font-bold leading-10 text-blue-800">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : initialsForRememberedProfile(profile)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{profile.displayName}</p>
              <p className="flex items-center gap-1 text-[11px] text-slate-500"><ShieldCheck className="h-3 w-3 text-blue-600" /> Private device memory</p>
            </div>
            <button
              type="button"
              onClick={() => onContinue(profile)}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={`Continue as ${profile.displayName}`}
            >
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => remove(event, profile.userId)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label={`Remove ${profile.displayName} from this device`}
              title="Remove from this device"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onUseAnother}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-800 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <UserRound className="h-4 w-4" /> Use another profile
      </button>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Only your name, photo, and a device-only identity reference are remembered. Passwords and tokens are never stored here.</p>
    </section>
  );
};

export default RememberedProfilesPanel;
