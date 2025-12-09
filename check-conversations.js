const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to database');

  // Search for Shraddha Singh with message count
  const shraddha = await client.query(
    `SELECT c.id, c.title, c.type, c."createdAt",
            (SELECT COUNT(*) FROM telegram_crm."Message" m WHERE m."conversationId" = c.id) as message_count
     FROM telegram_crm."Conversation" c
     WHERE LOWER(c.title) LIKE '%shraddha%' OR LOWER(c.title) LIKE '%singh%'`
  );
  console.log('\nSearching for Shraddha Singh:');
  console.log(shraddha.rows.length > 0 ? shraddha.rows : 'Not found');

  // Search for Mychal clickbank with message count
  const mychal = await client.query(
    `SELECT c.id, c.title, c.type, c."createdAt",
            (SELECT COUNT(*) FROM telegram_crm."Message" m WHERE m."conversationId" = c.id) as message_count
     FROM telegram_crm."Conversation" c
     WHERE LOWER(c.title) LIKE '%mychal%' OR LOWER(c.title) LIKE '%clickbank%'`
  );
  console.log('\nSearching for Mychal clickbank:');
  console.log(mychal.rows.length > 0 ? mychal.rows : 'Not found');

  // Get recent conversations created in last hour
  const recent = await client.query(
    `SELECT id, title, type, "createdAt" FROM telegram_crm."Conversation" WHERE "createdAt" > NOW() - INTERVAL '1 hour' ORDER BY "createdAt" DESC LIMIT 20`
  );
  console.log('\nRecently created conversations (last hour):');
  console.log(recent.rows);

  // Total count
  const total = await client.query(`SELECT COUNT(*) FROM telegram_crm."Conversation"`);
  console.log('\nTotal conversations:', total.rows[0].count);

  await client.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
