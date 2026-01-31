const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

(async () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const svgPath = path.join(projectRoot, 'public', 'favicon.svg');
    const outDir = path.join(projectRoot, 'public');
    if (!fs.existsSync(svgPath)) {
      console.error('public/favicon.svg not found');
      process.exit(1);
    }

    const sizes = [16, 32, 48, 64, 128];
    const pngPaths = [];

    for (const s of sizes) {
      const pngPath = path.join(outDir, `favicon-${s}.png`);
      await sharp(svgPath)
        .resize(s, s, { fit: 'contain' })
        .png()
        .toFile(pngPath);
      pngPaths.push(pngPath);
    }

    const buffer = await pngToIco(pngPaths);
    const outIco = path.join(outDir, 'favicon.ico');
    fs.writeFileSync(outIco, buffer);
    console.log('Generated', outIco);

    // cleanup intermediate PNGs
    for (const p of pngPaths) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
