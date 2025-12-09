const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to database');

  // Check current lock
  const result = await client.query('SELECT * FROM telegram_crm."SyncLock" WHERE "lockType" = $1', ['listener']);
  console.log('Current lock:', result.rows);

  if (result.rows.length > 0) {
    // Delete the lock
    await client.query('DELETE FROM telegram_crm."SyncLock" WHERE "lockType" = $1', ['listener']);
    console.log('Lock released!');
  } else {
    console.log('No lock found');
  }

  await client.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
