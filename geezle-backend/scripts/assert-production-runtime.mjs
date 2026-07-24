/**
 * CI / pre-deploy assertion: API production Dockerfiles must not migrate-on-boot.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const targets = [
  path.resolve(__dirname, '../Dockerfile.storyfix.runtime'),
  path.resolve(__dirname, '../../deploy/docker/backend.Dockerfile')
];

const bad = [/migrate:apply/, /prisma\s+migrate\s+deploy/, /npm run migrate/];
const goodCmd = /CMD\s*\[\s*"node"\s*,\s*"dist\/server\.js"\s*\]/;

let failed = false;
for (const full of targets) {
  if (!fs.existsSync(full)) {
    console.error(`[assert-production-runtime] missing required file: ${full}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (bad.some((re) => re.test(text))) {
    console.error(`[assert-production-runtime] FAIL migrate-on-boot in ${full}`);
    failed = true;
  }
  if (!goodCmd.test(text)) {
    console.error(`[assert-production-runtime] FAIL expected CMD ["node","dist/server.js"] in ${full}`);
    failed = true;
  } else {
    console.log(`[assert-production-runtime] OK ${path.basename(full)}`);
  }
}

if (failed) process.exit(1);
console.log('[assert-production-runtime] OK — production API runtime entrypoints verified');
