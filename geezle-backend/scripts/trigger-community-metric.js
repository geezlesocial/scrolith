const prisma = require('../dist/utils/prismaClient') || require('../src/utils/prismaClient');
const http = require('http');

async function findPostId() {
  try {
    const p = await prisma.communityPost.findFirst();
    return p ? p.id : null;
  } catch (e) {
    console.error('Prisma read error:', e);
    return null;
  }
}

async function postMetric(postId, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: `/api/community/posts/${postId}/${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-dev-role': 'freelancer'
      }
    };
    const req = http.request(options, (res) => {
      let resp = '';
      res.on('data', (chunk) => resp += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: resp }));
    });
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function main() {
  const postId = await findPostId();
  if (!postId) {
    console.error('No community post found in DB');
    process.exit(1);
  }
  console.log('Using post id:', postId);
  const r1 = await postMetric(postId, 'view', { sessionHash: `smoke-${Date.now()}` });
  console.log('View result', r1.status, r1.body);
  const r2 = await postMetric(postId, 'like', {});
  console.log('Like result', r2.status, r2.body);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
