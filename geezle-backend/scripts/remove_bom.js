const fs = require('fs');
const p = 'c:\\Projects\\geezle-backend\\prisma\\migrations\\20260124_add_social_notifications\\migration.sql';
const txt = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, txt, 'utf8');
console.log('rewritten');
