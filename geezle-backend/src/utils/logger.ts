export const logger = {
  info: (...args: any[]) => console.log('[info]', ...args),
  warn: (...args: any[]) => console.warn('[warn]', ...args),
  error: (...args: any[]) => console.error('[error]', ...args),
  debug: (...args: any[]) => { if (process.env.NODE_ENV !== 'production') console.debug('[debug]', ...args); },
};

export default logger;
