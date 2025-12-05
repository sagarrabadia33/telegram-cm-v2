"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Users,
  Settings,
  Phone,
  BarChart3,
  Send,
  UserPlus,
  Search,
  Activity,
  CheckCircle2,
  User,
  Bot,
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
  createdAt: string;
}

export default function Home() {
  const [stats, setStats] = useState({
    totalContacts: 0,
    activeChats: 0,
    withPhones: 0,
    totalConversations: 0,
  });
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, contactsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/recent-contacts"),
      ]);

      const statsData = await statsRes.json();
      const contactsData = await contactsRes.json();

      setStats(statsData);
      setRecentContacts(contactsData.contacts || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (contact: Contact) => {
    const parts = [];
    if (contact.firstName) parts.push(contact.firstName);
    if (contact.lastName) parts.push(contact.lastName);
    if (parts.length === 0 && contact.username) return `@${contact.username}`;
    if (parts.length === 0) return "Unknown";
    return parts.join(" ");
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0088cc]">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Telegram CRM</h1>
              <p className="text-xs text-gray-500">Beast Insights</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Button className="bg-[#0088cc] text-white hover:bg-[#006699]" asChild>
              <a href="/">Dashboard</a>
            </Button>
            <Button variant="ghost" className="text-gray-600 hover:text-[#0088cc] hover:bg-[#e7f3f8]" asChild>
              <a href="/contacts">Contacts</a>
            </Button>
            <Button variant="ghost" className="text-gray-600 hover:text-[#0088cc] hover:bg-[#e7f3f8]" asChild>
              <a href="/conversations">Conversations</a>
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-600 hover:text-[#0088cc] hover:bg-[#e7f3f8]">
              <Settings className="h-5 w-5" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome to Telegram CRM
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your Telegram contacts and conversations efficiently
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Contacts
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-[#0088cc]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {loading ? "..." : stats.totalContacts.toLocaleString()}
              </div>
              <p className="text-xs text-gray-500 mt-1">Synced from Telegram</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Active Chats
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {loading ? "..." : stats.activeChats}
              </div>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                With Phone Numbers
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                <Phone className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {loading ? "..." : stats.withPhones}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalContacts > 0
                  ? Math.round((stats.withPhones / stats.totalContacts) * 100)
                  : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Conversations
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {loading ? "..." : stats.totalConversations}
              </div>
              <p className="text-xs text-gray-500 mt-1">Groups & private chats</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-7">
          {/* Recent Activity */}
          <Card className="lg:col-span-4 border-gray-200 shadow-sm">
            <CardHeader className="border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">Recently Added Contacts</CardTitle>
                  <CardDescription className="text-sm text-gray-500 mt-1">
                    Latest contacts synced from Telegram
                  </CardDescription>
                </div>
                <Activity className="h-5 w-5 text-[#0088cc]" />
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0088cc] border-r-transparent"></div>
                </div>
              ) : recentContacts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No contacts found
                </div>
              ) : (
                <div className="space-y-4">
                  {recentContacts.slice(0, 6).map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-4 pb-4 border-b border-gray-100 last:border-0 last:pb-0"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0088cc] to-[#40a7e3] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 overflow-hidden">
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {getDisplayName(contact)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {contact.username ? `@${contact.username}` : contact.phoneNumber || "No username"} · {getTimeAgo(contact.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#0088cc] hover:bg-[#e7f3f8] hover:text-[#006699] flex-shrink-0"
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="lg:col-span-3 border-gray-200 shadow-sm">
            <CardHeader className="border-b border-gray-100">
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
                <CardDescription className="text-sm text-gray-500 mt-1">
                  Common tasks and shortcuts
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <Button className="w-full h-11 bg-[#0088cc] text-white hover:bg-[#006699] shadow-sm" size="lg">
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </Button>
              <Button
                className="w-full h-11 border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                variant="outline"
                size="lg"
                asChild
              >
                <a href="/contacts">
                  <UserPlus className="mr-2 h-4 w-4" />
                  View All Contacts
                </a>
              </Button>
              <Button
                className="w-full h-11 border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                variant="outline"
                size="lg"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                View Tasks
              </Button>
              <div className="pt-2">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Quick Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search contacts..."
                    className="pl-9 h-10 bg-white border-gray-200 shadow-sm focus:border-[#0088cc] focus:ring-[#0088cc]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
