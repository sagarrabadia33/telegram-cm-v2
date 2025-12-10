import { NextResponse } from 'next/server';
import { getDashboardMetrics } from '@/app/lib/analytics/server';
import Anthropic from '@anthropic-ai/sdk';
import { AISuggestion } from '@/app/lib/analytics/types';

const anthropic = new Anthropic();

export async function GET() {
  try {
    const metrics = await getDashboardMetrics();

    // Build context for AI
    const context = `
You are a product analytics expert analyzing usage data for a Telegram CRM application.
The main features are: Tagging contacts, AI Assistant for message drafting, and Notes section.

Here is the current analytics data (last 30 days):

SESSIONS:
- Total sessions: ${metrics.sessions.totalSessions}
- Average session duration: ${formatDuration(metrics.sessions.avgSessionDurationMs)}
- Sessions today: ${metrics.sessions.sessionsToday}
- Sessions this week: ${metrics.sessions.sessionsThisWeek}

PAGE TIME DISTRIBUTION:
- Messages page: ${metrics.pageTime.messagesPagePercent}%
- Contacts page: ${metrics.pageTime.contactsPagePercent}%

ACTIONS BY PAGE:
Messages page - ${metrics.actionsByPage.messages.totalActions} total actions
Top actions: ${metrics.actionsByPage.messages.topActions.map(a => `${a.description}: ${a.count}`).join(', ')}

Contacts page - ${metrics.actionsByPage.contacts.totalActions} total actions
Top actions: ${metrics.actionsByPage.contacts.topActions.map(a => `${a.description}: ${a.count}`).join(', ')}

CORE FEATURES USAGE:

Tags:
- Tags assigned: ${metrics.coreFeatures.tags.totalAssigned}
- Tags created: ${metrics.coreFeatures.tags.totalCreated}
- Tags removed: ${metrics.coreFeatures.tags.totalRemoved}
- Bulk tag operations: ${metrics.coreFeatures.tags.bulkTagOperations}

AI Assistant:
- AI prompts submitted: ${metrics.coreFeatures.ai.totalPrompts}
- AI responses received: ${metrics.coreFeatures.ai.totalResponses}
- Success rate: ${metrics.coreFeatures.ai.successRate}%
- Average response time: ${metrics.coreFeatures.ai.avgResponseTimeMs}ms

Notes:
- Notes created: ${metrics.coreFeatures.notes.totalCreated}
- Notes edited: ${metrics.coreFeatures.notes.totalEdited}
- Notes deleted: ${metrics.coreFeatures.notes.totalDeleted}
- Files attached: ${metrics.coreFeatures.notes.filesAttached}

ERRORS:
- Total errors: ${metrics.errors.totalErrors}
${metrics.errors.errorsByType.map(e => `- ${e.errorType}: ${e.count} occurrences (last: ${new Date(e.lastOccurred).toLocaleDateString()})`).join('\n')}

WEEKLY STATS:
- Conversations opened: ${metrics.week.conversationsOpened}
- Messages sent: ${metrics.week.messagesSent}
- Searches performed: ${metrics.week.searchesPerformed}
- Filters applied: ${metrics.week.filtersApplied}

Based on this data, provide 3-5 actionable suggestions for product improvements, features to build, or issues to fix. Focus on:
1. Features that are underutilized and might need better UX
2. Errors that need fixing
3. New features based on usage patterns
4. Performance improvements if needed

Return your response as a JSON array with objects having these fields:
- id: unique string id
- type: "feature" | "fix" | "improvement" | "insight"
- title: short title (max 50 chars)
- description: detailed explanation (2-3 sentences)
- priority: "high" | "medium" | "low"
- basedOn: what data this suggestion is based on

Return ONLY the JSON array, no other text.
`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: context,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse JSON from response
    let suggestions: AISuggestion[];
    try {
      // Try to extract JSON from the response
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(textContent.text);
      }
    } catch {
      console.error('Failed to parse AI response:', textContent.text);
      suggestions = [
        {
          id: 'fallback-1',
          type: 'insight',
          title: 'Unable to generate suggestions',
          description: 'The AI was unable to analyze the data at this time. Please try again.',
          priority: 'low',
          basedOn: 'Error in AI response parsing',
        },
      ];
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Analytics suggestions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions', suggestions: [] },
      { status: 500 }
    );
  }
}

function formatDuration(ms: number): string {
  if (ms === 0) return 'No data';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
