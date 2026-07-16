const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

(async () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const outDir = path.join(projectRoot, 'public');
    const sourcePng = path.join(outDir, 'favicon.png');
    const outIco = path.join(outDir, 'favicon.ico');

    if (!fs.existsSync(sourcePng)) {
      throw new Error('public/favicon.png not found. Generate the PNG favicon from public/logo.png first.');
    }

    const pngBuffer = fs.readFileSync(sourcePng);
    const icoBuffer = await toIco([pngBuffer]);
    fs.writeFileSync(outIco, icoBuffer);
    console.log('Generated', outIco);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
