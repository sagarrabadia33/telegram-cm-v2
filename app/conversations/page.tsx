"use client";
// Updated with robust timestamp parsing & message order validation
import { useState, useEffect, useRef } from "react";
import {
  Search,
  MessageSquare,
  Users,
  Settings,
  ChevronDown,
  Circle,
  Check,
  CheckCheck,
  Pin,
  Volume2,
  Bot,
  User,
  Sparkles,
  FileText,
  MessageCircle,
  RefreshCw,
  ChevronUp,
  Filter,
  Tag as TagIcon,
  Download
} from "lucide-react";
import { formatConversationTime, formatLastSeen, validateMessageOrder } from "@/lib/utils/timestamp";
import { MessageErrorBoundary } from "@/components/MessageErrorBoundary";
import { TagSelector } from "@/components/TagSelector";
import { ConversationTagSelector } from "@/components/ConversationTagSelector";
import { ConversationSummary } from "@/components/ConversationSummary";
import { Avatar } from "@/components/Avatar";

// Verify correct code is loaded
console.log("✅ Conversations page loaded - Build: Nov 19 with robust timestamp parsing");

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

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count?: {
    contacts: number;
    conversations: number;
  };
}

interface Conversation {
  id: string;
  telegramChatId: string;
  type: string;
  title: string | null;
  avatarPath: string | null;
  lastMessageAt: string | null;
  memberCount: number | null;
  needsReply: boolean;
  priorityScore: number;
  hasQuestion: boolean;
  summary: string | null;
  sentiment: string | null;
  intentLevel: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    isBot: boolean;
    avatarPath: string | null;
    isVip: boolean;
    isOnline: boolean;
    onlineStatus: string | null;
    lastSeenAt: string | null;
  } | null;
  lastMessage: {
    content: string | null;
    type: string;
    isOutgoing: boolean;
    sentAt: string;
  } | null;
  tags: Array<{
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  _count: {
    messages: number;
    members: number;
  };
}

type FilterType = "all" | "needs-attention" | "hot-leads" | "customers" | "vip";

const FILTERS = [
  { id: "all", label: "📁 All Chats", icon: "📁" },
  { id: "needs-attention", label: "🔔 Needs Attention", icon: "🔔" },
  { id: "hot-leads", label: "🔥 Hot Leads", icon: "🔥" },
  { id: "customers", label: "👤 Customers", icon: "👤" },
  { id: "vip", label: "⭐ VIP", icon: "⭐" },
] as const;

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterCounts, setFilterCounts] = useState({
    all: 0,
    "needs-attention": 0,
    "hot-leads": 0,
    customers: 0,
    vip: 0,
  });
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", type: "info", visible: false });

  // Tag filtering state
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [exportingContacts, setExportingContacts] = useState(false);
  const [exportingMembers, setExportingMembers] = useState(false);

  // Sync progress state (Slack/Telegram-style)
  const [syncProgress, setSyncProgress] = useState<{
    completed: number;
    total: number;
    messages: number;
  } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Resizable panels state (like Slack/Discord/VS Code)
  // Fix: Start with defaults to avoid hydration errors, then load from localStorage
  const [leftWidth, setLeftWidth] = useState<number>(336);
  const [rightWidth, setRightWidth] = useState<number>(420);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Load saved widths from localStorage after mount (avoid hydration errors)
  useEffect(() => {
    setIsMounted(true);
    const savedLeft = localStorage.getItem('telegram-crm-left-width');
    const savedRight = localStorage.getItem('telegram-crm-right-width');
    if (savedLeft) setLeftWidth(parseInt(savedLeft));
    if (savedRight) setRightWidth(parseInt(savedRight));
  }, []);

  useEffect(() => {
    fetchTags();
  }, []);

  // Handle left panel resize
  useEffect(() => {
    if (!isDraggingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(500, e.clientX));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      localStorage.setItem('telegram-crm-left-width', leftWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, leftWidth]);

  // Handle right panel resize
  useEffect(() => {
    if (!isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(350, Math.min(600, window.innerWidth - e.clientX));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingRight(false);
      localStorage.setItem('telegram-crm-right-width', rightWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRight, rightWidth]);

  useEffect(() => {
    fetchConversations();
  }, [selectedTags]);

  // Auto-refresh conversations every 30 seconds (silent mode - no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(true); // Silent refresh
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedTags]);

  useEffect(() => {
    applyFilters();
  }, [conversations, activeFilter, search]);

  useEffect(() => {
    if (selectedConversationId) {
      fetchConversationDetails(selectedConversationId);
      fetchMessages(selectedConversationId);
    }
  }, [selectedConversationId]);

  // Auto-refresh messages for selected conversation every 30 seconds
  useEffect(() => {
    if (!selectedConversationId) return;

    const interval = setInterval(() => {
      fetchMessages(selectedConversationId, true); // Silent refresh
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedConversationId]);

  // Toast helper function
  const showToast = (message: string, type: "success" | "error" | "info", autoDismiss: boolean = true) => {
    setToast({ message, type, visible: true });
    if (autoDismiss) {
      setTimeout(() => {
        setToast(prev => ({ ...prev, visible: false }));
      }, 4000);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const fetchConversations = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (selectedTags.length > 0) {
        params.set("tagIds", selectedTags.join(","));
      }
      // Add cache busting for auto-refresh
      params.set("t", Date.now().toString());
      const url = `/api/conversations?${params.toString()}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      setConversations(data.conversations || []);
      calculateFilterCounts(data.conversations || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const fetchConversationDetails = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      const data = await response.json();
      setSelectedConversation(data.conversation);
    } catch (error) {
      console.error("Error fetching conversation details:", error);
    }
  };

  const fetchMessages = async (conversationId: string, silent = false) => {
    if (!silent) {
      setLoadingMessages(true);
    }
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?limit=10000&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      const fetchedMessages = data.messages || [];

      // Validate message order (industry standard: WhatsApp, Signal, Telegram)
      if (fetchedMessages.length > 0) {
        validateMessageOrder(fetchedMessages);
      }

      setMessages(fetchedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  };

  const handleRefreshMessages = async () => {
    if (!selectedConversationId) return;

    // Exclude "Ganeesham2 Residents" from syncing
    const EXCLUDED_CONVERSATION_ID = "c1763467320368j369kbpuln"; // Ganeesham2 Residents
    if (selectedConversationId === EXCLUDED_CONVERSATION_ID) {
      showToast("Ganeesham2 Residents is excluded from syncing", "error", true);
      return;
    }

    setRefreshing(true);
    showToast("Syncing messages from Telegram...", "info", false); // Don't auto-dismiss

    try {
      // Trigger telegram sync for this conversation (incremental)
      const syncResponse = await fetch("/api/telegram/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConversationId }),
        cache: "no-store" // Prevent caching
      });

      if (!syncResponse.ok) {
        throw new Error(`Sync failed: ${syncResponse.statusText}`);
      }

      const syncResult = await syncResponse.json();
      console.log("Sync result:", syncResult);

      // Check if sync had errors (like excluded conversation)
      if (syncResult.errors && syncResult.errors.length > 0) {
        showToast(`Sync issue: ${syncResult.errors[0]}`, "error", true);
        return;
      }

      // Refetch messages and conversation details with cache busting
      const timestamp = Date.now();
      await Promise.all([
        fetch(`/api/conversations/${selectedConversationId}/messages?limit=10000&t=${timestamp}`, {
          cache: "no-store"
        }).then(res => res.json()).then(data => setMessages(data.messages || [])),
        fetch(`/api/conversations/${selectedConversationId}?t=${timestamp}`, {
          cache: "no-store"
        }).then(res => res.json()).then(data => setSelectedConversation(data.conversation))
      ]);

      // Show success message with count
      const count = syncResult.data?.messagesCount || 0;
      if (count > 0) {
        showToast(`✓ Synced ${count} new message${count !== 1 ? 's' : ''}`, "success", true);
      } else {
        showToast("✓ Already up to date - no new messages", "success", true);
      }
    } catch (error) {
      console.error("Error refreshing messages:", error);
      showToast(`✗ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error", true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleGlobalRefresh = async () => {
    setGlobalRefreshing(true);

    // Fetch initial progress before starting sync
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Get initial totals
      const initialRes = await fetch("/api/telegram/sync-progress");
      const initialData = await initialRes.json();
      if (initialData.success) {
        setSyncProgress({
          completed: 0,
          total: initialData.progress.total,
          messages: 0,
        });
      } else {
        setSyncProgress({ completed: 0, total: 0, messages: 0 });
      }
    } catch (error) {
      console.error("Error fetching initial progress:", error);
      setSyncProgress({ completed: 0, total: 0, messages: 0 });
    }

    // Start polling progress every 2 seconds (like Slack/Telegram)
    progressInterval = setInterval(async () => {
      try {
        const progressRes = await fetch("/api/telegram/sync-progress", {
          cache: "no-store"
        });
        const progressData = await progressRes.json();
        if (progressData.success) {
          setSyncProgress({
            completed: progressData.progress.completed,
            total: progressData.progress.total,
            messages: progressData.progress.messages,
          });
        }
      } catch (error) {
        console.error("Error fetching sync progress:", error);
      }
    }, 2000);

    try {
      // Trigger global sync for all conversations (incremental)
      const response = await fetch("/api/telegram/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // No conversationId = sync all
        cache: "no-store"
      });

      const result = await response.json();
      console.log("Global sync result:", result);

      // Stop polling
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      // Fetch final progress to show complete status
      try {
        const finalRes = await fetch("/api/telegram/sync-progress", {
          cache: "no-store"
        });
        const finalData = await finalRes.json();
        if (finalData.success) {
          setSyncProgress({
            completed: finalData.progress.completed,
            total: finalData.progress.total,
            messages: finalData.progress.messages,
          });
        }
      } catch (error) {
        console.error("Error fetching final progress:", error);
      }

      // Wait a moment to show 100% completion (like Slack does)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refetch conversations to update the list
      await fetchConversations();

      // If a conversation is currently selected, refresh its data too
      if (selectedConversationId) {
        await Promise.all([
          fetchMessages(selectedConversationId),
          fetchConversationDetails(selectedConversationId)
        ]);
      }

      // Update last sync time
      setLastSyncTime(new Date());

      // Show success message with details (like Telegram/Slack)
      if (result.success) {
        const totalMessages = result.data?.totalMessages || 0;
        const totalConvs = result.data?.conversationsProcessed || 0;
        showToast(
          totalMessages > 0
            ? `✓ Synced ${totalMessages} message${totalMessages !== 1 ? 's' : ''} from ${totalConvs} conversation${totalConvs !== 1 ? 's' : ''}`
            : "✓ All conversations are up to date",
          "success",
          true
        );
      } else {
        showToast("⚠ Sync completed with warnings", "info", true);
      }
    } catch (error) {
      console.error("Error during global refresh:", error);
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      showToast("✗ Failed to sync conversations. Please try again.", "error", true);
    } finally {
      setGlobalRefreshing(false);
      // Clear progress after a short delay (like Slack/Telegram)
      setTimeout(() => setSyncProgress(null), 1000);
    }
  };

  const handleExportContacts = async () => {
    setExportingContacts(true);
    try {
      // Build export URL with tag filters (if any)
      const params = new URLSearchParams();
      if (selectedTags.length > 0) {
        params.set('tags', selectedTags.join(','));
      }

      const url = `/api/contacts/export?${params.toString()}`;

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // Let the server set the filename
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success toast
      const filterText = selectedTags.length > 0
        ? `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}`
        : 'all contacts';
      showToast(`✓ Exporting ${filterText} to CSV...`, 'success', true);
    } catch (error) {
      console.error('Error exporting contacts:', error);
      showToast('✗ Failed to export contacts', 'error', true);
    } finally {
      setExportingContacts(false);
    }
  };

  const handleExportMembers = async () => {
    if (!selectedConversation) return;

    setExportingMembers(true);
    try {
      const url = `/api/conversations/${selectedConversation.id}/export-members`;

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // Let the server set the filename
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success toast
      const groupName = getDisplayName(selectedConversation);
      showToast(`✓ Exporting members from ${groupName}...`, 'success', true);
    } catch (error) {
      console.error('Error exporting members:', error);
      showToast('✗ Failed to export group members', 'error', true);
    } finally {
      setExportingMembers(false);
    }
  };

  const calculateFilterCounts = (convos: Conversation[]) => {
    const counts = {
      all: convos.length,
      "needs-attention": convos.filter((c) => c.needsReply || c.hasQuestion).length,
      "hot-leads": convos.filter((c) =>
        c.tags.some((t) => t.tag.name.includes("Hot Lead"))
      ).length,
      customers: convos.filter((c) =>
        c.tags.some((t) => t.tag.name.includes("Customer"))
      ).length,
      vip: convos.filter((c) => c.contact?.isVip).length,
    };
    setFilterCounts(counts);
  };

  const applyFilters = () => {
    let filtered = [...conversations];

    // Apply folder filter
    if (activeFilter === "needs-attention") {
      filtered = filtered.filter((c) => c.needsReply || c.hasQuestion);
    } else if (activeFilter === "hot-leads") {
      filtered = filtered.filter((c) =>
        c.tags.some((t) => t.tag.name.includes("Hot Lead"))
      );
    } else if (activeFilter === "customers") {
      filtered = filtered.filter((c) =>
        c.tags.some((t) => t.tag.name.includes("Customer"))
      );
    } else if (activeFilter === "vip") {
      filtered = filtered.filter((c) => c.contact?.isVip);
    }

    // Apply search filter
    if (search) {
      filtered = filtered.filter((c) => {
        const searchLower = search.toLowerCase();
        const name = getDisplayName(c).toLowerCase();
        const username = c.contact?.username?.toLowerCase() || "";
        const lastMessage = c.lastMessage?.content?.toLowerCase() || "";
        return (
          name.includes(searchLower) ||
          username.includes(searchLower) ||
          lastMessage.includes(searchLower)
        );
      });
    }

    // Sort by priority score, then by lastMessageAt
    filtered.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return dateB - dateA;
    });

    setFilteredConversations(filtered);
  };

  const getDisplayName = (conversation: Conversation) => {
    if (conversation.type !== "private" && conversation.title) {
      return conversation.title;
    }
    if (!conversation.contact) return "Unknown";

    const parts = [];
    if (conversation.contact.firstName) parts.push(conversation.contact.firstName);
    if (conversation.contact.lastName) parts.push(conversation.contact.lastName);
    if (parts.length === 0 && conversation.contact.username) {
      return `@${conversation.contact.username}`;
    }
    if (parts.length === 0) return "Unknown";
    return parts.join(" ");
  };

  // Get initials from name
  const getInitials = (name: string): string => {
    const words = name.split(" ").filter(word => word.length > 0);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  // Generate vibrant color based on name
  const getColorForName = (name: string): string => {
    const vibrantColors = [
      "#FF6B9D", // Pink
      "#C44569", // Dark Pink
      "#A55EEA", // Purple
      "#778BEB", // Blue Purple
      "#546DE5", // Royal Blue
      "#3867D6", // Deep Blue
      "#4BCFFA", // Sky Blue
      "#0FBCF9", // Light Blue
      "#00D8D6", // Cyan
      "#26DE81", // Green
      "#20BF6B", // Dark Green
      "#FED330", // Yellow
      "#F7B731", // Orange Yellow
      "#FD7272", // Coral
      "#FC5C65", // Red
      "#EB3B5A", // Dark Red
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % vibrantColors.length;
    return vibrantColors[index];
  };

  // Using industry-standard timestamp utilities
  // Handles both ISO strings (82%) and Unix timestamps (18%)
  const formatTime = formatConversationTime;

  const truncateMessage = (text: string | null, maxLength: number = 50) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Format message preview - handles text content and media types
  const formatMessagePreview = (message: { content: string | null; type: string } | null) => {
    if (!message) return "";

    // If there's text content, show it
    if (message.content) {
      return truncateMessage(message.content, 35);
    }

    // Otherwise show media type placeholder
    switch (message.type) {
      case "photo":
        return "📷 Photo";
      case "video":
        return "🎥 Video";
      case "document":
        return "📎 Document";
      case "voice":
        return "🎤 Voice message";
      case "audio":
        return "🎵 Audio";
      case "sticker":
        return "Sticker";
      case "animation":
        return "GIF";
      case "location":
        return "📍 Location";
      case "contact":
        return "👤 Contact";
      default:
        return message.type;
    }
  };

  const activeFilterLabel = FILTERS.find((f) => f.id === activeFilter)?.label || "📁 All Chats";

  // Format last sync time (like "just now", "2 minutes ago")
  const formatLastSyncTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 10) return "just now";
    if (diffSecs < 60) return `${diffSecs} seconds ago`;
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return date.toLocaleString();
  };

  return (
    <div className="flex h-screen bg-white select-none">
      {/* LEFT COLUMN - Chats List (Resizable like Slack/Discord) */}
      <div
        className="border-r border-gray-200 flex flex-col bg-white"
        style={{
          width: `${leftWidth}px`,
          minWidth: '280px',
          maxWidth: '500px',
          flex: 'none' // CRITICAL: Prevent flex from overriding width
        }}
      >
        {/* Header */}
        <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <a
              href="/contacts"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Contacts"
            >
              <Users className="h-5 w-5 text-gray-600" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${
                showTagFilter || selectedTags.length > 0 ? "bg-blue-50 text-[#0088cc]" : ""
              }`}
              title="Filter by tags"
            >
              <Filter className="h-5 w-5" />
            </button>

            <button
              onClick={handleExportContacts}
              disabled={exportingContacts}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title={selectedTags.length > 0 ? "Export filtered contacts" : "Export all contacts"}
            >
              <Download className={`h-5 w-5 text-gray-600 ${exportingContacts ? "opacity-50" : ""}`} />
            </button>

            <button
              onClick={handleGlobalRefresh}
              disabled={globalRefreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Sync all conversations"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${globalRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#2AABEE] transition-all"
            />
          </div>
        </div>

        {/* Sync Progress Indicator (Slack/Telegram style) */}
        {syncProgress && syncProgress.total > 0 && (
          <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center justify-between text-xs text-blue-900 mb-1">
              <span className="font-medium">
                Syncing conversations... {syncProgress.completed}/{syncProgress.total}
              </span>
              <span className="text-blue-700">
                {Math.round((syncProgress.completed / syncProgress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${(syncProgress.completed / syncProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Last Synced Indicator (when not syncing) */}
        {!syncProgress && lastSyncTime && (
          <div className="px-3 py-1.5 bg-green-50 border-b border-green-100 text-xs text-green-800 text-center">
            ✓ Last synced {formatLastSyncTime(lastSyncTime)}
          </div>
        )}

        {/* Tag Filter Panel */}
        {showTagFilter && (
          <div className="border-b border-gray-200 px-4 py-3 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Filter by Tags</h3>
                {selectedTags.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedTags.length} tag{selectedTags.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-[#0088cc] hover:text-[#006699] font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>

            {tags.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No tags available</p>
            ) : (
              <div className="space-y-1.5">
                {tags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag.id)
                            ? prev.filter(id => id !== tag.id)
                            : [...prev, tag.id]
                        );
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                        isSelected ? "bg-blue-50" : ""
                      }`}
                    >
                      {/* Checkbox indicator - matching tag selector design */}
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? "bg-[#0088cc] border-[#0088cc]"
                          : "border-gray-300"
                      }`}>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                        )}
                      </div>

                      {/* Tag badge */}
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold"
                        style={{
                          backgroundColor: tag.color || "#6b7280",
                          color: "#ffffff",
                        }}
                      >
                        {tag.name}
                      </span>

                      {/* Count badge - matching Slack/Notion design pattern */}
                      {tag._count && (
                        <span className="ml-auto text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">
                          {(tag._count.contacts || 0) + (tag._count.conversations || 0)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-3 border-solid border-[#2AABEE] border-r-transparent"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {search ? "No conversations found" : "No chats yet"}
              </p>
            </div>
          ) : (
            <div>
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`w-full px-3 py-2 hover:bg-[#f4f4f5] transition-colors cursor-pointer border-b border-gray-100 ${
                    selectedConversationId === conversation.id ? "bg-[#2AABEE]/10" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar - 50px circular */}
                    <div className="relative flex-shrink-0">
                      <div className="h-[50px] w-[50px]">
                        <Avatar
                          src={
                            (conversation.type !== "private" && conversation.avatarPath) ||
                            (conversation.type === "private" && conversation.contact?.avatarPath)
                              ? (conversation.type !== "private" ? conversation.avatarPath! : conversation.contact!.avatarPath!)
                              : null
                          }
                          alt={getDisplayName(conversation)}
                          fallbackType={conversation.type === "private" ? "initials" : "group-icon"}
                          initials={getInitials(getDisplayName(conversation))}
                          size="lg"
                          backgroundColor={
                            conversation.type === "private"
                              ? getColorForName(getDisplayName(conversation))
                              : "linear-gradient(to bottom right, #6ab6f5, #5da5e8)"
                          }
                        />
                      </div>
                      {/* VIP indicator */}
                      {conversation.contact?.isVip && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-[#f59e0b] border-2 border-white flex items-center justify-center">
                          <span className="text-xs">⭐</span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* First line: Name + Tags + Time */}
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {getDisplayName(conversation)}
                        </div>
                        {/* Tags beside contact name */}
                        {conversation.tags && conversation.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {conversation.tags.slice(0, 2).map((tagWrapper: any) => (
                              <span
                                key={tagWrapper.tag.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold shadow-sm"
                                style={{
                                  backgroundColor: tagWrapper.tag.color || "#6b7280",
                                  color: "#ffffff",
                                }}
                              >
                                {tagWrapper.tag.name}
                              </span>
                            ))}
                            {conversation.tags.length > 2 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-500 text-white shadow-sm">
                                +{conversation.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="ml-auto text-xs text-gray-500 flex-shrink-0">
                          {formatTime(conversation.lastMessageAt)}
                        </div>
                      </div>

                      {/* Second line: Last message preview */}
                      <div className="text-sm text-gray-500 truncate flex items-center gap-1">
                        {conversation.lastMessage?.isOutgoing && (
                          <CheckCheck className="h-3.5 w-3.5 text-[#2AABEE] flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {formatMessagePreview(conversation.lastMessage)}
                        </span>
                      </div>
                    </div>

                    {/* Status indicators - Only red dot */}
                    <div className="flex flex-col items-end justify-center flex-shrink-0">
                      {(conversation.needsReply || conversation.hasQuestion) && (
                        <div className="h-2 w-2 rounded-full bg-[#ef4444]"></div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* LEFT RESIZE HANDLE - Drag to resize left panel */}
      <div
        className={`w-1 hover:w-1.5 bg-transparent hover:bg-blue-400 cursor-col-resize transition-all ${
          isDraggingLeft ? 'bg-blue-500 w-1.5' : ''
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDraggingLeft(true);
        }}
        title="Drag to resize"
      />

      {/* CENTER COLUMN - Active Chat (calculated width to prevent pushing panels) */}
      <div
        className="flex flex-col bg-[#f4f4f5] select-text"
        style={{
          flex: '1 1 0%', // Allow flex but with minimum basis
          minWidth: 0, // CRITICAL: Allow shrinking below content size
          width: '100%' // Take remaining space
        }}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <Avatar
                  src={
                    (selectedConversation.type !== "private" && selectedConversation.avatarPath) ||
                    (selectedConversation.type === "private" && selectedConversation.contact?.avatarPath)
                      ? (selectedConversation.type !== "private" ? selectedConversation.avatarPath! : selectedConversation.contact!.avatarPath!)
                      : null
                  }
                  alt={getDisplayName(selectedConversation)}
                  fallbackType={selectedConversation.type === "private" ? "initials" : "group-icon"}
                  initials={getInitials(getDisplayName(selectedConversation))}
                  size="md"
                  backgroundColor={
                    selectedConversation.type === "private"
                      ? getColorForName(getDisplayName(selectedConversation))
                      : "linear-gradient(to bottom right, #6ab6f5, #5da5e8)"
                  }
                />
                <div>
                  <h3 className="font-semibold text-gray-900">{getDisplayName(selectedConversation)}</h3>
                  {/* Status/Info - Following Telegram/WhatsApp design pattern */}
                  {selectedConversation.type === "private" && selectedConversation.contact ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {selectedConversation.contact.isOnline ? (
                        <>
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-medium text-green-600">Active now</span>
                        </>
                      ) : selectedConversation.contact.lastSeenAt ? (
                        <span className="text-xs text-gray-500">
                          {formatLastSeen(selectedConversation.contact.lastSeenAt)}
                        </span>
                      ) : selectedConversation.contact.onlineStatus === 'recently' ? (
                        <span className="text-xs text-gray-500">Recently active</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedConversation.memberCount && selectedConversation.memberCount > 0
                        ? `${selectedConversation.memberCount.toLocaleString()} ${selectedConversation.memberCount === 1 ? 'member' : 'members'}`
                        : `${selectedConversation._count.messages} messages`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Tag Selector - Works for all conversations (private chats and groups) */}
                <ConversationTagSelector
                  conversationId={selectedConversation.id}
                  currentTags={selectedConversation.tags || []}
                  onTagsUpdated={(newTags) => {
                    setSelectedConversation({
                      ...selectedConversation,
                      tags: newTags
                    });
                    // Also update in conversations list
                    setConversations(prev =>
                      prev.map(c =>
                        c.id === selectedConversation.id
                          ? { ...c, tags: newTags }
                          : c
                      )
                    );
                  }}
                />

                {/* Export Members Button - Only for groups/supergroups/channels */}
                {['group', 'supergroup', 'channel'].includes(selectedConversation.type) && (
                  <button
                    onClick={handleExportMembers}
                    disabled={exportingMembers}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    title="Export group members"
                  >
                    <Download className={`h-5 w-5 text-gray-600 ${exportingMembers ? "opacity-50" : ""}`} />
                  </button>
                )}

                {/* Refresh Button */}
                <button
                  onClick={handleRefreshMessages}
                  disabled={refreshing}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh messages"
                >
                  <RefreshCw className={`h-5 w-5 text-gray-600 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* AI Summary Component - Visible by default */}
            <div className="border-b border-gray-200 px-6 py-4 bg-white">
              <ConversationSummary
                conversationId={selectedConversation.id}
                conversationTitle={getDisplayName(selectedConversation)}
                defaultExpanded={true}
              />
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-3">
              <MessageErrorBoundary>
                {loadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#2AABEE] border-r-transparent"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No messages yet</p>
                </div>
              ) : (
                [...messages].reverse().map((message, index, reversedArray) => {
                  const showDateSeparator = index === reversedArray.length - 1 ||
                    new Date(reversedArray[index + 1].sentAt).toDateString() !== new Date(message.sentAt).toDateString();

                  return (
                    <div key={message.id}>
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-4">
                          <div className="px-3 py-1 bg-white rounded-full text-xs text-gray-600 font-medium shadow-sm">
                            {new Date(message.sentAt).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })}
                          </div>
                        </div>
                      )}

                      <div className={`flex ${message.isOutgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] ${message.isOutgoing ? "order-2" : "order-1"}`}>
                          {/* Show sender name for incoming group messages (like WhatsApp/Telegram) */}
                          {!message.isOutgoing && selectedConversation?.type !== "private" && message.contact && (
                            <div className="flex items-center gap-2 mb-1 px-2">
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                                style={{ backgroundColor: getColorForName(
                                  message.contact.firstName || message.contact.username || "User"
                                ) }}
                              >
                                {getInitials(
                                  message.contact.firstName
                                    ? `${message.contact.firstName} ${message.contact.lastName || ""}`
                                    : message.contact.username || "?"
                                )}
                              </div>
                              <span
                                className="text-xs font-semibold"
                                style={{ color: getColorForName(
                                  message.contact.firstName || message.contact.username || "User"
                                ) }}
                              >
                                {message.contact.firstName || message.contact.username || "Unknown"}
                                {message.contact.isBot && " 🤖"}
                              </span>
                            </div>
                          )}
                          <div className={`rounded-2xl px-4 py-2 ${
                            message.isOutgoing
                              ? "bg-[#EFFDDE] rounded-br-sm"
                              : "bg-white rounded-bl-sm shadow-sm"
                          }`}>
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
                              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            )}
                            {!message.content && !message.metadata?.mediaPath && (
                              <p className="text-xs text-gray-500 italic">
                                [{message.type}]
                              </p>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 mt-1 px-2 ${message.isOutgoing ? "justify-end" : "justify-start"}`}>
                            <span className="text-xs text-gray-500">
                              {new Date(message.sentAt).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit"
                              })}
                            </span>
                            {message.isOutgoing && (
                              <CheckCheck className="h-3.5 w-3.5 text-[#2AABEE]" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
              </MessageErrorBoundary>
            </div>
          </>
        ) : (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="max-w-md text-center">
              <div className="h-32 w-32 rounded-full bg-gradient-to-br from-[#6ab6f5] to-[#5da5e8] flex items-center justify-center text-white mx-auto mb-6">
                <MessageSquare className="h-16 w-16" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Telegram CRM
              </h2>
              <p className="text-gray-500 mb-6">
                Select a chat to start viewing messages and AI insights
              </p>
              <div className="flex flex-col gap-2 text-sm text-gray-400">
                <div className="flex items-center gap-2 justify-center">
                  <Circle className="h-4 w-4" />
                  <span>Smart filters and priority scoring</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Circle className="h-4 w-4" />
                  <span>AI-powered conversation summaries</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Circle className="h-4 w-4" />
                  <span>Automated follow-up tracking</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT RESIZE HANDLE - Drag to resize right panel */}
      <div
        className={`w-1 hover:w-1.5 bg-transparent hover:bg-blue-400 cursor-col-resize transition-all ${
          isDraggingRight ? 'bg-blue-500 w-1.5' : ''
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDraggingRight(true);
        }}
        title="Drag to resize"
      />

      {/* RIGHT COLUMN - AI Assistant (Resizable like Slack/Discord) */}
      <div
        className="border-l border-gray-200 flex flex-col bg-white"
        style={{
          width: `${rightWidth}px`,
          minWidth: '350px',
          maxWidth: '600px',
          flex: 'none' // CRITICAL: Prevent flex from overriding width
        }}
      >
        {/* Tabs */}
        <div className="h-12 border-b border-gray-200 px-4 flex items-center gap-1 flex-shrink-0">
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#2AABEE] border-b-2 border-[#2AABEE] -mb-[1px]">
            <Sparkles className="h-4 w-4" />
            Chat
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            <FileText className="h-4 w-4" />
            Research
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            <MessageCircle className="h-4 w-4" />
            Draft
          </button>
        </div>

        {/* AI Assistant Content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white mx-auto mb-4">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              AI Assistant
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Get instant insights, research contacts, and draft messages with AI
            </p>
            {selectedConversationId && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left">
                <p className="text-xs text-gray-600 mb-2">Quick Actions:</p>
                <div className="space-y-1">
                  <button className="w-full text-left px-2 py-1 text-xs text-[#2AABEE] hover:bg-blue-100 rounded">
                    Summarize conversation
                  </button>
                  <button className="w-full text-left px-2 py-1 text-xs text-[#2AABEE] hover:bg-blue-100 rounded">
                    Draft a response
                  </button>
                  <button className="w-full text-left px-2 py-1 text-xs text-[#2AABEE] hover:bg-blue-100 rounded">
                    Research contact
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.visible && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md transition-all ${
            toast.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : toast.type === "error"
              ? "bg-red-50 border border-red-200 text-red-800"
              : "bg-blue-50 border border-blue-200 text-blue-800"
          }`}
        >
          {toast.type === "success" && (
            <CheckCheck className="h-5 w-5 flex-shrink-0" />
          )}
          {toast.type === "error" && (
            <Circle className="h-5 w-5 flex-shrink-0" />
          )}
          {toast.type === "info" && (
            <RefreshCw className="h-5 w-5 flex-shrink-0 animate-spin" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
