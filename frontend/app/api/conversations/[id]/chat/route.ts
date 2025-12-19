import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

// Polyfill DOMMatrix for server-side PDF parsing (required by pdf-parse v2 for some PDFs)
if (typeof globalThis.DOMMatrix === 'undefined') {
  // Simple DOMMatrix polyfill for basic matrix operations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(init?: any) {
      if (init) {
        if (Array.isArray(init)) {
          if (init.length === 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init;
            this.m11 = this.a; this.m12 = this.b;
            this.m21 = this.c; this.m22 = this.d;
            this.m41 = this.e; this.m42 = this.f;
          } else if (init.length === 16) {
            [this.m11, this.m12, this.m13, this.m14,
             this.m21, this.m22, this.m23, this.m24,
             this.m31, this.m32, this.m33, this.m34,
             this.m41, this.m42, this.m43, this.m44] = init;
            this.a = this.m11; this.b = this.m12;
            this.c = this.m21; this.d = this.m22;
            this.e = this.m41; this.f = this.m42;
            this.is2D = false;
          }
        }
        this.isIdentity = this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
      }
    }

    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(point: { x: number; y: number }) { return { x: point.x, y: point.y }; }
    toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
    toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
  };
}

// pdf-parse v2 class-based API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PDFParseModule: { PDFParse: any; VerbosityLevel: any } | null = null;
function getPDFParseModule() {
  if (!PDFParseModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    PDFParseModule = {
      PDFParse: pdfParse.PDFParse,
      VerbosityLevel: pdfParse.VerbosityLevel,
    };
  }
  return PDFParseModule;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Constants for message limits
const STANDARD_MESSAGE_LIMIT = 50;
const DEEP_ANALYSIS_MESSAGE_LIMIT = 500; // Max for deep analysis

/**
 * Extract text content from a file stored in the database
 * Supports: PDF, TXT, MD, JSON, and other text-based files
 */
async function extractFileContent(storageKey: string): Promise<string | null> {
  try {
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { storageKey },
    });

    if (!fileUpload) {
      console.log(`[AI Context] File not found: ${storageKey}`);
      return null;
    }

    // Check if expired
    if (fileUpload.expiresAt && fileUpload.expiresAt < new Date()) {
      console.log(`[AI Context] File expired: ${storageKey}`);
      return null;
    }

    // Get base64 content from metadata
    const metadata = fileUpload.metadata as { base64Content?: string } | null;
    const base64Content = metadata?.base64Content;

    if (!base64Content) {
      console.log(`[AI Context] No content for file: ${storageKey}`);
      return null;
    }

    const buffer = Buffer.from(base64Content, 'base64');
    const mimeType = fileUpload.mimeType.toLowerCase();

    // Handle PDF files using pdf-parse v2
    if (mimeType === 'application/pdf') {
      try {
        const { PDFParse, VerbosityLevel } = getPDFParseModule();
        if (PDFParse) {
          // pdf-parse v2 requires { data: buffer } in constructor
          // Use ERRORS verbosity to reduce noise and avoid DOMMatrix issues with complex PDFs
          const parser = new PDFParse({
            data: buffer,
            verbosity: VerbosityLevel?.ERRORS || 0, // Suppress warnings
          });
          const result = await parser.getText();
          await parser.destroy(); // Clean up

          if (result.text && result.text.trim()) {
            // Clean up the text (remove page markers like "-- 1 of 1 --")
            const extractedText = result.text
              .replace(/\n-- \d+ of \d+ --\n?/g, '\n')
              .trim();
            console.log(`[AI Context] Extracted ${extractedText.length} chars from PDF: ${fileUpload.filename}`);
            return `[PDF: ${fileUpload.filename}]\n${extractedText}`;
          } else {
            console.log(`[AI Context] PDF has no extractable text: ${fileUpload.filename}`);
            return `[PDF: ${fileUpload.filename}] (PDF contains no extractable text - may be image-based)`;
          }
        }
      } catch (pdfError) {
        console.error(`[AI Context] PDF extraction failed for ${fileUpload.filename}:`, pdfError);
        // Return more detailed error info for debugging
        const errorMessage = pdfError instanceof Error ? pdfError.message : 'unknown error';
        return `[PDF: ${fileUpload.filename}] (Unable to extract text - ${errorMessage})`;
      }
    }

    // Handle text-based files
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript'
    ) {
      const text = buffer.toString('utf-8').trim();
      if (text) {
        console.log(`[AI Context] Extracted ${text.length} chars from text file: ${fileUpload.filename}`);
        return `[File: ${fileUpload.filename}]\n${text}`;
      }
    }

    // For other file types, just note the attachment
    console.log(`[AI Context] Non-text file: ${fileUpload.filename} (${mimeType})`);
    return null;
  } catch (error) {
    console.error(`[AI Context] Error extracting file content:`, error);
    return null;
  }
}

/**
 * POST /api/conversations/[id]/chat
 * Interactive AI chat with full conversation context
 * Uses Claude Haiku for fast, cost-effective responses
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { message, chatHistory = [], deepAnalysis = false } = body as {
      message: string;
      chatHistory?: ChatMessage[];
      deepAnalysis?: boolean;
    };

    // Determine message limit based on analysis mode
    const messageLimit = deepAnalysis ? DEEP_ANALYSIS_MESSAGE_LIMIT : STANDARD_MESSAGE_LIMIT;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Get conversation with messages, notes, and tags
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        title: true,
        type: true,
        metadata: true,
        summary: true,
        sentiment: true,
        keyPoints: true,
        // AI analysis fields for context
        aiStatus: true,
        aiAction: true,
        aiSummary: true,
        aiSuggestedAction: true,
        aiUrgencyLevel: true,
        lastTopic: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            notes: true,
            primaryEmail: true,
            primaryPhone: true,
          },
        },
        notes: {
          orderBy: [{ eventAt: 'desc' }, { createdAt: 'desc' }], // Order by when event happened
          take: 50, // Latest 50 notes
        },
        // Tags with their AI context prompts
        tags: {
          include: {
            tag: {
              select: {
                name: true,
                aiEnabled: true,
                aiSystemPrompt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get total message count for context indicator
    const totalMessageCount = await prisma.message.count({
      where: { conversationId },
    });

    // Get messages for context (limited based on analysis mode)
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'desc' },
      take: messageLimit,
      select: {
        body: true,
        direction: true,
        sentAt: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    });

    // Extract notes from metadata (legacy) and new timeline notes
    const metadata = conversation.metadata as Record<string, unknown> | null;
    const legacyNotes = metadata?.notes as string | null;
    const contactNotes = conversation.contact?.notes;
    const timelineNotes = conversation.notes || [];

    // Build context sections
    const contextSections: string[] = [];

    // Conversation info
    contextSections.push(`CONVERSATION: ${conversation.title || 'Unknown'} (${conversation.type})`);

    // Contact info if available
    if (conversation.contact) {
      const contact = conversation.contact;
      const contactName = contact.displayName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        'Unknown';
      contextSections.push(`CONTACT: ${contactName}`);
      if (contact.primaryEmail) contextSections.push(`Email: ${contact.primaryEmail}`);
      if (contact.primaryPhone) contextSections.push(`Phone: ${contact.primaryPhone}`);
    }

    // Tags and relationship type context
    const tags = conversation.tags || [];
    if (tags.length > 0) {
      const tagNames = tags.map(t => t.tag.name);
      contextSections.push(`\nRELATIONSHIP TAGS: ${tagNames.join(', ')}`);

      // Add tag-specific context for the AI to understand relationship type
      const tagContextMap: Record<string, string> = {
        'Churned': 'This is a CHURNED customer. Focus on win-back opportunities, understanding why they left, and what might bring them back.',
        'Customer': 'This is an existing CUSTOMER. Focus on relationship health, support issues, expansion opportunities, and retention.',
        'Customer Groups': 'This is a CUSTOMER GROUP chat. Focus on active support issues, key stakeholders, and team communication dynamics.',
        'Partner': 'This is a PARTNER relationship. Focus on referral potential, network value, and mutual value exchange.',
        'Prospect': 'This is a PROSPECT (sales opportunity). Focus on deal stage, objections, and moving them toward conversion.',
      };

      for (const tagName of tagNames) {
        if (tagContextMap[tagName]) {
          contextSections.push(`TAG CONTEXT: ${tagContextMap[tagName]}`);
        }
      }
    }

    // Legacy/contact notes if any (separate from timeline)
    if (legacyNotes || contactNotes) {
      contextSections.push('\n--- BACKGROUND NOTES ---');
      if (legacyNotes) contextSections.push(`Legacy Notes: ${legacyNotes}`);
      if (contactNotes) contextSections.push(`Contact Notes: ${contactNotes}`);
    }

    // Current AI analysis state (from tag-based analysis)
    if (conversation.aiSummary) {
      contextSections.push('\n--- CURRENT AI ANALYSIS ---');
      contextSections.push(`Current Topic: ${conversation.lastTopic || 'Not set'}`);
      contextSections.push(`Status: ${conversation.aiStatus || 'Unknown'}`);
      contextSections.push(`Recommended Action: ${conversation.aiAction || 'None'}`);
      contextSections.push(`Urgency: ${conversation.aiUrgencyLevel || 'Unknown'}`);
      contextSections.push(`Summary: ${conversation.aiSummary}`);
      if (conversation.aiSuggestedAction) {
        contextSections.push(`Suggested Next Step: ${conversation.aiSuggestedAction}`);
      }
    }

    // Existing AI summary if available (legacy)
    if (conversation.summary && !conversation.aiSummary) {
      contextSections.push('\n--- AI SUMMARY ---');
      contextSections.push(`Summary: ${conversation.summary}`);
      if (conversation.sentiment) {
        contextSections.push(`Sentiment: ${conversation.sentiment}`);
      }
      if (conversation.keyPoints && Array.isArray(conversation.keyPoints)) {
        contextSections.push(`Key Points: ${(conversation.keyPoints as string[]).join(', ')}`);
      }
    }

    // ============================================
    // UNIFIED TIMELINE: Merge messages + notes chronologically
    // ============================================
    interface TimelineEntry {
      type: 'message' | 'note';
      timestamp: Date;
      // Message fields
      direction?: 'inbound' | 'outbound';
      senderName?: string | null;
      body?: string | null;
      // Note fields
      noteType?: string;
      noteTitle?: string | null;
      noteContent?: string;
      noteFileName?: string | null;
      noteFileUrl?: string | null;
    }

    // Convert messages to timeline entries
    const messageEntries: TimelineEntry[] = messages
      .filter(m => m.body && m.body.trim().length > 0)
      .map(m => ({
        type: 'message' as const,
        timestamp: new Date(m.sentAt),
        direction: m.direction === 'outbound' ? 'outbound' as const : 'inbound' as const,
        senderName: m.direction === 'outbound'
          ? 'You'
          : (m.contact?.displayName ||
             [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(' ') ||
             'Contact'),
        body: m.body,
      }));

    // Convert notes to timeline entries (use eventAt for when it happened)
    const noteEntries: TimelineEntry[] = timelineNotes.map(n => ({
      type: 'note' as const,
      timestamp: n.eventAt ? new Date(n.eventAt) : new Date(n.createdAt),
      noteType: n.type,
      noteTitle: n.title,
      noteContent: n.content,
      noteFileName: n.fileName,
      noteFileUrl: n.fileUrl,
    }));

    // Merge and sort chronologically (oldest first)
    const timeline = [...messageEntries, ...noteEntries]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Track files to extract content from
    const fileContentsToExtract: { storageKey: string; fileName: string }[] = [];

    // Format unified timeline
    const timelineLines: string[] = [];
    for (const entry of timeline) {
      const dateStr = entry.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = entry.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      if (entry.type === 'message') {
        // Message: use → for outbound, ← for inbound
        const arrow = entry.direction === 'outbound' ? '→' : '←';
        timelineLines.push(`[${dateStr} ${timeStr}] ${arrow} ${entry.senderName}: ${entry.body}`);
      } else {
        // Note: use emoji based on type
        const noteEmoji = entry.noteType === 'meeting' ? '📅'
          : entry.noteType === 'call' ? '📞'
          : entry.noteType === 'file' ? '📎'
          : '📝';
        const titlePart = entry.noteTitle ? ` "${entry.noteTitle}"` : '';
        const filePart = entry.noteFileName ? ` [File: ${entry.noteFileName}]` : '';
        timelineLines.push(`[${dateStr} ${timeStr}] ${noteEmoji} NOTE${titlePart}${filePart}: ${entry.noteContent}`);

        // Collect files for content extraction
        if (entry.noteFileUrl && entry.noteFileName) {
          fileContentsToExtract.push({
            storageKey: entry.noteFileUrl,
            fileName: entry.noteFileName,
          });
        }
      }
    }

    // Add unified timeline to context
    contextSections.push('\n--- CONVERSATION TIMELINE (Messages + Notes) ---');
    contextSections.push('Legend: → = You sent, ← = They sent, 📝/📅/📞/📎 = Internal notes');
    contextSections.push(timelineLines.join('\n') || 'No messages or notes available');

    // Extract file contents and add to context
    if (fileContentsToExtract.length > 0) {
      contextSections.push('\n--- ATTACHED FILE CONTENTS ---');
      contextSections.push('(The following are the actual contents of files attached to notes)\n');

      for (const file of fileContentsToExtract) {
        const fileContent = await extractFileContent(file.storageKey);
        if (fileContent) {
          contextSections.push(fileContent);
          contextSections.push(''); // Empty line between files
        } else {
          contextSections.push(`[${file.fileName}] (Binary or unsupported file format - content not available)`);
        }
      }
    }

    // Build the system prompt
    const systemPrompt = `You are an intelligent CRM assistant helping a user understand and manage their conversation with a contact. You have access to:
- UNIFIED TIMELINE: Messages and notes merged chronologically, showing the complete picture
- Attached file contents (PDF text, documents, etc.)
- Contact information and current AI analysis
- Relationship tags (Customer, Partner, Prospect, Churned, etc.)

UNDERSTANDING THE TIMELINE:
The timeline shows messages and notes in chronological order:
- → = Outbound message (you/team sent)
- ← = Inbound message (contact sent)
- 📝 = Internal note (context/observations)
- 📅 = Meeting note (meeting summary)
- 📞 = Call note (call summary)
- 📎 = File attachment (document attached)

Notes are internal context placed at their ACTUAL EVENT TIME (e.g., a meeting note backdated to when the meeting happened), not when the note was added. Use notes to understand offline discussions, meetings, and internal context.

Your role is to:
1. Answer questions using the COMPLETE timeline (messages + notes together)
2. Understand that notes provide context for what happened between messages
3. Provide insights tailored to the relationship stage (customer health, deal progress, partner value, etc.)
4. Help prepare for follow-ups or calls with full context from both messages AND notes
5. Suggest appropriate responses considering the complete relationship history
6. Answer questions about attached files using the extracted content provided
7. Reference the current AI analysis to provide consistent, up-to-date recommendations

TAG-AWARE RESPONSES:
- For CUSTOMERS: Focus on support, satisfaction, retention, and expansion opportunities
- For PROSPECTS: Focus on deal stage, objections, closing strategies
- For PARTNERS: Focus on referral potential, network value, relationship nurturing
- For CHURNED: Focus on win-back opportunities and understanding departure reasons
- For CUSTOMER GROUPS: Focus on group dynamics, key stakeholders, and active issues

IMPORTANT: When the user asks about attached files, you DO have access to their contents - the text has been extracted and included in the context below. Reference the actual content, not just the filename.

Be concise but thorough. When referencing events, consider BOTH messages AND notes as part of the complete story.

CONTEXT:
${contextSections.join('\n')}`;

    // Build messages array for Claude
    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    // Add chat history
    for (const msg of chatHistory.slice(-10)) { // Last 10 messages for context
      claudeMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current message
    claudeMessages.push({
      role: 'user',
      content: message,
    });

    // Call Claude Haiku for fast response
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract response text
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Calculate actual messages used (after filtering empty ones)
    const messagesUsed = Math.min(messages.length, messageLimit);

    return NextResponse.json({
      success: true,
      data: {
        response: content.text,
        model: 'claude-3-5-haiku',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        context: {
          messagesUsed,
          totalMessages: totalMessageCount,
          deepAnalysis,
        },
      },
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
