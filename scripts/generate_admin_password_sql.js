// generate_admin_password_sql.js
// Usage:
//   cd Scrolith
//   npm install bcryptjs   # if not already installed
//   node scripts/generate_admin_password_sql.js "NewPassword123!"
// Output: SQL you can run in psql to update the admin user's password

const bcrypt = require('bcryptjs');
const password = process.argv[2] || 'newAdminPassword123';
const saltRounds = 10;
const hash = bcrypt.hashSync(password, saltRounds);

console.log('-- Copy the SQL output below and run it in your Postgres session (psql or DB GUI)');
console.log('');
console.log(`-- Generated for password: ${password}`);
console.log(`UPDATE "User" SET "password" = '${hash.replace(/'/g, "''")}' WHERE "email" = 'admin@Scrolith.com';`);
console.log('');
console.log('-- Note: ensure the project actually uses the "password" column and bcrypt hashes.');
console.log('-- If the project uses a different hashing library or field name, adapt accordingly.');

