const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

(async () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const outDir = path.join(projectRoot, 'public');
    const outIco = path.join(outDir, 'favicon.ico');

    // Request PNG from the external avatar service (ensure we get a PNG)
    const avatarUrl = 'https://ui-avatars.com/api/?name=G&background=0D8ABC&color=fff&size=64&bold=true&format=png';
    const res = await fetch(avatarUrl);
    if (!res.ok) throw new Error(`Failed to fetch avatar: ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('png')) throw new Error(`Expected PNG from avatar service but got ${contentType}`);
    const arrayBuffer = await res.arrayBuffer();
    const pngBuffer = Buffer.from(arrayBuffer);

    const icoBuffer = await toIco([pngBuffer]);
    fs.writeFileSync(outIco, icoBuffer);
    console.log('Generated', outIco);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
