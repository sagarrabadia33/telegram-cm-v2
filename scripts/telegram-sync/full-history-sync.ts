#!/usr/bin/env tsx
/**
 * ============================================
 * TELEGRAM FULL HISTORY SYNC
 * ============================================
 *
 * One-time script to sync complete Telegram history to PostgreSQL.
 *
 * Features:
 * - Fetches ALL contacts (users & groups)
 * - Fetches ALL conversations
 * - Fetches ALL messages with full history
 * - Downloads media files (photos, videos, documents)
 * - Progress tracking with resume capability
 * - Rate limiting to avoid Telegram bans
 * - Batch processing for optimal performance
 * - Error handling with detailed logging
 *
 * Usage:
 *   tsx scripts/telegram-sync/full-history-sync.ts
 *
 * Environment:
 *   Requires .env.local with TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE_NUMBER
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import input from 'input';

// Load environment
dotenvConfig({ path: resolve(process.cwd(), '.env.local') });

// Constants
const MEDIA_DIR = resolve(process.cwd(), 'public/media/telegram');
const PROGRESS_FILE = resolve(process.cwd(), 'scripts/telegram-sync/sync-progress.json');
const SKIPPED_CHATS = ['Ganeesham2 Residents']; // Chats to skip
const BATCH_SIZE = 50; // Messages per batch
const RATE_LIMIT_DELAY = 1000; // 1 second between API calls
const MESSAGE_FETCH_LIMIT = 100; // Messages per API call

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Progress tracker
interface SyncProgress {
  sessionString?: string;
  contactsCompleted: boolean;
  conversationsCompleted: boolean;
  processedDialogs: string[];
  currentDialog?: string;
  currentMessageOffset?: number;
  totalContacts: number;
  totalConversations: number;
  totalMessages: number;
  totalMedia: number;
  errors: Array<{ type: string; error: string; timestamp: string }>;
  startedAt: string;
  lastUpdatedAt: string;
}

let progress: SyncProgress = {
  contactsCompleted: false,
  conversationsCompleted: false,
  processedDialogs: [],
  totalContacts: 0,
  totalConversations: 0,
  totalMessages: 0,
  totalMedia: 0,
  errors: [],
  startedAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
};

// Helper functions
function loadProgress(): SyncProgress {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load progress:', error);
  }
  return progress;
}

function saveProgress() {
  try {
    progress.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error('Failed to save progress:', error);
  }
}

function logError(type: string, error: any) {
  const errorEntry = {
    type,
    error: error.message || String(error),
    timestamp: new Date().toISOString(),
  };
  progress.errors.push(errorEntry);
  console.error(`[ERROR] ${type}:`, error.message || error);
  saveProgress();
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMediaPath(mediaType: string, fileName: string): string {
  const typeDir = path.join(MEDIA_DIR, mediaType);
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }
  return path.join(typeDir, fileName);
}

function generateFileName(message: Api.Message, media: any): string {
  const timestamp = message.date;
  const messageId = message.id;
  const hash = crypto.createHash('md5').update(`${messageId}-${timestamp}`).digest('hex').substring(0, 8);

  let extension = 'bin';
  if (media instanceof Api.MessageMediaPhoto) {
    extension = 'jpg';
  } else if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      const attr = doc.attributes.find((a: any) => a.fileName);
      if (attr && 'fileName' in attr) {
        extension = attr.fileName.split('.').pop() || 'bin';
      }
    }
  }

  return `${hash}_${messageId}.${extension}`;
}

async function downloadMedia(
  client: TelegramClient,
  message: Api.Message,
): Promise<{ path: string; type: string; size: number } | null> {
  try {
    if (!message.media) return null;

    const media = message.media;
    let mediaType = 'other';

    if (media instanceof Api.MessageMediaPhoto) {
      mediaType = 'photos';
    } else if (media instanceof Api.MessageMediaDocument) {
      const doc = media.document;
      if (doc instanceof Api.Document) {
        if (doc.mimeType?.startsWith('video/')) {
          mediaType = 'videos';
        } else if (doc.mimeType?.startsWith('audio/')) {
          mediaType = 'audio';
        } else {
          mediaType = 'documents';
        }
      }
    } else if (media instanceof Api.MessageMediaContact) {
      return null; // Skip contacts
    } else if (media instanceof Api.MessageMediaGeo || media instanceof Api.MessageMediaVenue) {
      return null; // Skip location
    }

    const fileName = generateFileName(message, media);
    const filePath = getMediaPath(mediaType, fileName);

    // Download
    const buffer = await client.downloadMedia(message, {});
    if (buffer instanceof Buffer) {
      fs.writeFileSync(filePath, buffer);
      const relativePath = `/media/telegram/${mediaType}/${fileName}`;

      return {
        path: relativePath,
        type: mediaType,
        size: buffer.length,
      };
    }

    return null;
  } catch (error) {
    logError('media_download', error);
    return null;
  }
}

async function syncContacts(client: TelegramClient) {
  if (progress.contactsCompleted) {
    console.log('⏭️  Contacts already synced, skipping...');
    return;
  }

  console.log('📇 Syncing contacts...');

  try {
    const result = await client.invoke(new Api.contacts.GetContacts({ hash: 0 as any }));

    if (result instanceof Api.contacts.Contacts) {
      const users = result.users;

      for (const user of users) {
        if (!(user instanceof Api.User)) continue;

        try {
          // Create or update contact
          const contact = await prisma.contact.upsert({
            where: {
              primaryPhone: user.phone || `telegram_${user.id}`,
            },
            create: {
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
              displayName: user.firstName || user.username || `User ${user.id}`,
              primaryPhone: user.phone || `telegram_${user.id}`,
              bio: user.status ? String(user.status) : undefined,
              metadata: {
                telegramId: String(user.id),
                username: user.username,
                bot: user.bot,
                verified: user.verified,
                premium: user.premium,
              },
            },
            update: {
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
              displayName: user.firstName || user.username || `User ${user.id}`,
              bio: user.status ? String(user.status) : undefined,
              metadata: {
                telegramId: String(user.id),
                username: user.username,
                bot: user.bot,
                verified: user.verified,
                premium: user.premium,
              },
            },
          });

          // Create source identity
          await prisma.sourceIdentity.upsert({
            where: {
              source_externalId: {
                source: 'telegram',
                externalId: String(user.id),
              },
            },
            create: {
              contactId: contact.id,
              source: 'telegram',
              externalId: String(user.id),
              externalUsername: user.username || undefined,
              isPrimary: true,
              externalData: {
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                username: user.username,
                bot: user.bot,
              },
              lastSyncedAt: new Date(),
            },
            update: {
              externalUsername: user.username || undefined,
              externalData: {
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                username: user.username,
                bot: user.bot,
              },
              lastSyncedAt: new Date(),
            },
          });

          progress.totalContacts++;
        } catch (error) {
          logError(`contact_${user.id}`, error);
        }
      }
    }

    progress.contactsCompleted = true;
    saveProgress();
    console.log(`✅ Synced ${progress.totalContacts} contacts`);
  } catch (error) {
    logError('contacts_fetch', error);
    throw error;
  }
}

async function syncConversations(client: TelegramClient) {
  console.log('💬 Fetching all conversations...');

  try {
    const dialogs = await client.getDialogs({ limit: 500 });

    for (const dialog of dialogs) {
      try {
        const entity = dialog.entity;
        const chatTitle = dialog.title || dialog.name || 'Unknown';

        // Skip specific chats
        if (SKIPPED_CHATS.includes(chatTitle)) {
          console.log(`⏭️  Skipping: ${chatTitle}`);
          continue;
        }

        // Skip if already processed
        if (progress.processedDialogs.includes(String(dialog.id))) {
          console.log(`⏭️  Already processed: ${chatTitle}`);
          continue;
        }

        let chatType = 'private';
        let chatId = String(dialog.id);
        let username: string | undefined;
        let memberCount: number | undefined;

        if (entity instanceof Api.User) {
          chatType = 'private';
          username = entity.username;
        } else if (entity instanceof Api.Chat) {
          chatType = 'group';
          memberCount = entity.participantsCount;
        } else if (entity instanceof Api.Channel) {
          chatType = entity.broadcast ? 'channel' : 'supergroup';
          username = entity.username;
          memberCount = entity.participantsCount;
        }

        console.log(`\n📂 Processing: ${chatTitle} (${chatType})`);
        progress.currentDialog = chatTitle;
        saveProgress();

        // Find or create contact for private chats
        let contactId: string | undefined;
        if (chatType === 'private' && entity instanceof Api.User) {
          const contact = await prisma.contact.findFirst({
            where: {
              sourceIdentities: {
                some: {
                  source: 'telegram',
                  externalId: String(entity.id),
                },
              },
            },
          });
          contactId = contact?.id;
        }

        // Create conversation
        const conversation = await prisma.conversation.upsert({
          where: {
            source_externalChatId: {
              source: 'telegram',
              externalChatId: chatId,
            },
          },
          create: {
            contactId,
            source: 'telegram',
            externalChatId: chatId,
            type: chatType,
            title: chatTitle,
            lastMessageAt: dialog.date ? new Date(dialog.date * 1000) : undefined,
            lastSyncedAt: new Date(),
          },
          update: {
            title: chatTitle,
            lastMessageAt: dialog.date ? new Date(dialog.date * 1000) : undefined,
            lastSyncedAt: new Date(),
          },
        });

        // Create TelegramChat entry
        await prisma.telegramChat.upsert({
          where: {
            conversationId: conversation.id,
          },
          create: {
            conversationId: conversation.id,
            telegramChatId: chatId,
            type: chatType,
            title: chatTitle,
            username,
            memberCount,
            lastSyncedAt: new Date(),
          },
          update: {
            title: chatTitle,
            username,
            memberCount,
            lastSyncedAt: new Date(),
          },
        });

        // Sync messages for this conversation
        await syncMessagesForConversation(client, conversation.id, dialog, chatTitle);

        progress.processedDialogs.push(chatId);
        progress.totalConversations++;
        saveProgress();

        // Rate limiting
        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        logError(`conversation_${dialog.id}`, error);
      }
    }

    progress.conversationsCompleted = true;
    progress.currentDialog = undefined;
    saveProgress();
    console.log(`\n✅ Processed ${progress.totalConversations} conversations`);
  } catch (error) {
    logError('conversations_fetch', error);
    throw error;
  }
}

async function syncMessagesForConversation(
  client: TelegramClient,
  conversationId: string,
  dialog: any,
  chatTitle: string,
) {
  console.log(`  📨 Fetching messages...`);

  let offsetId = progress.currentMessageOffset || 0;
  let totalFetched = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const messages = await client.getMessages(dialog.entity, {
        limit: MESSAGE_FETCH_LIMIT,
        offsetId: offsetId,
      });

      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const message of messages) {
        if (!(message instanceof Api.Message)) continue;

        try {
          const isOutgoing = message.out;
          const messageDate = new Date(message.date * 1000);

          // Find contact if from user
          let messageContactId: string | undefined;
          if (message.fromId instanceof Api.PeerUser) {
            const userId = message.fromId.userId;
            const contact = await prisma.contact.findFirst({
              where: {
                sourceIdentities: {
                  some: {
                    source: 'telegram',
                    externalId: String(userId),
                  },
                },
              },
            });
            messageContactId = contact?.id;
          }

          // Download media
          let attachments = null;
          if (message.media) {
            const mediaInfo = await downloadMedia(client, message);
            if (mediaInfo) {
              attachments = {
                files: [mediaInfo],
              };
              progress.totalMedia++;
            }
          }

          // Store message
          await prisma.message.upsert({
            where: {
              source_externalMessageId: {
                source: 'telegram',
                externalMessageId: String(message.id),
              },
            },
            create: {
              conversationId,
              contactId: messageContactId,
              source: 'telegram',
              externalMessageId: String(message.id),
              direction: isOutgoing ? 'outbound' : 'inbound',
              contentType: message.media ? 'media' : 'text',
              body: message.message || undefined,
              sentAt: messageDate,
              hasAttachments: !!message.media,
              attachments,
              metadata: {
                views: message.views,
                forwards: message.forwards,
                replies: message.replies?.replies,
                editDate: message.editDate,
              },
            },
            update: {
              body: message.message || undefined,
              hasAttachments: !!message.media,
              attachments,
              metadata: {
                views: message.views,
                forwards: message.forwards,
                replies: message.replies?.replies,
                editDate: message.editDate,
              },
            },
          });

          progress.totalMessages++;
          totalFetched++;
        } catch (error) {
          logError(`message_${message.id}`, error);
        }
      }

      // Update progress
      offsetId = messages[messages.length - 1].id;
      progress.currentMessageOffset = offsetId;
      saveProgress();

      console.log(`    ↳ Fetched ${totalFetched} messages (offset: ${offsetId})`);

      // Rate limiting
      await delay(RATE_LIMIT_DELAY);
    } catch (error) {
      logError(`messages_fetch_${dialog.id}`, error);
      hasMore = false;
    }
  }

  // Update conversation with last message
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastSyncedAt: new Date(),
      syncStatus: 'completed',
    },
  });

  progress.currentMessageOffset = undefined;
  console.log(`  ✅ Completed: ${totalFetched} messages`);
}

async function saveSession(client: TelegramClient) {
  try {
    const sessionString = client.session.save();
    progress.sessionString = sessionString as any;

    // Save to database
    await prisma.telegramSession.upsert({
      where: { sessionType: 'full_sync' },
      create: {
        sessionType: 'full_sync',
        sessionString: sessionString as any,
        phoneNumber: process.env.TELEGRAM_PHONE_NUMBER!,
        isActive: true,
      },
      update: {
        sessionString: sessionString as any,
        isActive: true,
      },
    });

    saveProgress();
    console.log('💾 Session saved');
  } catch (error) {
    logError('session_save', error);
  }
}

async function main() {
  console.log('🚀 Starting Telegram Full History Sync\n');
  console.log('================================================');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log('================================================\n');

  // Ensure media directory exists
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  // Load existing progress
  progress = loadProgress();
  console.log('📊 Progress loaded:');
  console.log(`   Contacts: ${progress.contactsCompleted ? '✅' : '⏳'}`);
  console.log(`   Conversations: ${progress.conversationsCompleted ? '✅' : '⏳'}`);
  console.log(`   Processed dialogs: ${progress.processedDialogs.length}`);
  console.log(`   Total messages: ${progress.totalMessages}`);
  console.log(`   Total media: ${progress.totalMedia}\n`);

  // Initialize Telegram client
  const apiId = parseInt(process.env.TELEGRAM_API_ID!);
  const apiHash = process.env.TELEGRAM_API_HASH!;
  const phoneNumber = process.env.TELEGRAM_PHONE_NUMBER!;

  const sessionString = progress.sessionString || '';
  const stringSession = new StringSession(sessionString);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 10,
    retryDelay: 2000,
    requestRetries: 3,
    downloadRetries: 3,
    maxConcurrentDownloads: 1,
    autoReconnect: true,
  });

  try {
    console.log('🔐 Connecting to Telegram...\n');

    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => await input.text('Password (if 2FA enabled): '),
      phoneCode: async () => await input.text('Enter the code you received: '),
      onError: (err) => console.error('Auth error:', err),
    });

    console.log('✅ Connected to Telegram\n');

    // Save session immediately after successful connection
    await saveSession(client);

    // Execute sync steps
    if (!progress.contactsCompleted) {
      await syncContacts(client);
    }

    if (!progress.conversationsCompleted) {
      await syncConversations(client);
    }

    console.log('\n================================================');
    console.log('✅ SYNC COMPLETED SUCCESSFULLY');
    console.log('================================================');
    console.log(`📊 Final Stats:`);
    console.log(`   Contacts: ${progress.totalContacts}`);
    console.log(`   Conversations: ${progress.totalConversations}`);
    console.log(`   Messages: ${progress.totalMessages}`);
    console.log(`   Media files: ${progress.totalMedia}`);
    console.log(`   Errors: ${progress.errors.length}`);
    console.log(`   Duration: ${Math.floor((Date.now() - new Date(progress.startedAt).getTime()) / 1000 / 60)} minutes`);
    console.log('================================================\n');

    if (progress.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      progress.errors.slice(-10).forEach((err) => {
        console.log(`   ${err.timestamp}: ${err.type} - ${err.error}`);
      });
    }
  } catch (error) {
    logError('main_execution', error);
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await client.disconnect();
    await prisma.$disconnect();
    console.log('👋 Disconnected');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Received SIGINT, saving progress and exiting...');
  saveProgress();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⚠️  Received SIGTERM, saving progress and exiting...');
  saveProgress();
  await prisma.$disconnect();
  process.exit(0);
});

// Run
main();
