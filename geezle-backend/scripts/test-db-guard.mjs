const url = String(process.env.DATABASE_URL || '');

if (process.env.NODE_ENV !== 'test' && process.env.APP_RUNTIME !== 'test') {
  throw new Error('Refusing test database operation outside NODE_ENV=test or APP_RUNTIME=test.');
}

if (!url.includes('scrolith_test') || !url.includes('127.0.0.1:55432')) {
  throw new Error('Refusing test database operation without isolated local scrolith_test DATABASE_URL.');
}

console.log('Test database guard passed.');
