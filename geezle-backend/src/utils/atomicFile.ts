import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Writes a file through an exclusive same-directory temporary file and an
 * atomic rename. This prevents readers from observing partial JSON/binary
 * content during fallback persistence and backup writes.
 */
export const writeFileAtomicallySync = (filePath: string, data: string | Buffer): void => {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(temporaryPath, data, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Cleanup is best-effort; preserve the original failure.
    }
    throw error;
  }
};
