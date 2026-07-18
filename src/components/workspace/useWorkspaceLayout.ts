import React from 'react';

export type WorkspaceDensity = 'comfortable' | 'compact';

export type WorkspaceLayoutPrefs = {
  density: WorkspaceDensity;
  pinned: string[];
  hidden: string[];
  version: number;
};

const DEFAULT_PREFS: WorkspaceLayoutPrefs = {
  density: 'comfortable',
  pinned: [],
  hidden: [],
  version: 1
};

const storageKey = (role: string) => `scrolith.workspace.layout.v1.${role}`;

const readPrefs = (role: string): WorkspaceLayoutPrefs => {
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      density: parsed?.density === 'compact' ? 'compact' : 'comfortable',
      pinned: Array.isArray(parsed?.pinned) ? parsed.pinned.map(String) : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.map(String) : [],
      version: 1
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

/**
 * Client-side workspace layout preferences (density, pin, hide).
 * Cross-device sync can be added later via profile settings without breaking this API.
 */
export function useWorkspaceLayout(role: 'freelancer' | 'employer') {
  const [prefs, setPrefs] = React.useState<WorkspaceLayoutPrefs>(DEFAULT_PREFS);

  React.useEffect(() => {
    setPrefs(readPrefs(role));
  }, [role]);

  const persist = React.useCallback(
    (next: WorkspaceLayoutPrefs) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey(role), JSON.stringify(next));
      } catch {
        // ignore quota / private mode
      }
    },
    [role]
  );

  const setDensity = React.useCallback(
    (density: WorkspaceDensity) => {
      persist({ ...prefs, density });
    },
    [persist, prefs]
  );

  const togglePin = React.useCallback(
    (id: string) => {
      const pinned = prefs.pinned.includes(id)
        ? prefs.pinned.filter((entry) => entry !== id)
        : [...prefs.pinned, id];
      persist({ ...prefs, pinned });
    },
    [persist, prefs]
  );

  const toggleHidden = React.useCallback(
    (id: string) => {
      const hidden = prefs.hidden.includes(id)
        ? prefs.hidden.filter((entry) => entry !== id)
        : [...prefs.hidden, id];
      persist({ ...prefs, hidden });
    },
    [persist, prefs]
  );

  const reset = React.useCallback(() => {
    persist({ ...DEFAULT_PREFS });
  }, [persist]);

  return {
    prefs,
    density: prefs.density,
    setDensity,
    togglePin,
    toggleHidden,
    reset,
    isPinned: (id: string) => prefs.pinned.includes(id),
    isHidden: (id: string) => prefs.hidden.includes(id)
  };
}
