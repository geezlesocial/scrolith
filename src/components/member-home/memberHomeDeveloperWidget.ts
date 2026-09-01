export const MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS = 10 * 60 * 1000;
export const MEMBER_HOME_DEVELOPER_WIDGET_SHOWN_AT_KEY =
  'scrolith:member-home:developer-widget:shown-at';
export const MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY =
  'scrolith:member-home:developer-widget:dismissed';

export type DeveloperWidgetStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DeveloperWidgetVisibility = {
  visible: boolean;
  remainingMs: number;
};

export const isMemberHomeDeveloperWidgetPath = (pathname: string) =>
  (String(pathname || '').replace(/\/+$/, '') || '/') === '/member-home';

export const getMemberHomeDeveloperWidgetVisibility = (
  storage: DeveloperWidgetStorage | null | undefined,
  now = Date.now()
): DeveloperWidgetVisibility => {
  if (!storage) return { visible: true, remainingMs: MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS };

  try {
    if (storage.getItem(MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY) === '1') {
      return { visible: false, remainingMs: 0 };
    }

    const storedShownAt = Number(storage.getItem(MEMBER_HOME_DEVELOPER_WIDGET_SHOWN_AT_KEY));
    const shownAt = Number.isFinite(storedShownAt) && storedShownAt > 0 ? storedShownAt : now;
    if (shownAt === now) {
      storage.setItem(MEMBER_HOME_DEVELOPER_WIDGET_SHOWN_AT_KEY, String(shownAt));
    }

    const remainingMs = MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS - Math.max(0, now - shownAt);
    if (remainingMs <= 0) {
      storage.setItem(MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY, '1');
      return { visible: false, remainingMs: 0 };
    }

    return { visible: true, remainingMs };
  } catch {
    // Storage can be unavailable in privacy-restricted WebViews. Keep the widget functional.
    return { visible: true, remainingMs: MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS };
  }
};
