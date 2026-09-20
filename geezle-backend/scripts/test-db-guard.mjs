const url = String(process.env.DATABASE_URL || '');
const testDbKind = String(process.env.TEST_DB_KIND || '').trim().toLowerCase();
const testDbProject = String(process.env.TEST_DB_PROJECT || '').trim().toLowerCase();
const testDbInstance = String(process.env.TEST_DB_INSTANCE || '').trim().toLowerCase();
const testDbName = String(process.env.TEST_DB_NAME || '').trim().toLowerCase();

if (process.env.NODE_ENV !== 'test' && process.env.APP_RUNTIME !== 'test') {
  throw new Error('Refusing test database operation outside NODE_ENV=test or APP_RUNTIME=test.');
}

if (process.env.DISABLE_BACKGROUND_WORKERS !== 'true') {
  throw new Error('Refusing database tests unless DISABLE_BACKGROUND_WORKERS=true.');
}

const lowerUrl = url.toLowerCase();
const productionMarkers = [
  'scrolith-postgres-prod',
  'scrolith-500821:asia-southeast1:scrolith-postgres-prod'
];

if (productionMarkers.some((marker) => lowerUrl.includes(marker))) {
  throw new Error('Refusing to run database tests: DATABASE_URL appears to reference production infrastructure.');
}

let parsedDatabaseName = '';
try {
  parsedDatabaseName = new URL(url).pathname.replace(/^\/+/, '').toLowerCase();
} catch {
  throw new Error('Refusing database tests: DATABASE_URL is not parseable.');
}

if (parsedDatabaseName === 'scrolith') {
  throw new Error('Refusing to run database tests: DATABASE_URL appears to reference production infrastructure.');
}

if (testDbProject && testDbProject !== 'cloudbuild-ephemeral' && testDbProject.includes('scrolith-500821')) {
  throw new Error('Refusing to run database tests: TEST_DB_PROJECT is not non-production.');
}

if (!testDbName.includes('test') || !lowerUrl.includes('scrolith_test')) {
  throw new Error('Refusing database tests unless database name is explicitly test-only.');
}

if (testDbKind === 'local-postgres') {
  if (!lowerUrl.includes('127.0.0.1:55432') || testDbInstance !== 'local-postgres-test') {
    throw new Error('Refusing local database tests without isolated local postgres marker.');
  }
} else if (testDbKind === 'cloudbuild-postgres') {
  const approvedCiHost = lowerUrl.includes('@postgres-test:5432/') || lowerUrl.includes('@127.0.0.1:5432/');
  if (!approvedCiHost || testDbProject !== 'cloudbuild-ephemeral' || testDbInstance !== 'cloudbuild-ephemeral-postgres-test') {
    throw new Error('Refusing Cloud Build database tests without ephemeral postgres markers.');
  }
} else {
  throw new Error('Refusing database tests without approved TEST_DB_KIND.');
}

console.log('Test database guard passed.');
