// AI Prompts for Inbox Zero Dashboard
// Based on Speech Act Theory, Turn-Taking Analysis, and Conversation Intelligence best practices
// References: Searle's Speech Acts, Gong/Chorus CI platforms, Superhuman prioritization

export const TRIAGE_PROMPT = `You are an expert conversation analyst. Determine if USER needs to take action NOW.

CONTACT TAG: {tag}
CONVERSATION TYPE: {type}

=== SPEECH ACT TYPES ===
- DIRECTIVE: Request/question requiring USER action ("Can you...", "please let me know...", "when will...")
- COMMISSIVE: Promise/commitment ("I'll send...", "Will do", "yes, will do")
- EXPRESSIVE: Acknowledgment ("Thanks", "ok", "coming", "yes", "agreed", "ty", "👍")
- ASSERTIVE: Information/statement ("Done", "Here's the link", "The meeting is at 3pm")

=== TURN-TAKING RULES ===

USER should NOT respond (→ CLEAR) when:
- THEM sent EXPRESSIVE ("ok", "thanks", "coming", "yes", "ty bro") after USER delivered/confirmed something
- Conversation concluded: meeting confirmed, task done, agreement reached
- USER asked question and THEM answered - exchange complete
- Final messages are acknowledgments with no new request

USER MUST respond (→ RESPOND) when:
- THEM sent DIRECTIVE that USER hasn't addressed yet
- USER made COMMISSIVE ("yes, will do", "I'll fix it") that's NOT fulfilled yet
- THEM is explicitly waiting on USER: "please let me know when...", "can you..."

REVIEW is RARE - Use sparingly for genuinely ambiguous cases:
- FYI updates that MIGHT need acknowledgment (uncertain)
- USER sent something and it's unclear if THEM will respond
- Genuinely ambiguous situations where bucket is unclear

DO NOT use REVIEW for:
- Group messages where USER isn't directly involved → CLEAR
- Simple informational messages → CLEAR
- Conversations that have natural conclusion → CLEAR
- Clear requests/questions → RESPOND

BIAS: When uncertain between REVIEW and CLEAR → choose CLEAR
BIAS: When uncertain between REVIEW and RESPOND → choose RESPOND

=== CRITICAL PATTERNS ===

CLEAR patterns (conversation concluded):
- "coming" / "yes" after USER confirmed meeting details
- "ok thank you" / "ty bro" after USER provided info/help
- "agreed" / "sounds good" after USER's proposal
- "Done" after USER asked them to do something

RESPOND patterns (USER must act):
- "please let me know when [X]" - THEM waiting on USER
- "can you [do X]" - unfulfilled request
- USER said "yes, will do" or "I'll [X]" but hasn't delivered
- THEM asked question USER hasn't answered

=== PRIORITY SCORING ===
8-10: Customer issues, urgent requests, complaints
6-7: Direct requests/questions awaiting USER response
4-5: USER made commitment not yet fulfilled
1-3: FYI, concluded conversations

If triagePreference is "auto_clear" → always CLEAR
If triagePreference is "auto_review" → always REVIEW

Output ONLY valid JSON (no markdown):
{
  "bucket": "respond" | "review" | "clear",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation (max 15 words)",
  "isDirectMention": boolean,
  "isQuestion": boolean,
  "isComplaint": boolean,
  "priorityScore": 1-10,
  "conversationState": "waiting_on_them" | "waiting_on_you" | "concluded" | "ongoing",
  "suggestedAction": "reply" | "follow_up" | "wait" | "close" | null,
  "openLoops": ["unfulfilled requests/commitments if any"],
  "lastSpeechAct": "directive" | "commissive" | "assertive" | "expressive"
}`;

export const DRAFT_REPLY_PROMPT = `Generate a contextually appropriate Telegram reply.

=== CRITICAL: UNDERSTAND THE CONVERSATION STATE FIRST ===

LAST MESSAGE SENDER: {lastMessageDirection}
CONVERSATION STATE: {conversationState}

BEFORE GENERATING A REPLY, CHECK:
1. What did the USER (YOU) last say? Don't repeat or contradict it.
2. What commitments has the USER already made? Don't suggest them again.
3. Has the conversation been resolved? If yes, DON'T generate a reply that reopens it.

COMMON MISTAKES TO AVOID:
- User already sent a meeting link → DON'T suggest sending a meeting link
- User already provided pricing → DON'T suggest sending pricing
- User said "let's connect in an hour" → DON'T suggest scheduling a call
- They said "ok thank you" → This is acknowledgment, maybe no reply needed
- User is waiting for THEIR response → Generate a follow-up, not a new offer

=== CONTEXT ===

USER'S WRITING STYLE (from their recent messages):
{userStyleSamples}

TONE: {tone}
- casual: Friendly, occasional emoji, relaxed
- professional: Formal but warm, concise
- warm: Caring, personal interest
- empathetic: Understanding, supportive

RELATIONSHIP TAG: {tag}

WHAT USER HAS ALREADY COMMITTED TO IN THIS CONVERSATION:
{userCommitments}

CONVERSATION HISTORY (RECENT):
{lastMessages}

=== WHAT TO GENERATE ===

Based on conversation state:
- IF "waiting_on_them": Generate a gentle follow-up or nothing
- IF "waiting_on_you": Generate response to their unanswered question/request
- IF "concluded": Generate nothing or a brief closing (if needed)
- IF "ongoing": Generate appropriate next message

Generate a reply that:
1. Is contextually appropriate given what USER already said
2. Does NOT repeat commitments already made
3. Matches user's writing style
4. Moves conversation forward (not sideways or backward)
5. Is actionable and specific

If no reply is needed (conversation concluded), output: [NO_REPLY_NEEDED]

Output ONLY the reply text, nothing else.`;

export const COMMITMENT_PROMPT = `Extract commitments from messages.

A commitment is a promise to do something:
- "I'll send the proposal tomorrow"
- "Let me check and get back"
- "We'll have this ready by Friday"

USER'S NAME/USERNAME: {userName}

MESSAGES:
{messages}

Output ONLY valid JSON (no markdown, no explanation):
{
  "commitments": [
    {
      "content": "What was promised (short summary)",
      "extractedFrom": "Exact quote from message",
      "direction": "outbound" (user promised) | "inbound" (they promised),
      "dueDate": "ISO date string or null",
      "confidence": 0.0-1.0
    }
  ]
}

Only extract clear, actionable commitments. Return empty array if none found.`;

export const TAG_SUGGESTION_PROMPT = `Suggest a tag for this conversation based on signals.

AVAILABLE TAGS:
{availableTags}

CONVERSATION:
{conversationContext}

SIGNALS TO LOOK FOR:
- Hot Lead: Pricing questions, timeline discussions, buying signals
- Prospect: Product interest, feature questions, general inquiry
- Customer: Support requests, feedback, usage questions
- Partner: Collaboration discussion, mutual benefit talk

Output ONLY valid JSON (no markdown, no explanation):
{
  "suggestedTagId": "tag_id or null",
  "reason": "Brief explanation (max 15 words)",
  "confidence": 0.0-1.0,
  "signalType": "buying_signal" | "relationship" | "intent" | null
}

Return null suggestedTagId if confidence < 0.7 or no clear signal.`;

// Helper function to format messages for prompts with timestamps and context
export function formatMessagesForPrompt(messages: Array<{
  direction: string;
  body: string | null;
  sentAt: Date;
}>): string {
  // Take last 20 messages for more context
  const recentMessages = messages.slice(-20).reverse(); // Chronological order

  let output = '';
  let lastDirection = '';
  let messageIndex = 1;

  for (const m of recentMessages) {
    const timeAgo = getRelativeTime(m.sentAt);
    const speaker = m.direction === 'outbound' ? 'YOU' : 'THEM';
    const body = m.body || '[media/attachment]';

    // Add visual separator when speaker changes
    if (lastDirection && lastDirection !== m.direction) {
      output += '---\n';
    }

    output += `[${messageIndex}] [${speaker}] (${timeAgo}): ${body}\n`;
    lastDirection = m.direction;
    messageIndex++;
  }

  // Add analysis hints at the end
  const lastMsg = recentMessages[recentMessages.length - 1];
  const lastSpeaker = lastMsg?.direction === 'outbound' ? 'YOU' : 'THEM';
  output += `\n=== LAST MESSAGE SENT BY: ${lastSpeaker} ===`;

  return output;
}

// Get relative time string
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffDays}d ago`;
}

// Get last message direction and time context
export function getLastMessageContext(messages: Array<{
  direction: string;
  sentAt: Date;
}>): { lastMessageDirection: string; timeSinceLastMessage: string } {
  if (messages.length === 0) {
    return { lastMessageDirection: 'unknown', timeSinceLastMessage: 'unknown' };
  }
  const lastMessage = messages[0]; // Assuming sorted desc
  return {
    lastMessageDirection: lastMessage.direction === 'outbound' ? 'YOU (user)' : 'THEM (contact)',
    timeSinceLastMessage: getRelativeTime(lastMessage.sentAt),
  };
}

// Extract user's commitments from messages for context
export function extractUserCommitmentsFromMessages(messages: Array<{
  direction: string;
  body: string | null;
}>): string {
  const outboundMessages = messages
    .filter(m => m.direction === 'outbound' && m.body)
    .map(m => m.body as string);

  // Look for commitment patterns in user's messages
  const commitmentPatterns = [
    /I('ll| will) (send|share|get|provide|check|look into|follow up|ping|email)/gi,
    /let me (send|share|get|provide|check|look into)/gi,
    /(sending|sharing) (you|the|a)/gi,
    /will (do|send|share|get|ping|email|call)/gi,
    /I('ll| will) (connect|call|schedule|set up)/gi,
  ];

  const commitments: string[] = [];
  for (const msg of outboundMessages) {
    for (const pattern of commitmentPatterns) {
      const matches = msg.match(pattern);
      if (matches) {
        // Add context around the match
        commitments.push(`"${msg.slice(0, 100)}${msg.length > 100 ? '...' : ''}"`);
        break;
      }
    }
  }

  if (commitments.length === 0) {
    return 'None detected';
  }
  return commitments.slice(0, 3).join('\n');
}

// Helper to get tag name from conversation tags
export function getTagName(tags: Array<{ tag: { name: string } }>): string {
  if (tags.length === 0) return 'Untagged';
  const tagName = tags[0].tag.name.toLowerCase();
  if (tagName.includes('hot lead')) return 'Hot Lead';
  if (tagName.includes('prospect')) return 'Prospect';
  if (tagName.includes('customer')) return 'Customer';
  if (tagName.includes('partner')) return 'Partner';
  return tags[0].tag.name;
}

// Parse JSON from AI response (handles markdown code blocks)
export function parseAIResponse<T>(text: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }
    // Try finding raw JSON object
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Fall through
      }
    }
    return null;
  }
}
