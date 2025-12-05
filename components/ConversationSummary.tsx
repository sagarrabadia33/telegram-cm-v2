"use client";

import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, Clock, MessageCircle, List, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

interface ConversationSummaryProps {
  conversationId: string;
  conversationTitle?: string;
  defaultExpanded?: boolean;
}

interface SummaryData {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  intentLevel: "high" | "medium" | "low";
  keyPoints: string[];
  lastTopic: string;
  summaryGeneratedAt: string;
  newMessagesSinceGenerated?: number;
}

export function ConversationSummary({
  conversationId,
  conversationTitle,
  defaultExpanded = true
}: ConversationSummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    fetchSummary();
  }, [conversationId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/conversations/${conversationId}/summary`);
      const data = await response.json();

      if (response.ok && data.success) {
        setSummaryData(data.data);
      } else {
        // Summary doesn't exist yet - this is normal
        setSummaryData(null);
      }
    } catch (err) {
      console.error("Error fetching summary:", err);
      setError("Failed to load summary");
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    try {
      setRegenerating(true);
      setError(null);

      const response = await fetch(`/api/conversations/${conversationId}/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regenerate: true }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSummaryData(data.data);
      } else {
        setError(data.error || "Failed to generate summary");
      }
    } catch (err) {
      console.error("Error generating summary:", err);
      setError("Failed to generate summary");
    } finally {
      setRegenerating(false);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  if (loading && !summaryData) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-sm text-gray-600">Loading AI summary...</p>
        </div>
      </div>
    );
  }

  if (!summaryData) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-800">AI Summary</h3>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Generate an AI-powered summary to get insights about this conversation.
        </p>
        <button
          onClick={generateSummary}
          disabled={regenerating}
          className="w-full px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {regenerating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Generate Summary</span>
            </>
          )}
        </button>
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
      </div>
    );
  }

  const hasNewMessages = typeof summaryData.newMessagesSinceGenerated === 'number' && summaryData.newMessagesSinceGenerated > 0;
  const isStale = typeof summaryData.newMessagesSinceGenerated === 'number' && summaryData.newMessagesSinceGenerated > 10;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-lg overflow-hidden">
      {/* Header - Always Visible - Pixel-perfect alignment */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <Sparkles className="h-5 w-5 text-purple-600 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-sm font-semibold text-gray-900 leading-tight mb-1">AI Summary</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>Updated {formatTimeAgo(summaryData.summaryGeneratedAt)}</span>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
          )}
        </button>
        <button
          onClick={generateSummary}
          disabled={regenerating}
          className="p-2.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title="Regenerate summary"
        >
          <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Staleness Indicator - Notion-style alert */}
      {hasNewMessages && (
        <div className={`px-5 ${isExpanded ? "pb-4" : "pb-5"}`}>
          <div className={`flex items-start gap-3 px-4 py-3 rounded-lg text-xs ${
            isStale
              ? "bg-amber-50 text-amber-900 border border-amber-200"
              : "bg-blue-50 text-blue-900 border border-blue-200"
          }`}>
            {isStale && <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
            <span className="flex-1 leading-relaxed">
              <strong className="font-semibold">{summaryData.newMessagesSinceGenerated} new message{summaryData.newMessagesSinceGenerated !== 1 ? "s" : ""}</strong> since this summary was generated.
              {isStale && " Click regenerate for fresh insights."}
            </span>
          </div>
        </div>
      )}

      {/* Collapsible Content - GitHub/Linear-inspired spacing */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-5">
          {/* Summary Text */}
          <div className="px-1">
            <p className="text-sm text-gray-700 leading-relaxed">{summaryData.summary}</p>
          </div>

          {/* Last Topic - Slack-style section with pixel-perfect alignment */}
          {summaryData.lastTopic && (
            <div className="flex items-start gap-3 pt-4 border-t border-blue-200/50">
              <MessageCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 leading-tight">Latest Discussion</p>
                <p className="text-sm text-gray-800 leading-relaxed">{summaryData.lastTopic}</p>
              </div>
            </div>
          )}

          {/* Key Points - Notion-style list with pixel-perfect alignment */}
          {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
            <div className="flex items-start gap-3 pt-4 border-t border-blue-200/50">
              <List className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3 leading-tight">Key Discussion Points</p>
                <ul className="space-y-2.5">
                  {summaryData.keyPoints.map((point, index) => (
                    <li key={index} className="text-sm text-gray-800 flex items-start gap-3 leading-relaxed">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex-shrink-0 mt-px">
                        {index + 1}
                      </span>
                      <span className="flex-1">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {error && (
            <div className="pt-4 border-t border-red-200/50">
              <p className="text-sm text-red-600 px-1">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
