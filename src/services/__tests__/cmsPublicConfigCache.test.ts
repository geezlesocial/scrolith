import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CMSService, __cmsPublicConfigTestHooks } from '../cms';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

const getRequestedUrls = () =>
  (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));

const createStorageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
};

describe('CMS public config request caching and throttling', () => {
  beforeEach(() => {
    __cmsPublicConfigTestHooks.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createStorageStub());
    vi.stubGlobal('sessionStorage', createStorageStub());
    if (typeof localStorage !== 'undefined') localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  test('multiple activity config consumers share one in-flight request', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pendingFetch);
    vi.stubGlobal('fetch', fetchMock);

    const first = CMSService.getActivityConfig();
    const second = CMSService.getActivityConfig();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(jsonResponse({ icons: [{ id: 'messages', type: 'messages' }], helpMenu: [] }));

    await expect(first).resolves.toMatchObject({ icons: [{ id: 'messages', type: 'messages' }] });
    await expect(second).resolves.toMatchObject({ icons: [{ id: 'messages', type: 'messages' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('429 responses use fallback and do not retry immediately during Retry-After cooldown', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          { success: false, code: 'RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await CMSService.getActivityConfig();
    const second = await CMSService.getActivityConfig();

    expect(first).toMatchObject({ icons: [], helpMenu: [] });
    expect(second).toMatchObject({ icons: [], helpMenu: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__cmsPublicConfigTestHooks.snapshot()[0]?.retryAfterUntil).toBeGreaterThan(Date.now());
  });

  test('guest header fallback never calls admin platform settings and remains bounded', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/cms/header')) {
        return Promise.resolve(jsonResponse({ error: 'temporarily unavailable' }, { status: 500 }));
      }
      if (url.includes('/cms/homepage')) {
        return Promise.resolve(jsonResponse({ success: false, code: 'RATE_LIMITED' }, { status: 429 }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await CMSService.getHeaderConfig();
    await CMSService.getHeaderConfig();

    const urls = getRequestedUrls();
    expect(urls.filter((url) => url.includes('/cms/header'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/cms/homepage'))).toHaveLength(1);
    expect(urls.some((url) => url.includes('/admin/platform/settings'))).toBe(false);
  });

  test('platform settings callers share one cached public request', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          siteName: 'Scrolith',
          tagline: 'Enterprise social commerce'
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const [settings, publicSettings] = await Promise.all([
      CMSService.getSettings(),
      CMSService.getPublicPlatformSettings()
    ]);

    expect(settings.siteName).toBe('Scrolith');
    expect(publicSettings.siteName).toBe('Scrolith');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getRequestedUrls()[0]).toContain('/cms/platform-settings');
  });
});
