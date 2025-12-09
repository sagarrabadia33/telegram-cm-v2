export interface ConversationTag {
  id: string;
  name: string;
  color: string | null;
}

export interface Conversation {
  id: string;
  externalChatId: string;
  name: string;
  avatar: string; // Initials fallback
  avatarUrl?: string | null; // Actual image URL if available
  type: 'private' | 'group' | 'supergroup'; // Chat type like Telegram
  lastMessage: string;
  lastMessageDirection: 'inbound' | 'outbound';
  time: string;
  unread: number;
  online: boolean;
  lastSeenAt: string | null;
  phone: string;
  email: string;
  firstContact: string;
  totalMessages: number;
  memberCount?: number | null; // For groups/supergroups
  tags?: ConversationTag[]; // Tags assigned to conversation
  lastSyncedAt?: string | null; // When this conversation was last synced
}

export interface Message {
  id: string;
  text: string;
  sent: boolean;
  time: string;
  deliveredAt: string | null;
  readAt: string | null;
  status: string | null;
  contentType: string;
  media?: { type: string; url: string; name?: string; mimeType?: string }[] | null;
  sender?: {
    id: string;
    name: string;
    initials: string;
  } | null;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  firstContact: string;
  totalMessages: number;
  online: boolean;
  lastSeenAt: string | null;
}
