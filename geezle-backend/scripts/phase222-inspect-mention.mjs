import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `SELECT id, left(text, 80) AS text, metadata FROM "DirectMessage"
   WHERE "conversationId" = $1 ORDER BY "createdAt" DESC LIMIT 3`,
  [process.argv[2] || 'cmrsaynnl004as60185r6qjpg']
);
console.log(JSON.stringify(r.rows, null, 2));
const users = await c.query(
  `SELECT id, username FROM "User"
   WHERE username IS NOT NULL AND username !~ '@'
     AND length(username) BETWEEN 2 AND 40
   ORDER BY "updatedAt" DESC NULLS LAST
   LIMIT 5`
);
console.log('simple_usernames', JSON.stringify(users.rows));
await c.end();
