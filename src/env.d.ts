interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_MOBILE_API_URL?: string;
  readonly VITE_MOBILE_API_BASE_URL?: string;
  readonly VITE_APP_DOMAIN?: string;
  readonly VITE_PUBLIC_APP_DOMAIN?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_SOCKET_TRANSPORTS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_GEMINI_KEY?: string;
  // Vite exposes a `PROD` boolean flag at build/runtime
  readonly PROD?: boolean;
  readonly NODE_ENV?: 'development' | 'production' | 'test';
  // Allow other VITE_ or custom env vars without needing to enumerate every one.
  [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
