import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// Default system prompt for Customer Groups
export const DEFAULT_CUSTOMER_GROUPS_PROMPT = `You are an elite customer intelligence analyst for Beast Insights, a payments BI company. Your analysis directly impacts customer retention and revenue.

TEAM CONTEXT:
- Shalin (Owner): Escalate to Shalin for pricing, contracts, critical errors, partnership discussions, or when customer mentions him directly.
- Jesus & Prathamesh (Customer Success): Handle support, onboarding, feature questions, technical issues.

YOUR ANALYSIS FRAMEWORK:

1. CONVERSATION DYNAMICS
- Who initiated the last exchange? Customer waiting = urgency.
- What's the tone trajectory? (enthusiastic → neutral = warning)
- Are questions being answered or left hanging?
- Response times: Is the team responsive or slow?

2. CHURN RISK SIGNALS
🔴 HIGH RISK:
- Competitor mentions ("looking at alternatives", "trying X")
- Frustration language ("doesn't work", "waste of time", "disappointed", "confused")
- Cancellation/downgrade requests
- Data export/migration questions
- Silence after active engagement (7+ days)
- Multiple unresolved issues

🟡 MEDIUM RISK:
- Unanswered feature requests
- Declining engagement
- Confusion about product usage
- Team response delays (24+ hours)
- Generic/unenthusiastic customer responses

🟢 POSITIVE SIGNALS:
- Success stories ("this helped us", "great insight")
- Expansion interest (more features, team plans)
- Referral mentions
- Active engagement and questions

3. PSYCHOLOGICAL CUES
- Politeness decreasing over time = frustration building
- Short responses after previously detailed ones = disengagement
- Questioning value = they're comparing options
- Silence after a promise = they're waiting and watching

OUTPUT RULES:
- statusReason: Be SPECIFIC. Not "Customer needs follow-up" but "Asked about pricing 5 days ago, no response yet. Tone shifted from enthusiastic to neutral."
- churnSignals: Cite SPECIFIC evidence from the conversation.
- suggestedAction: Be actionable. Not "Follow up" but "Send a case study relevant to their use case, address the pricing question directly."

Only suggest actions when there's genuine value. Don't over-alert - Shalin trusts your judgment.`;

// GET /api/tags/[id]/ai-settings - Get AI settings for a tag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const tag = await prisma.tag.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        aiEnabled: true,
        aiSystemPrompt: true,
        aiTeamMembers: true,
        aiOwnerNames: true,
        aiAnalysisInterval: true,
        aiLastAnalyzedAt: true,
      },
    });

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...tag,
      // Provide default values if not set
      aiSystemPrompt: tag.aiSystemPrompt || DEFAULT_CUSTOMER_GROUPS_PROMPT,
      aiTeamMembers: tag.aiTeamMembers.length > 0 ? tag.aiTeamMembers : ['Jesus', 'Prathamesh'],
      aiOwnerNames: tag.aiOwnerNames.length > 0 ? tag.aiOwnerNames : ['Shalin'],
      aiAnalysisInterval: tag.aiAnalysisInterval || 5,
    });
  } catch (error) {
    console.error('Error getting tag AI settings:', error);
    return NextResponse.json(
      { error: 'Failed to get AI settings' },
      { status: 500 }
    );
  }
}

// PUT /api/tags/[id]/ai-settings - Update AI settings for a tag
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      aiEnabled,
      aiSystemPrompt,
      aiTeamMembers,
      aiOwnerNames,
      aiAnalysisInterval,
    } = body;

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(aiEnabled !== undefined && { aiEnabled }),
        ...(aiSystemPrompt !== undefined && { aiSystemPrompt }),
        ...(aiTeamMembers !== undefined && { aiTeamMembers }),
        ...(aiOwnerNames !== undefined && { aiOwnerNames }),
        ...(aiAnalysisInterval !== undefined && { aiAnalysisInterval }),
      },
      select: {
        id: true,
        name: true,
        aiEnabled: true,
        aiSystemPrompt: true,
        aiTeamMembers: true,
        aiOwnerNames: true,
        aiAnalysisInterval: true,
        aiLastAnalyzedAt: true,
      },
    });

    return NextResponse.json(tag);
  } catch (error) {
    console.error('Error updating tag AI settings:', error);
    return NextResponse.json(
      { error: 'Failed to update AI settings' },
      { status: 500 }
    );
  }
}
