const truthy = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

export const runtimePolicy = {
  isTest:
    process.env.NODE_ENV === 'test' ||
    process.env.APP_RUNTIME === 'test' ||
    Boolean(process.env.JEST_WORKER_ID),
  backgroundWorkersEnabled:
    process.env.NODE_ENV !== 'test' &&
    process.env.APP_RUNTIME !== 'test' &&
    !process.env.JEST_WORKER_ID &&
    !truthy(process.env.DISABLE_BACKGROUND_WORKERS)
};

export const assertSafeTestDatabaseUrl = (databaseUrl = process.env.DATABASE_URL) => {
  const value = String(databaseUrl || '');
  if (!runtimePolicy.isTest) {
    throw new Error('Refusing to operate on test database when NODE_ENV/APP_RUNTIME is not test.');
  }
  if (!value.includes('scrolith_test') || !value.includes('127.0.0.1:55432')) {
    throw new Error('Refusing to reset or prepare a non-isolated test database.');
  }
  return value;
};
