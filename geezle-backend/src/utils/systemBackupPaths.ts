import path from 'path';

const DEFAULT_SYSTEM_BACKUP_ROOT_DIR = path.resolve(__dirname, '../../data/system-backups');
const CLOUD_RUN_SYSTEM_BACKUP_ROOT_DIR = '/tmp/scrolith/system-backups';

const isProductionLikeRuntime = () =>
  Boolean(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT || process.env.NODE_ENV === 'production');

export const getSystemBackupRootDir = () => {
  const configuredDir = String(
    process.env.SYSTEM_BACKUP_DATA_DIR ||
      process.env.BACKUP_DATA_DIR ||
      process.env.SYSTEM_BACKUP_DIR ||
      ''
  )
    .trim();

  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  return isProductionLikeRuntime() ? CLOUD_RUN_SYSTEM_BACKUP_ROOT_DIR : DEFAULT_SYSTEM_BACKUP_ROOT_DIR;
};

export const getSystemBackupImportTempDir = () => path.join(getSystemBackupRootDir(), 'tmp-imports');
