"use client";
// Force rebuild - updated with robust timestamp parsing & error handling
import { useState, useEffect } from "react";
import {
  MessageSquare,
  Users,
  Settings,
  User,
  Bot,
  ArrowLeft,
  Phone,
  Search,
  MoreVertical,
  Check,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { formatMessageTime, formatMessageDate, validateMessageOrder } from "@/lib/utils/timestamp";
import { MessageErrorBoundary } from "@/components/MessageErrorBoundary";

interface Message {
  id: string;
  content: string | null;
  type: string;
  isOutgoing: boolean;
  sentAt: string;
  metadata: {
    mediaPath?: string;
    messageId?: number;
    views?: number;
    forwards?: number;
    reply_to?: string;
    edited?: string;
  } | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatarPath: string | null;
    isBot: boolean;
  } | null;
}

interface Conversation {
  id: string;
  telegramChatId: string;
  type: string;
  title: string | null;
  lastMessageAt: string | null;
  memberCount: number | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatarPath: string | null;
    isBot: boolean;
  } | null;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversationDetails();

    // Auto-refresh messages every 30 seconds
    const pollInterval = setInterval(() => {
      fetchConversationDetails(true); // Silent refresh (no loading state)
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [conversationId]);

  const fetchConversationDetails = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const [convRes, messagesRes] = await Promise.all([
        fetch(`/api/conversations/${conversationId}?t=${Date.now()}`, {
          cache: "no-store"
        }),
        fetch(`/api/conversations/${conversationId}/messages?limit=10000&t=${Date.now()}`, {
          cache: "no-store"
        }),
      ]);

      const convData = await convRes.json();
      const messagesData = await messagesRes.json();

      setConversation(convData.conversation);
      const fetchedMessages = messagesData.messages || [];

      // Validate message order (industry standard: WhatsApp, Signal, Telegram)
      if (fetchedMessages.length > 0) {
        validateMessageOrder(fetchedMessages);
      }

      setMessages(fetchedMessages);
    } catch (error) {
      console.error("Error fetching conversation:", error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const getDisplayName = (conv: Conversation | null) => {
    if (!conv) return "Unknown";
    if (conv.type === "private" && conv.contact) {
      const parts = [];
      if (conv.contact.firstName) parts.push(conv.contact.firstName);
      if (conv.contact.lastName) parts.push(conv.contact.lastName);
      if (parts.length === 0 && conv.contact.username) return `@${conv.contact.username}`;
      if (parts.length === 0) return "Unknown";
      return parts.join(" ");
    }
    return conv.title || "Unnamed Chat";
  };

  const getMessageSenderName = (message: Message) => {
    if (message.isOutgoing) return "You";
    if (!message.contact) return "Unknown";
    const parts = [];
    if (message.contact.firstName) parts.push(message.contact.firstName);
    if (message.contact.lastName) parts.push(message.contact.lastName);
    if (parts.length === 0 && message.contact.username) return `@${message.contact.username}`;
    return parts.length > 0 ? parts.join(" ") : "Unknown";
  };

  // Using industry-standard timestamp utilities
  // Handles both ISO strings (82%) and Unix timestamps (18%)
  const formatTime = formatMessageTime;
  const formatDate = formatMessageDate;

  // Group messages by date
  const groupMessagesByDate = () => {
    const groups: { [key: string]: Message[] } = {};
    messages.forEach((message) => {
      const date = new Date(message.sentAt).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    return groups;
  };

  const messageGroups = groupMessagesByDate();

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar - Conversations List */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between bg-white">
          <button
            onClick={() => router.push("/")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h2 className="text-base font-medium text-gray-900">Telegram CRM</h2>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Search className="h-5 w-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <MoreVertical className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-2 py-2 border-b border-gray-200">
          <a
            href="/conversations"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <MessageSquare className="h-5 w-5 text-[#0088cc]" />
            <span className="text-sm text-gray-700">All Conversations</span>
          </a>
          <a
            href="/contacts"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Users className="h-5 w-5 text-gray-500" />
            <span className="text-sm text-gray-700">Contacts</span>
          </a>
        </div>

        {/* Conversation Info */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 text-center text-sm text-gray-500">
            Viewing conversation
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-[#e7ebee]">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0088cc] border-r-transparent mb-4"></div>
              <p className="text-gray-600">Loading conversation...</p>
            </div>
          </div>
        ) : !conversation ? (
          <div className="flex-1 flex items-center justify-center bg-[#e7ebee]">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Conversation not found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between bg-white shadow-sm">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#6ab6f5] to-[#5da5e8] flex items-center justify-center text-white font-medium text-sm flex-shrink-0 overflow-hidden">
                  {conversation.type === "private" && conversation.contact?.avatarPath ? (
                    <img
                      src={conversation.contact.avatarPath}
                      alt={getDisplayName(conversation)}
                      className="h-full w-full object-cover"
                    />
                  ) : conversation.type === "private" && conversation.contact?.isBot ? (
                    <Bot className="h-5 w-5" />
                  ) : conversation.type === "private" ? (
                    <User className="h-5 w-5" />
                  ) : (
                    <Users className="h-5 w-5" />
                  )}
                </div>
                {/* Name and Status */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {getDisplayName(conversation)}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {conversation.type !== "private" && conversation.memberCount
                      ? `${conversation.memberCount} members`
                      : "last seen recently"}
                  </p>
                </div>
              </div>
              {/* Header Actions */}
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Search className="h-5 w-5 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Phone className="h-5 w-5 text-gray-600" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <MoreVertical className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Messages Area with Telegram Pattern Background */}
            <div className="flex-1 overflow-y-auto bg-[#ffffff] relative">
              {/* Subtle Pattern Background */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230088cc' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                backgroundSize: '60px 60px'
              }}></div>

              <div className="relative px-4 py-6 max-w-4xl mx-auto">
                <MessageErrorBoundary>
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">No messages yet</p>
                      <p className="text-gray-400 text-sm mt-1">
                        Messages from the last 30 days will appear here
                      </p>
                    </div>
                  ) : (
                    Object.keys(messageGroups).map((dateKey) => (
                    <div key={dateKey} className="mb-6">
                      {/* Date Separator */}
                      <div className="flex justify-center mb-4">
                        <div className="bg-white/90 backdrop-blur-sm shadow-sm rounded-full px-4 py-1 text-xs text-gray-600 font-medium border border-gray-200">
                          {formatDate(messageGroups[dateKey][0].sentAt)}
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="space-y-2">
                        {messageGroups[dateKey].map((message, idx) => (
                          <div
                            key={message.id}
                            className={`flex ${
                              message.isOutgoing ? "justify-end" : "justify-start"
                            } group`}
                          >
                            <div
                              className={`flex gap-2 max-w-[70%] ${
                                message.isOutgoing ? "flex-row-reverse" : "flex-row"
                              }`}
                            >
                              {/* Avatar - only show for incoming messages in groups */}
                              {!message.isOutgoing && conversation.type !== "private" && (
                                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6ab6f5] to-[#5da5e8] flex items-center justify-center text-white text-xs font-medium flex-shrink-0 overflow-hidden">
                                  {message.contact?.avatarPath ? (
                                    <img
                                      src={message.contact.avatarPath}
                                      alt={getMessageSenderName(message)}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : message.contact?.isBot ? (
                                    <Bot className="h-4 w-4" />
                                  ) : (
                                    <User className="h-4 w-4" />
                                  )}
                                </div>
                              )}

                              {/* Message Bubble */}
                              <div
                                className={`rounded-2xl px-4 py-2 shadow-sm ${
                                  message.isOutgoing
                                    ? "bg-[#effdde] rounded-tr-sm"
                                    : "bg-white rounded-tl-sm"
                                }`}
                              >
                                {/* Sender name for group chats (incoming only) */}
                                {!message.isOutgoing && conversation.type !== "private" && (
                                  <div className="text-xs font-medium text-[#0088cc] mb-1">
                                    {getMessageSenderName(message)}
                                  </div>
                                )}

                                {/* Media rendering */}
                                {message.metadata?.mediaPath && (
                                  <div className="mb-2">
                                    {message.type === "photo" && (
                                      <img
                                        src={message.metadata.mediaPath}
                                        alt="Photo"
                                        className="max-w-sm rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(message.metadata?.mediaPath, '_blank')}
                                      />
                                    )}
                                    {message.type === "video" && (
                                      <video
                                        src={message.metadata.mediaPath}
                                        controls
                                        className="max-w-sm rounded-lg"
                                      />
                                    )}
                                    {(message.type === "document" || message.type === "voice" || message.type === "audio") && (
                                      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                        <span className="text-xs">📎</span>
                                        <a
                                          href={message.metadata.mediaPath}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-[#0088cc] hover:underline"
                                        >
                                          {message.type === "voice" ? "Voice message" : message.type === "audio" ? "Audio file" : "Document"}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Message content */}
                                {message.content && (
                                  <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed">
                                    {message.content}
                                  </p>
                                )}
                                {!message.content && !message.metadata?.mediaPath && (
                                  <p className="text-sm text-gray-500 italic">
                                    [{message.type}]
                                  </p>
                                )}

                                {/* Time and status */}
                                <div
                                  className={`flex items-center gap-1 mt-1 ${
                                    message.isOutgoing ? "justify-end" : "justify-end"
                                  }`}
                                >
                                  <span className="text-[10px] text-gray-500">
                                    {formatTime(message.sentAt)}
                                  </span>
                                  {message.isOutgoing && (
                                    <Check className="h-3 w-3 text-[#4fae4e]" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                  )}
                </MessageErrorBoundary>
              </div>
            </div>

            {/* Message Input (disabled/read-only) */}
            <div className="border-t border-gray-200 px-4 py-3 bg-white">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-200">
                  <span className="text-sm text-gray-400 flex-1">
                    Message viewing only (read-only)
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
