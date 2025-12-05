"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagSelector } from "@/components/TagSelector";
import {
  Search,
  Users,
  Phone,
  MessageSquare,
  Mail,
  User,
  Bot,
  Settings,
  Menu,
  MoreVertical,
  Filter,
  ArrowUpDown,
} from "lucide-react";

interface Contact {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  isBot: boolean;
  avatarPath: string | null;
  lastActivity: string | null;
  tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
  _count: {
    messages: number;
  };
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count: {
    contacts: number;
  };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Tag filtering state
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Fetch tags on mount
  useEffect(() => {
    fetchTags();
  }, []);

  // Reset and fetch from beginning when search or tag filter changes
  useEffect(() => {
    setContacts([]);
    setOffset(0);
    fetchContacts(0, true);
  }, [search, selectedTags]);

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const fetchContacts = async (currentOffset: number = offset, reset: boolean = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTags.length > 0) params.set("tagIds", selectedTags.join(","));
      params.set("limit", limit.toString());
      params.set("offset", currentOffset.toString());

      const response = await fetch(`/api/contacts?${params}`);
      const data = await response.json();

      if (reset) {
        setContacts(data.contacts || []);
      } else {
        setContacts(prev => [...prev, ...(data.contacts || [])]);
      }
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const toggleTagFilter = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const clearTagFilters = () => {
    setSelectedTags([]);
  };

  const handleLoadMore = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
    fetchContacts(newOffset, false);
  };

  const getDisplayName = (contact: Contact) => {
    const parts = [];
    if (contact.firstName) parts.push(contact.firstName);
    if (contact.lastName) parts.push(contact.lastName);
    if (parts.length === 0 && contact.username) return `@${contact.username}`;
    if (parts.length === 0) return "Unknown";
    return parts.join(" ");
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";

    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInMs = now.getTime() - date.getTime();
      const diffInSeconds = Math.floor(diffInMs / 1000);

      // Handle invalid dates
      if (isNaN(diffInSeconds)) return "Unknown";

      // Handle future dates (shouldn't happen but just in case)
      if (diffInSeconds < 0) return "Just now";

      // Format relative time
      if (diffInSeconds < 60) return "Just now";
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
      if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w ago`;
      if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
      return `${Math.floor(diffInSeconds / 31536000)}y ago`;
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return "Unknown";
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar - Contact Stats */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between bg-white flex-shrink-0">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu className="h-5 w-5 text-gray-600" />
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 px-3 flex-shrink-0">
          <a
            href="/conversations"
            className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <MessageSquare className="h-4 w-4" />
            Chats
          </a>
          <a
            href="/contacts"
            className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-[#0088cc] border-b-2 border-[#0088cc]"
          >
            <Users className="h-4 w-4" />
            Contacts
          </a>
        </div>

        {/* Stats Cards */}
        <div className="p-4 space-y-3 flex-shrink-0">
          <div className="bg-gradient-to-br from-[#0088cc] to-[#006699] rounded-xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm opacity-90">Total Contacts</span>
              <Users className="h-5 w-5 opacity-75" />
            </div>
            <div className="text-3xl font-bold">{total}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">With Phone</span>
              <Phone className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-semibold text-gray-900">
              {contacts.filter((c) => c.phoneNumber).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {total > 0
                ? Math.round((contacts.filter((c) => c.phoneNumber).length / total) * 100)
                : 0}
              % of total
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">With Username</span>
              <Mail className="h-4 w-4 text-purple-600" />
            </div>
            <div className="text-2xl font-semibold text-gray-900">
              {contacts.filter((c) => c.username).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {total > 0
                ? Math.round((contacts.filter((c) => c.username).length / total) * 100)
                : 0}
              % of total
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <a
            href="/"
            className="w-full px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-gray-200 flex items-center justify-center gap-2"
          >
            Dashboard
          </a>
        </div>
      </div>

      {/* Main Content - Contacts Table/List */}
      <div className="flex-1 flex flex-col">
        {/* Search Header */}
        <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts by name, username, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0088cc] transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${
                showTagFilter || selectedTags.length > 0 ? "bg-blue-50 text-[#0088cc]" : ""
              }`}
            >
              <Filter className="h-5 w-5" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowUpDown className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Tag Filter Panel */}
        {showTagFilter && (
          <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Filter by Tags</h3>
              {selectedTags.length > 0 && (
                <button
                  onClick={clearTagFilters}
                  className="text-xs text-[#0088cc] hover:text-[#006699] font-medium"
                >
                  Clear all ({selectedTags.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTagFilter(tag.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isSelected
                        ? "ring-2 ring-[#0088cc] ring-offset-1"
                        : "hover:ring-1 hover:ring-gray-300"
                    }`}
                    style={{
                      backgroundColor: tag.color ? `${tag.color}${isSelected ? "" : "20"}` : "#f3f4f6",
                      color: tag.color || "#6b7280",
                    }}
                  >
                    {tag.name}
                    <span className="text-xs opacity-75">
                      {tag._count.contacts}
                    </span>
                  </button>
                );
              })}
              {tags.length === 0 && (
                <p className="text-sm text-gray-500">No tags available</p>
              )}
            </div>
          </div>
        )}

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0088cc] border-r-transparent"></div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No contacts found</p>
              <p className="text-gray-400 text-sm mt-1">
                {search ? "Try a different search term" : "Sync your Telegram data to see contacts"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0">
                <div className="col-span-3">Contact</div>
                <div className="col-span-2">Contact Info</div>
                <div className="col-span-2">Last Active</div>
                <div className="col-span-2">Messages</div>
                <div className="col-span-2">Tags</div>
                <div className="col-span-1"></div>
              </div>

              {/* Contact Rows */}
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="grid grid-cols-12 gap-4 px-6 py-3 hover:bg-gray-50 transition-colors cursor-pointer group items-center"
                >
                  {/* Contact Name & Avatar */}
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#6ab6f5] to-[#5da5e8] flex items-center justify-center text-white font-medium text-sm overflow-hidden">
                        {contact.avatarPath ? (
                          <img
                            src={contact.avatarPath}
                            alt={getDisplayName(contact)}
                            className="h-full w-full object-cover"
                          />
                        ) : contact.isBot ? (
                          <Bot className="h-5 w-5" />
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                      </div>
                      {contact.isBot && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#0088cc] border-2 border-white flex items-center justify-center">
                          <Bot className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {getDisplayName(contact)}
                      </div>
                      {contact.isBot && (
                        <div className="text-xs text-gray-500">Bot</div>
                      )}
                    </div>
                  </div>

                  {/* Contact Info - Username / Phone */}
                  <div className="col-span-2 min-w-0">
                    {contact.username && (
                      <div className="text-sm text-[#0088cc] truncate">@{contact.username}</div>
                    )}
                    {contact.phoneNumber && (
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.phoneNumber}
                      </div>
                    )}
                    {!contact.username && !contact.phoneNumber && (
                      <div className="text-sm text-gray-400">—</div>
                    )}
                  </div>

                  {/* Last Active */}
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">
                      {formatRelativeTime(contact.lastActivity)}
                    </div>
                  </div>

                  {/* Messages Count */}
                  <div className="col-span-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 rounded-full">
                      <MessageSquare className="h-3.5 w-3.5 text-[#0088cc]" />
                      <span className="text-sm font-medium text-gray-900">
                        {contact._count.messages}
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="col-span-2 min-w-0">
                    <TagSelector
                      contactId={contact.id}
                      currentTags={contact.tags || []}
                      onTagsUpdated={(newTags) => {
                        setContacts(prev =>
                          prev.map(c =>
                            c.id === contact.id
                              ? { ...c, tags: newTags }
                              : c
                          )
                        );
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end">
                    <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with count */}
        {contacts.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 flex items-center justify-between text-sm text-gray-600">
            <div>
              Showing {contacts.length} of {total} contacts
            </div>
            {contacts.length < total && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-[#0088cc] hover:text-[#006699] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
