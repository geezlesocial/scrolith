import fs from 'node:fs';

const input = process.argv[2];
if (!input) throw new Error('audit JSON path is required');
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
if (report.error) throw new Error(`npm audit failed: ${report.error.code || report.error.summary || 'registry error'}`);
const vulnerabilities = report.metadata?.vulnerabilities;
if (!vulnerabilities) throw new Error('npm audit response has no vulnerability metadata');
console.log(JSON.stringify(vulnerabilities));
for (const [name, advisory] of Object.entries(report.vulnerabilities || {})) {
  const via = Array.isArray(advisory.via) ? advisory.via : [];
  for (const item of via) {
    if (typeof item === 'object') {
      console.log(JSON.stringify({ package: name, severity: item.severity, range: item.range, fixAvailable: item.fixAvailable ?? null, url: item.url ?? null }));
    }
  }
}
