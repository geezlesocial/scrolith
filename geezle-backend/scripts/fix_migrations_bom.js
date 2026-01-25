const fs = require('fs');
const path = require('path');
const dir = 'c:\\Projects\\geezle-backend\\prisma\\migrations';
fs.readdirSync(dir).forEach(folder => {
  try {
    const p = path.join(dir, folder, 'migration.sql');
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      fs.writeFileSync(p, txt, 'utf8');
      console.log('fixed', p);
    }
  } catch (e) {
    // skip non-folders
  }
});
