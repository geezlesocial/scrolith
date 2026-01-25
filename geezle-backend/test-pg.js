const { Pool } = require('pg');

// Test with different connection strings
const connectionStrings = [
  'postgresql://geezle_user:223345Ib@localhost:5432/geezle_db',
  'postgresql://geezle_user:223345Ib%40@localhost:5432/geezle_db',
  'postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/geezle_db'
];

async function testConnection(connString, name) {
  console.log(`\nTesting: ${name}`);
  console.log(`Connection string: ${connString.replace(/:([^:]+)@/, ':*****@')}`);
  
  try {
    const pool = new Pool({ connectionString: connString });
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ Success!');
    console.log(`Database: ${result.rows[0].version}`);
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Testing PostgreSQL connections...\n');
  
  for (let i = 0; i < connectionStrings.length; i++) {
    await testConnection(connectionStrings[i], `Test ${i + 1}`);
  }
  
  console.log('\n========================================');
  console.log('If all tests fail, try these steps:');
  console.log('1. Make sure PostgreSQL service is running');
  console.log('2. Check if password contains special characters');
  console.log('3. Try connecting with pgAdmin or psql');
  console.log('========================================');
}

runTests();