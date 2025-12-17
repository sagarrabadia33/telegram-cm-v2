'use client';

import { useState, useEffect, useRef } from 'react';

// Default prompt used when user hasn't customized - this is what powers the Action & Summary columns
// IMPORTANT: This should match DEFAULT_AI_SYSTEM_PROMPT in /api/ai/analyze-conversations/route.ts
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant analyzing customer conversations for a CRM system.

TEAM CONTEXT:
- Owner/CEO names: {{ownerNames}}
- Team members: {{teamMembers}}
- Bot messages (automated) should NOT be counted as team responses

YOUR MISSION: Provide actionable intelligence. Surface what needs attention NOW.

CRITICAL RULES:

1. TIME IS EVERYTHING
   - If customer sent last message AND it's been 2+ days = they're waiting = RED FLAG
   - If team sent last message = ball is in customer's court = usually OK
   - Silent for 7+ days after active engagement = concerning
   - Bot messages don't count as team responses

2. ACTION, NOT STATUS
   Think "what should happen next?"
   - "Reply Now" = customer waiting, needs response
   - "Schedule Call" = complex issue needs discussion
   - "Send Resource" = customer needs education/docs
   - "Check In" = been quiet, worth a touchpoint
   - "Escalate" = owner needs to personally handle
   - "On Track" = nothing needed right now

3. SPECIFICITY IS EVERYTHING
   BAD: "Customer needs follow-up"
   GOOD: "Customer asked about API rate limits 3 days ago. No response yet. They seem stuck on integration."

4. URGENCY SCORING
   - Customer waiting 3+ days = HIGH
   - Multiple unresolved issues = HIGH
   - Competitor mention = CRITICAL
   - Payment/billing issues = CRITICAL
   - Customer frustrated tone = HIGH
   - Routine questions answered = LOW
   - Waiting on customer = LOW

OUTPUT FORMAT (strict JSON - do not deviate):
{
  "action": "Reply Now" | "Schedule Call" | "Send Resource" | "Check In" | "Escalate" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "daysWaiting": <number or null if not applicable>,
  "summary": "<1-2 sentences: What's happening + what's at stake. Lead with urgency if any.>",
  "nextStep": "<Specific action: who should do what. Be concrete.>",
  "openItems": ["<list of unresolved customer questions/requests if any>"],
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "<if risk > low, explain why with evidence from conversation>"
}`;

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface AISettings {
  id: string;
  name: string;
  aiEnabled: boolean;
  aiSystemPrompt: string;
  aiTeamMembers: string[];
  aiOwnerNames: string[];
  aiAnalysisInterval: number;
  aiLastAnalyzedAt: string | null;
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTagId: string | null;
  allTags: Tag[];
  onTagSelect: (tagId: string | null) => void;
  onAnalyze?: (tagId: string) => Promise<void>;
}

export default function AISettingsModal({
  isOpen,
  onClose,
  selectedTagId,
  allTags,
  onTagSelect,
  onAnalyze,
}: AISettingsModalProps) {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'status'>('settings');

  // Form state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [teamMembers, setTeamMembers] = useState('');
  const [ownerNames, setOwnerNames] = useState('');
  const [analysisInterval, setAnalysisInterval] = useState(5);

  // Analysis status
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch settings when tag is selected
  useEffect(() => {
    if (!selectedTagId || !isOpen) return;

    const fetchSettings = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/tags/${selectedTagId}/ai-settings`);
        if (!response.ok) throw new Error('Failed to fetch AI settings');

        const data = await response.json();
        setSettings(data);
        setAiEnabled(data.aiEnabled);
        // Show default prompt if user hasn't customized - so they can see what's being used
        setSystemPrompt(data.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT);
        setTeamMembers(data.aiTeamMembers?.join(', ') || '');
        setOwnerNames(data.aiOwnerNames?.join(', ') || '');
        setAnalysisInterval(data.aiAnalysisInterval || 5);

        // Also fetch status counts
        const statusResponse = await fetch(`/api/ai/analyze-conversations?tagId=${selectedTagId}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setStatusCounts(statusData.statusCounts || {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [selectedTagId, isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleSave = async () => {
    if (!selectedTagId) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/tags/${selectedTagId}/ai-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiEnabled,
          aiSystemPrompt: systemPrompt,
          aiTeamMembers: teamMembers.split(',').map(s => s.trim()).filter(Boolean),
          aiOwnerNames: ownerNames.split(',').map(s => s.trim()).filter(Boolean),
          aiAnalysisInterval: analysisInterval,
        }),
      });

      if (!response.ok) throw new Error('Failed to save settings');

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyzeNow = async () => {
    if (!selectedTagId) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      if (onAnalyze) {
        await onAnalyze(selectedTagId);
      } else {
        const response = await fetch('/api/ai/analyze-conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId: selectedTagId, forceRefresh: true }),
        });

        if (!response.ok) throw new Error('Failed to run analysis');
      }

      // Refresh status counts
      const statusResponse = await fetch(`/api/ai/analyze-conversations?tagId=${selectedTagId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setStatusCounts(statusData.statusCounts || {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const selectedTag = allTags.find(t => t.id === selectedTagId);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: '640px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>✨</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                AI Conversation Intelligence
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Configure AI analysis for tagged conversations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: '18px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Tag Selector */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}>
          <label style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Select Tag to Configure
          </label>
          <select
            value={selectedTagId || ''}
            onChange={(e) => onTagSelect(e.target.value || null)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <option value="">Select a tag...</option>
            {allTags.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        {selectedTagId ? (
          <>
            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <button
                onClick={() => setActiveTab('settings')}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: activeTab === 'settings' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'settings' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                Settings
              </button>
              <button
                onClick={() => setActiveTab('status')}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: activeTab === 'status' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'status' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                Status
              </button>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                  Loading settings...
                </div>
              ) : activeTab === 'settings' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Enable/Disable Toggle */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: aiEnabled ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: `1px solid ${aiEnabled ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        AI Analysis Enabled
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Automatically analyze conversations with this tag
                      </div>
                    </div>
                    <button
                      onClick={() => setAiEnabled(!aiEnabled)}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        background: aiEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 200ms ease',
                      }}
                    >
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        top: '2px',
                        left: aiEnabled ? '22px' : '2px',
                        transition: 'left 200ms ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>

                  {/* Team Members */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}>
                      Team Members (comma separated)
                    </label>
                    <input
                      type="text"
                      value={teamMembers}
                      onChange={(e) => setTeamMembers(e.target.value)}
                      placeholder="Jesus, Prathamesh"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                      }}
                    />
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-quaternary)' }}>
                      Handle routine customer support and day-to-day queries
                    </p>
                  </div>

                  {/* Owner Names */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}>
                      Owner Names (comma separated)
                    </label>
                    <input
                      type="text"
                      value={ownerNames}
                      onChange={(e) => setOwnerNames(e.target.value)}
                      placeholder="Shalin"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                      }}
                    />
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-quaternary)' }}>
                      Escalate pricing, contracts, and critical issues to owners
                    </p>
                  </div>

                  {/* Analysis Interval */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                    }}>
                      Analysis Interval (minutes)
                    </label>
                    <input
                      type="number"
                      value={analysisInterval}
                      onChange={(e) => setAnalysisInterval(parseInt(e.target.value) || 5)}
                      min={1}
                      max={60}
                      style={{
                        width: '100px',
                        padding: '10px 12px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                      }}
                    />
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-quaternary)' }}>
                      How often to re-analyze conversations with new messages
                    </p>
                  </div>

                  {/* System Prompt - Linear Design */}
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          marginBottom: '2px',
                        }}>
                          Analysis Prompt
                        </label>
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                        }}>
                          Controls what appears in Action & Summary columns
                        </span>
                      </div>
                      {systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                        <button
                          type="button"
                          onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            color: 'var(--text-tertiary)',
                            background: 'var(--bg-tertiary)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 10px',
                            borderRadius: '4px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-tertiary)';
                            e.currentTarget.style.color = 'var(--text-tertiary)';
                          }}
                        >
                          Reset to default
                        </button>
                      )}
                    </div>

                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={14}
                      style={{
                        width: '100%',
                        padding: '12px',
                        fontSize: '11px',
                        fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        resize: 'vertical',
                        lineHeight: '1.5',
                      }}
                    />

                    {/* Helper text */}
                    <div style={{
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                      fontSize: '11px',
                      color: 'var(--text-quaternary)',
                      lineHeight: 1.4,
                    }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Tip:</span>
                      <span>
                        Use <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>{'{{ownerNames}}'}</code> and
                        <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px', marginLeft: '3px' }}>{'{{teamMembers}}'}</code> to
                        dynamically insert names from the fields above.
                      </span>
                    </div>
                  </div>

                  {error && (
                    <div style={{
                      padding: '12px',
                      background: '#FEE2E2',
                      color: '#B91C1C',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}>
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                /* Status Tab */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Status Summary Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                  }}>
                    <StatusCard
                      label="Needs Owner"
                      count={statusCounts.needs_owner || 0}
                      color="#EF4444"
                      icon="🔴"
                    />
                    <StatusCard
                      label="At Risk"
                      count={statusCounts.at_risk || 0}
                      color="#F59E0B"
                      icon="⚠️"
                    />
                    <StatusCard
                      label="Team Handling"
                      count={statusCounts.team_handling || 0}
                      color="#3B82F6"
                      icon="👥"
                    />
                    <StatusCard
                      label="Resolved"
                      count={statusCounts.resolved || 0}
                      color="#10B981"
                      icon="✓"
                    />
                    <StatusCard
                      label="Monitoring"
                      count={statusCounts.monitoring || 0}
                      color="#6B7280"
                      icon="👁"
                    />
                    <StatusCard
                      label="Unanalyzed"
                      count={statusCounts.unanalyzed || 0}
                      color="#9CA3AF"
                      icon="?"
                    />
                  </div>

                  {/* Last Analysis Info */}
                  {settings?.aiLastAnalyzedAt && (
                    <div style={{
                      padding: '12px 16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}>
                      Last analyzed: {new Date(settings.aiLastAnalyzedAt).toLocaleString()}
                    </div>
                  )}

                  {/* Analyze Now Button */}
                  <button
                    onClick={handleAnalyzeNow}
                    disabled={isAnalyzing || !aiEnabled}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'white',
                      background: aiEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: aiEnabled ? 'pointer' : 'not-allowed',
                      opacity: isAnalyzing ? 0.7 : 1,
                    }}
                  >
                    {isAnalyzing ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        ✨ Analyze All Conversations Now
                      </>
                    )}
                  </button>

                  {!aiEnabled && (
                    <p style={{
                      textAlign: 'center',
                      fontSize: '12px',
                      color: 'var(--text-quaternary)',
                    }}>
                      Enable AI analysis in the Settings tab to run analysis
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {activeTab === 'settings' && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 20px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
              }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '8px 20px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'white',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
          }}>
            <div>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏷️</div>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>Select a tag to configure AI analysis</div>
              <div style={{ fontSize: '12px', color: 'var(--text-quaternary)' }}>
                AI will analyze conversations tagged with your selection
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Status card component
function StatusCard({
  label,
  count,
  color,
  icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: string;
}) {
  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '4px',
      }}>
        <span style={{ fontSize: '12px' }}>{icon}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: '20px',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        {count}
      </div>
    </div>
  );
}
