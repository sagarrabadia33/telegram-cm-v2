'use client';

import { useState, useEffect, useRef } from 'react';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface AISettings {
  id: string;
  name: string;
  aiEnabled: boolean;
  aiSystemPrompt: string | null;
  aiLastAnalyzedAt: string | null;
  conversationCount: number;
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTagId: string | null;
  allTags: Tag[];
  onTagSelect: (tagId: string | null) => void;
  onAnalyze?: (tagId: string) => Promise<void>;
}

// Default prompts per tag
const DEFAULT_PROMPTS: Record<string, string> = {
  'Customer Groups': `You are an AI assistant analyzing customer support conversations.

TEAM CONTEXT:
- Owner/CEO: {{ownerNames}}
- Team members: {{teamMembers}}

MISSION: Identify who needs response and flag escalations for the owner.

URGENCY RULES:
- Customer waiting 3+ days = HIGH
- Multiple unresolved issues = HIGH
- Competitor mention = CRITICAL
- Payment/billing issues = CRITICAL
- Routine questions answered = LOW

OUTPUT FORMAT (JSON):
{
  "action": "Reply Now" | "Schedule Call" | "Send Resource" | "Check In" | "Escalate" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<1-2 sentences: current state and what's at stake>",
  "nextStep": "<specific action: who should do what>",
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "<if risk > low, explain why>"
}`,

  'Customer': `You are analyzing Shalin's direct relationships with customer executives.

CONTEXT: These are 1:1 private chats with paying customer owners - not support, but relationship maintenance.

RELATIONSHIP HEALTH:
- happy: Engaged, positive sentiment
- needs_attention: Question or issue waiting
- at_risk: Signs of dissatisfaction
- escalated: Serious issue being handled
- resolved: Issue addressed, stable

URGENCY:
- Waiting 5+ days = CRITICAL
- Payment issue = CRITICAL
- Frustration = HIGH
- No touchpoint 2+ weeks = MEDIUM

OUTPUT FORMAT (JSON):
{
  "status": "happy" | "needs_attention" | "at_risk" | "escalated" | "resolved",
  "action": "Personal Check-in" | "Address Concern" | "Celebrate Win" | "Discuss Renewal" | "Resolve Issue" | "Strengthen Relationship" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<relationship state and pending items>",
  "nextStep": "<specific personal action for Shalin>"
}`,

  'Partner': `You are analyzing partner/referral relationships for Beast Insights.

CONTEXT: Partners are referral sources - payment processors, ISOs, industry contacts.
Value exchange: 5% lifetime revenue share for referrals.

RELATIONSHIP STAGES:
- nurturing: Early conversations, exploring fit
- high_potential: Strong network, actively engaging
- active: Actively referring
- committed: Formal agreement signed
- dormant: Gone quiet 7+ days

URGENCY:
- Partner waiting 7+ days = CRITICAL
- Inbound lead waiting 3+ days = CRITICAL
- Mentioned referral, no follow-up = HIGH

OUTPUT FORMAT (JSON):
{
  "status": "nurturing" | "high_potential" | "active" | "committed" | "dormant",
  "action": "Reply Now" | "Schedule Call" | "Send Intro" | "Follow Up" | "Nurture" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<relationship state and network value>",
  "nextStep": "<specific action for Shalin>"
}`,

  'Prospect': `You are analyzing sales pipeline conversations.

CONTEXT: Prospects met at conferences or referred by partners. Goal: book demos, convert to customers.

PIPELINE STAGES:
- new_lead: Just connected
- qualifying: Exploring fit
- demo_scheduled: Demo booked
- demo_completed: Post-demo follow-up
- negotiating: Discussing terms
- closed_won/closed_lost: Outcome
- nurturing: Long-term warm

URGENCY:
- Hot lead waiting 3+ days = CRITICAL
- Demo requested, not scheduled = HIGH
- Post-demo no follow-up = HIGH

OUTPUT FORMAT (JSON):
{
  "status": "new_lead" | "qualifying" | "demo_scheduled" | "demo_completed" | "negotiating" | "closed_won" | "closed_lost" | "nurturing",
  "action": "Book Demo" | "Send Follow-up" | "Share Case Study" | "Send Proposal" | "Close Deal" | "Nurture" | "Re-engage" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<pipeline stage and conversion potential>",
  "nextStep": "<specific sales action>"
}`,

  'Churned': `You are analyzing churned customer win-back opportunities.

CONTEXT: These customers previously used Beast but stopped. Goal: understand why and win them back.

WIN-BACK STAGES:
- recently_churned: Left within 30 days, warm
- cooling: 30-90 days, getting cold
- cold: 90+ days, re-activation needed
- re_engaged: Showing interest again
- won_back: Successfully returned

URGENCY:
- Recently churned (< 30 days) = CRITICAL
- Responded to outreach = HIGH
- Cold but high-value = MEDIUM

OUTPUT FORMAT (JSON):
{
  "status": "recently_churned" | "cooling" | "cold" | "re_engaged" | "won_back",
  "action": "Win Back Call" | "Send Offer" | "Personal Outreach" | "Final Attempt" | "Close File" | "Celebrate Win" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<churn reason and win-back potential>",
  "nextStep": "<specific re-engagement action>"
}`
};

const GENERIC_DEFAULT_PROMPT = `You are an AI assistant analyzing conversations for a CRM system.

TEAM CONTEXT:
- Owner/CEO: {{ownerNames}}
- Team members: {{teamMembers}}

MISSION: Identify what needs attention and suggest next actions.

OUTPUT FORMAT (JSON):
{
  "action": "Reply Now" | "Schedule Call" | "Check In" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<1-2 sentences about current state>",
  "nextStep": "<specific recommended action>",
  "risk": "none" | "low" | "medium" | "high"
}`;

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  const getDefaultPrompt = (tagName: string) => DEFAULT_PROMPTS[tagName] || GENERIC_DEFAULT_PROMPT;

  const isDefaultPrompt = (tagName: string, prompt: string) => {
    const defaultPrompt = getDefaultPrompt(tagName);
    return !prompt || prompt.trim() === defaultPrompt.trim();
  };

  useEffect(() => {
    if (!selectedTagId || !isOpen) return;

    const fetchSettings = async () => {
      setIsLoading(true);
      setHasChanges(false);
      setShowPrompt(false);

      try {
        const response = await fetch(`/api/tags/${selectedTagId}/ai-settings`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        setSettings(data);
        setAiEnabled(data.aiEnabled);

        const tagName = allTags.find(t => t.id === selectedTagId)?.name || '';
        setSystemPrompt(data.aiSystemPrompt || getDefaultPrompt(tagName));
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [selectedTagId, isOpen, allTags]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

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

  const handleToggle = () => {
    setAiEnabled(!aiEnabled);
    setHasChanges(true);
  };

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    setHasChanges(true);
  };

  const handleResetPrompt = () => {
    const tagName = allTags.find(t => t.id === selectedTagId)?.name || '';
    setSystemPrompt(getDefaultPrompt(tagName));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedTagId || !hasChanges) return;
    setIsSaving(true);

    try {
      const tagName = allTags.find(t => t.id === selectedTagId)?.name || '';
      const isDefault = isDefaultPrompt(tagName, systemPrompt);

      const response = await fetch(`/api/tags/${selectedTagId}/ai-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiEnabled,
          aiSystemPrompt: isDefault ? null : systemPrompt,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      const data = await response.json();
      setSettings(prev => prev ? { ...prev, ...data, aiSystemPrompt: isDefault ? null : systemPrompt } : null);
      setHasChanges(false);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyzeNow = async () => {
    if (!selectedTagId) return;
    setIsAnalyzing(true);

    try {
      if (onAnalyze) {
        await onAnalyze(selectedTagId);
      } else {
        const response = await fetch('/api/ai/analyze-conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId: selectedTagId, forceRefresh: true }),
        });
        if (!response.ok) throw new Error('Failed');
      }

      const response = await fetch(`/api/tags/${selectedTagId}/ai-settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(prev => prev ? { ...prev, aiLastAnalyzedAt: data.aiLastAnalyzedAt } : null);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const selectedTag = allTags.find(t => t.id === selectedTagId);
  const isUsingDefault = selectedTag ? isDefaultPrompt(selectedTag.name, systemPrompt) : true;

  const formatLastAnalyzed = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

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
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: '480px',
          maxWidth: '90vw',
          height: '540px',
          maxHeight: '85vh',
          background: 'var(--bg-primary)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.32)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header - 48px */}
        <div style={{
          height: '48px',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            AI Analysis
          </span>
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
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: '18px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content - flexible */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tag Selector - fixed 56px */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <select
              value={selectedTagId || ''}
              onChange={(e) => onTagSelect(e.target.value || null)}
              style={{
                width: '100%',
                height: '32px',
                padding: '0 10px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">Select a tag...</option>
              {allTags
                .filter(tag => ['Customer Groups', 'Partner', 'Prospect', 'Customer', 'Churned'].includes(tag.name))
                .map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
            </select>
          </div>

          {/* Main content - scrollable */}
          {selectedTagId ? (
            isLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading...</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                {/* Toggle Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: '36px',
                  marginBottom: '16px',
                }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      Enable AI
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                      Analyze conversations automatically
                    </span>
                  </div>
                  <button
                    onClick={handleToggle}
                    style={{
                      width: '36px',
                      height: '20px',
                      borderRadius: '10px',
                      background: aiEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 150ms',
                    }}
                  >
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '8px',
                      background: 'white',
                      position: 'absolute',
                      top: '2px',
                      left: aiEnabled ? '18px' : '2px',
                      transition: 'left 150ms',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>

                {aiEnabled && (
                  <>
                    {/* Stats */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '16px',
                    }}>
                      <div style={{
                        flex: 1,
                        padding: '10px 12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                          Conversations
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {settings?.conversationCount ?? 0}
                        </div>
                      </div>
                      <div style={{
                        flex: 1,
                        padding: '10px 12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                          Last analyzed
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {formatLastAnalyzed(settings?.aiLastAnalyzedAt ?? null)}
                        </div>
                      </div>
                    </div>

                    {/* System Prompt */}
                    <div>
                      <button
                        onClick={() => setShowPrompt(!showPrompt)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          height: '36px',
                          padding: '0 12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: showPrompt ? '6px 6px 0 0' : '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            System Prompt
                          </span>
                          <span style={{
                            fontSize: '11px',
                            color: isUsingDefault ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                            background: isUsingDefault ? 'var(--bg-tertiary)' : 'rgba(99, 102, 241, 0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}>
                            {isUsingDefault ? 'Default' : 'Custom'}
                          </span>
                        </div>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          style={{
                            transform: showPrompt ? 'rotate(180deg)' : 'rotate(0)',
                            transition: 'transform 150ms',
                          }}
                        >
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {showPrompt && (
                        <div style={{
                          border: '1px solid var(--border-subtle)',
                          borderTop: 'none',
                          borderRadius: '0 0 6px 6px',
                          overflow: 'hidden',
                        }}>
                          <textarea
                            value={systemPrompt}
                            onChange={(e) => handlePromptChange(e.target.value)}
                            style={{
                              width: '100%',
                              height: '180px',
                              padding: '10px 12px',
                              fontSize: '11px',
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                              lineHeight: 1.5,
                              color: 'var(--text-primary)',
                              background: 'var(--bg-primary)',
                              border: 'none',
                              resize: 'none',
                              outline: 'none',
                            }}
                          />
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            height: '32px',
                            padding: '0 12px',
                            background: 'var(--bg-secondary)',
                            borderTop: '1px solid var(--border-subtle)',
                          }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-quaternary)' }}>
                              {systemPrompt.length.toLocaleString()} chars
                            </span>
                            {!isUsingDefault && (
                              <button
                                onClick={handleResetPrompt}
                                style={{
                                  fontSize: '11px',
                                  color: 'var(--text-tertiary)',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                }}
                              >
                                Reset to default
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                Select a tag to configure
              </span>
            </div>
          )}
        </div>

        {/* Footer - 56px */}
        {selectedTagId && !isLoading && (
          <div style={{
            height: '56px',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '0 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}>
            {hasChanges ? (
              <>
                <button
                  onClick={() => {
                    setHasChanges(false);
                    const tagName = allTags.find(t => t.id === selectedTagId)?.name || '';
                    setAiEnabled(settings?.aiEnabled ?? false);
                    setSystemPrompt(settings?.aiSystemPrompt || getDefaultPrompt(tagName));
                  }}
                  style={{
                    height: '32px',
                    padding: '0 12px',
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
                    height: '32px',
                    padding: '0 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'white',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : aiEnabled ? (
              <button
                onClick={handleAnalyzeNow}
                disabled={isAnalyzing}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  opacity: isAnalyzing ? 0.7 : 1,
                }}
              >
                {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
