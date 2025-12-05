import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

dotenvConfig({ path: resolve(process.cwd(), '.env.local') });

async function testConnection() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID!);
  const apiHash = process.env.TELEGRAM_API_HASH!;
  const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER!;

  console.log('Testing with:');
  console.log(`API ID: ${apiId}`);
  console.log(`API Hash: ${apiHash?.substring(0, 8)}...`);
  console.log(`Phone: ${phoneNumber}`);
  console.log('');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  try {
    console.log('Attempting to connect and start...');

    // Add a delay before connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    await client.connect();
    console.log('✅ Connected!');

    // Add delay after connect
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Getting me...');
    const me = await client.getMe();
    console.log('✅ Successfully got user:', me);

    await client.disconnect();
    console.log('✅ Disconnected cleanly');
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

testConnection();
