'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DashboardMetrics,
  TrendData,
  AISuggestion,
} from '@/app/lib/analytics/types';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// CHART COMPONENTS
// ============================================================================

function MiniTrendChart({ data, color = '#6366f1', height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length === 0 || data.every(d => d === 0)) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 11 }}>No data</div>;
  }

  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = height - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EngagementChart({ data, height = 160 }: { data: TrendData[]; height?: number }) {
  if (data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>No data</div>;
  }

  const last14Days = data.slice(-14);
  const maxValue = Math.max(...last14Days.flatMap(d => [d.conversationsOpened, d.messagesSent, d.searchesPerformed]), 1);

  // Chart dimensions with proper padding
  const chartHeight = height - 40; // Leave space for legend
  const padding = { top: 10, bottom: 10 };
  const usableHeight = chartHeight - padding.top - padding.bottom;

  const getPoints = (values: number[]) => {
    return values.map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * 100;
      // Y goes from top (padding.top) to bottom (chartHeight - padding.bottom)
      const y = padding.top + usableHeight - (v / maxValue) * usableHeight;
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div>
      <svg viewBox={`0 0 100 ${chartHeight}`} style={{ width: '100%', height: chartHeight, display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
          <line
            key={ratio}
            x1="0"
            y1={padding.top + usableHeight * (1 - ratio)}
            x2="100"
            y2={padding.top + usableHeight * (1 - ratio)}
            stroke="#374151"
            strokeWidth="0.3"
          />
        ))}

        {/* Lines */}
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={getPoints(last14Days.map(d => d.conversationsOpened))} strokeLinecap="round" strokeLinejoin="round" />
        <polyline fill="none" stroke="#10b981" strokeWidth="2" points={getPoints(last14Days.map(d => d.messagesSent))} strokeLinecap="round" strokeLinejoin="round" />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={getPoints(last14Days.map(d => d.searchesPerformed))} strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
        {[
          { color: '#3b82f6', label: 'Conversations' },
          { color: '#10b981', label: 'Messages' },
          { color: '#f59e0b', label: 'Searches' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageTimeBar({ messagesPercent, contactsPercent }: { messagesPercent: number; contactsPercent: number }) {
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1f2937' }}>
      <div style={{ width: `${messagesPercent}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
      <div style={{ width: `${contactsPercent}%`, background: '#8b5cf6', transition: 'width 0.3s' }} />
    </div>
  );
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

function MetricCard({
  label,
  value,
  subValue,
  trend,
  trendColor = '#6366f1'
}: {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: number[];
  trendColor?: string;
}) {
  return (
    <div style={{
      background: '#111827',
      borderRadius: 12,
      padding: 16,
      border: '1px solid #1f2937',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span style={{ fontSize: 28, fontWeight: 600, color: '#f9fafb', lineHeight: 1 }}>{value}</span>
          {subValue && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{subValue}</span>}
        </div>
        {trend && trend.length > 0 && (
          <div style={{ width: 60, height: 30 }}>
            <MiniTrendChart data={trend} color={trendColor} height={30} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', margin: 0 }}>{title}</h3>
      {action}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#111827',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #1f2937',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  count,
  color = '#6b7280'
}: {
  icon: string;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      background: '#0d1117',
      borderRadius: 8,
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#d1d5db' }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{count}</span>
    </div>
  );
}

function ErrorRow({
  errorType,
  count,
  lastOccurred,
  sample,
}: {
  errorType: string;
  count: number;
  lastOccurred: string;
  sample?: string;
}) {
  const friendlyNames: Record<string, string> = {
    message_send_failed: 'Message send failed',
    api_error: 'API error',
    sync_failed: 'Sync failed',
  };

  return (
    <div style={{
      padding: '12px 14px',
      background: '#0d1117',
      borderRadius: 8,
      marginBottom: 8,
      borderLeft: '3px solid #ef4444',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#f87171' }}>
            {friendlyNames[errorType] || errorType}
          </span>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            Last: {formatRelativeTime(lastOccurred)}
          </div>
        </div>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#fca5a5',
          background: '#7f1d1d',
          padding: '2px 8px',
          borderRadius: 10,
        }}>
          {count}x
        </span>
      </div>
      {sample && (
        <div style={{
          fontSize: 11,
          color: '#9ca3af',
          marginTop: 8,
          padding: 8,
          background: '#1f2937',
          borderRadius: 4,
          fontFamily: 'monospace',
          wordBreak: 'break-all',
        }}>
          {sample.slice(0, 100)}{sample.length > 100 ? '...' : ''}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AISuggestion }) {
  const typeColors = {
    feature: { bg: '#1e3a5f', text: '#60a5fa', label: '✨ Feature' },
    fix: { bg: '#7f1d1d', text: '#fca5a5', label: '🔧 Fix' },
    improvement: { bg: '#365314', text: '#a3e635', label: '📈 Improve' },
    insight: { bg: '#4c1d95', text: '#c4b5fd', label: '💡 Insight' },
  };

  const priorityColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#6b7280',
  };

  const { bg, text, label } = typeColors[suggestion.type];

  return (
    <div style={{
      padding: 16,
      background: '#0d1117',
      borderRadius: 10,
      marginBottom: 10,
      border: '1px solid #1f2937',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: text,
          background: bg,
          padding: '3px 8px',
          borderRadius: 6,
        }}>
          {label}
        </span>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: priorityColors[suggestion.priority],
        }} title={`${suggestion.priority} priority`} />
      </div>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', margin: '0 0 8px 0' }}>
        {suggestion.title}
      </h4>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 10px 0', lineHeight: 1.5 }}>
        {suggestion.description}
      </p>
      <div style={{ fontSize: 11, color: '#6b7280' }}>
        Based on: {suggestion.basedOn}
      </div>
    </div>
  );
}

function CoreFeatureCard({
  title,
  icon,
  stats,
  color,
  trendData,
}: {
  title: string;
  icon: string;
  stats: { label: string; value: number | string }[];
  color: string;
  trendData: number[];
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}>
          {icon}
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', margin: 0 }}>{title}</h4>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {stats.map((stat, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#f9fafb' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {trendData.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>30-day trend</div>
          <MiniTrendChart data={trendData} color={color} height={36} />
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export default function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'errors'>('overview');

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/dashboard');
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const response = await fetch('/api/analytics/suggestions');
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#6b7280',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <div>Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        gap: 16,
      }}>
        <span style={{ color: '#ef4444' }}>Error: {error || 'No data'}</span>
        <button
          onClick={fetchMetrics}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Extract trend data for mini charts
  const sessionTrend = metrics.sessions.sessionsByDay.slice(-7).map(d => d.count);
  const messageTrend = metrics.trends.slice(-7).map(d => d.messagesSent);
  const convTrend = metrics.trends.slice(-7).map(d => d.conversationsOpened);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f9fafb',
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1f2937',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        background: '#0a0a0a',
        zIndex: 100,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Product Analytics</h1>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0 0' }}>
            Usage insights · Last 30 days
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          style={{
            padding: '8px 14px',
            background: '#1f2937',
            color: '#d1d5db',
            border: '1px solid #374151',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ↻ Refresh
        </button>
      </header>

      {/* Tabs */}
      <nav style={{
        display: 'flex',
        gap: 4,
        padding: '12px 24px',
        borderBottom: '1px solid #1f2937',
      }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'features', label: 'Core Features' },
          { id: 'errors', label: `Errors${metrics.errors.totalErrors > 0 ? ` (${metrics.errors.totalErrors})` : ''}` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#1f2937' : 'transparent',
              color: activeTab === tab.id ? '#f9fafb' : '#6b7280',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {activeTab === 'overview' && (
          <>
            {/* Session Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <MetricCard
                label="Sessions"
                value={metrics.sessions.totalSessions}
                subValue={`${metrics.sessions.sessionsToday} today`}
                trend={sessionTrend}
                trendColor="#3b82f6"
              />
              <MetricCard
                label="Avg. Session Duration"
                value={formatDuration(metrics.sessions.avgSessionDurationMs)}
                subValue={`${formatDuration(metrics.sessions.totalDurationMs)} total`}
              />
              <MetricCard
                label="Messages Sent"
                value={metrics.month.messagesSent}
                subValue={`${metrics.today.messagesSent} today`}
                trend={messageTrend}
                trendColor="#10b981"
              />
              <MetricCard
                label="Conversations"
                value={metrics.month.conversationsOpened}
                subValue={`${metrics.today.conversationsOpened} today`}
                trend={convTrend}
                trendColor="#f59e0b"
              />
            </div>

            {/* Page Time Distribution */}
            <Card style={{ marginBottom: 24 }}>
              <SectionHeader title="Time Spent by Page" />
              <PageTimeBar
                messagesPercent={metrics.pageTime.messagesPagePercent}
                contactsPercent={metrics.pageTime.contactsPagePercent}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2 }} />
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    Messages {metrics.pageTime.messagesPagePercent}%
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, background: '#8b5cf6', borderRadius: 2 }} />
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    Contacts {metrics.pageTime.contactsPagePercent}%
                  </span>
                </div>
              </div>
            </Card>

            {/* Actions by Page */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <Card>
                <SectionHeader title={`Messages Page · ${metrics.actionsByPage.messages.totalActions} actions`} />
                {metrics.actionsByPage.messages.topActions.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 20 }}>No actions yet</div>
                ) : (
                  metrics.actionsByPage.messages.topActions.map((action, i) => (
                    <ActionRow
                      key={i}
                      icon={action.action.includes('message') ? '💬' : action.action.includes('search') ? '🔍' : action.action.includes('ai') ? '🤖' : '📝'}
                      label={action.description}
                      count={action.count}
                      color="#3b82f6"
                    />
                  ))
                )}
              </Card>

              <Card>
                <SectionHeader title={`Contacts Page · ${metrics.actionsByPage.contacts.totalActions} actions`} />
                {metrics.actionsByPage.contacts.topActions.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 20 }}>No actions yet</div>
                ) : (
                  metrics.actionsByPage.contacts.topActions.map((action, i) => (
                    <ActionRow
                      key={i}
                      icon={action.action.includes('tag') ? '🏷️' : action.action.includes('filter') ? '⚡' : action.action.includes('contact') ? '👤' : '📋'}
                      label={action.description}
                      count={action.count}
                      color="#8b5cf6"
                    />
                  ))
                )}
              </Card>
            </div>

            {/* Engagement Trends */}
            <Card style={{ marginBottom: 24 }}>
              <SectionHeader title="14-Day Engagement Trends" />
              <EngagementChart data={metrics.trends} height={180} />
            </Card>

            {/* AI Suggestions */}
            <Card>
              <SectionHeader
                title="AI Suggestions"
                action={
                  <button
                    onClick={fetchSuggestions}
                    disabled={suggestionsLoading}
                    style={{
                      padding: '6px 12px',
                      background: '#1f2937',
                      color: suggestionsLoading ? '#6b7280' : '#d1d5db',
                      border: '1px solid #374151',
                      borderRadius: 6,
                      cursor: suggestionsLoading ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {suggestionsLoading ? 'Analyzing...' : '✨ Generate Suggestions'}
                  </button>
                }
              />
              {suggestions.length === 0 ? (
                <div style={{
                  color: '#6b7280',
                  fontSize: 13,
                  textAlign: 'center',
                  padding: 40,
                  background: '#0d1117',
                  borderRadius: 8,
                }}>
                  Click "Generate Suggestions" to get AI-powered insights based on your usage data
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                  {suggestions.map((suggestion) => (
                    <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {activeTab === 'features' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {/* Tags Card */}
              <CoreFeatureCard
                title="Tagging"
                icon="🏷️"
                color="#f59e0b"
                stats={[
                  { label: 'Tags Assigned', value: metrics.coreFeatures.tags.totalAssigned },
                  { label: 'Tags Created', value: metrics.coreFeatures.tags.totalCreated },
                  { label: 'Tags Removed', value: metrics.coreFeatures.tags.totalRemoved },
                  { label: 'Bulk Operations', value: metrics.coreFeatures.tags.bulkTagOperations },
                ]}
                trendData={metrics.coreFeatures.tags.tagTrend.slice(-14).map(d => d.count)}
              />

              {/* AI Assistant Card */}
              <CoreFeatureCard
                title="AI Assistant"
                icon="🤖"
                color="#8b5cf6"
                stats={[
                  { label: 'Prompts Submitted', value: metrics.coreFeatures.ai.totalPrompts },
                  { label: 'Responses', value: metrics.coreFeatures.ai.totalResponses },
                  { label: 'Success Rate', value: `${metrics.coreFeatures.ai.successRate}%` },
                  { label: 'Avg Response Time', value: formatDuration(metrics.coreFeatures.ai.avgResponseTimeMs) },
                ]}
                trendData={metrics.coreFeatures.ai.promptTrend.slice(-14).map(d => d.count)}
              />

              {/* Notes Card */}
              <CoreFeatureCard
                title="Notes"
                icon="📝"
                color="#10b981"
                stats={[
                  { label: 'Notes Created', value: metrics.coreFeatures.notes.totalCreated },
                  { label: 'Notes Edited', value: metrics.coreFeatures.notes.totalEdited },
                  { label: 'Notes Deleted', value: metrics.coreFeatures.notes.totalDeleted },
                  { label: 'Files Attached', value: metrics.coreFeatures.notes.filesAttached },
                ]}
                trendData={metrics.coreFeatures.notes.noteTrend.slice(-14).map(d => d.count)}
              />
            </div>

            {/* Quick Filter Usage */}
            <Card style={{ marginTop: 24 }}>
              <SectionHeader title="Quick Filter Usage" />
              {metrics.filterUsage.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 30 }}>
                  No filter usage data yet
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {metrics.filterUsage.map((filter, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 14,
                        background: '#0d1117',
                        borderRadius: 8,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 22, fontWeight: 600, color: '#f9fafb' }}>{filter.count}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{filter.filter}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {activeTab === 'errors' && (
          <>
            {metrics.errors.totalErrors === 0 ? (
              <Card>
                <div style={{
                  textAlign: 'center',
                  padding: 60,
                  color: '#10b981',
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Errors</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    All systems running smoothly
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {/* Error Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <MetricCard
                    label="Total Errors"
                    value={metrics.errors.totalErrors}
                    subValue="Last 30 days"
                    trendColor="#ef4444"
                  />
                  <MetricCard
                    label="Error Types"
                    value={metrics.errors.errorsByType.length}
                    subValue="Unique types"
                  />
                </div>

                {/* Error List */}
                <Card>
                  <SectionHeader title="Errors by Type" />
                  {metrics.errors.errorsByType.map((err, i) => (
                    <ErrorRow
                      key={i}
                      errorType={err.errorType}
                      count={err.count}
                      lastOccurred={err.lastOccurred}
                      sample={err.sample}
                    />
                  ))}
                </Card>

                {/* Error Trend */}
                {metrics.errors.errorTrend.length > 0 && (
                  <Card style={{ marginTop: 24 }}>
                    <SectionHeader title="Error Trend (30 days)" />
                    <MiniTrendChart
                      data={metrics.errors.errorTrend.map(d => d.count)}
                      color="#ef4444"
                      height={60}
                    />
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '24px',
        color: '#4b5563',
        fontSize: 11,
        borderTop: '1px solid #1f2937',
      }}>
        Internal analytics · Data retained for 90 days
      </footer>
    </div>
  );
}
