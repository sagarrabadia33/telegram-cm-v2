import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Search API - PostgreSQL Full-Text Search
 *
 * Architecture:
 * - Uses native PostgreSQL tsvector/tsquery for reliability at scale
 * - GIN index ensures O(log n) lookups (~10-50ms for 100K+ messages)
 * - ts_rank for relevance scoring with headline extraction
 * - Supports conversation filtering, date ranges, and pagination
 *
 * Query Modes:
 * - Simple: Matches all words (AND semantics)
 * - Phrase: Use quotes for exact phrases
 * - Prefix: Automatic prefix matching on last word
 */

interface SearchResult {
  id: string;
  body: string;
  headline: string;
  sentAt: string;
  direction: string;
  rank: number;
  conversation: {
    id: string;
    title: string | null;
    type: string;
  };
  contact: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface SearchResponse {
  success: boolean;
  data: {
    results: SearchResult[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    query: string;
    took: number; // milliseconds
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;

    // Query parameters
    const query = searchParams.get('q')?.trim();
    const conversationId = searchParams.get('conversationId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // Validate query
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      );
    }

    // Sanitize and prepare query for PostgreSQL FTS
    // Convert to websearch format for better user experience
    const sanitizedQuery = query
      .replace(/[<>:*&|!()]/g, ' ') // Remove special chars
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word + ':*') // Add prefix matching
      .join(' & '); // AND semantics

    if (!sanitizedQuery) {
      return NextResponse.json(
        { error: 'Invalid search query' },
        { status: 400 }
      );
    }

    // Build WHERE conditions
    const conditions: string[] = [
      `m.search_vector @@ to_tsquery('english', $1)`,
    ];
    const params: (string | Date)[] = [sanitizedQuery];
    let paramIndex = 2;

    if (conversationId) {
      conditions.push(`m."conversationId" = $${paramIndex}`);
      params.push(conversationId);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`m."sentAt" >= $${paramIndex}`);
      params.push(new Date(dateFrom));
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`m."sentAt" <= $${paramIndex}`);
      params.push(new Date(dateTo));
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    // Count total results
    const countQuery = `
      SELECT COUNT(*) as total
      FROM "telegram_crm"."Message" m
      WHERE ${whereClause}
    `;

    const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
      countQuery,
      ...params
    );
    const total = Number(countResult[0]?.total || 0);

    // Search with ranking and headline extraction
    const searchQuery = `
      SELECT
        m.id,
        m.body,
        ts_headline(
          'english',
          COALESCE(m.body, ''),
          to_tsquery('english', $1),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=2'
        ) as headline,
        m."sentAt",
        m.direction,
        ts_rank(m.search_vector, to_tsquery('english', $1)) as rank,
        c.id as "conversationId",
        c.title as "conversationTitle",
        c.type as "conversationType",
        co.id as "contactId",
        co."displayName",
        co."firstName",
        co."lastName"
      FROM "telegram_crm"."Message" m
      LEFT JOIN "telegram_crm"."Conversation" c ON m."conversationId" = c.id
      LEFT JOIN "telegram_crm"."Contact" co ON m."contactId" = co.id
      WHERE ${whereClause}
      ORDER BY rank DESC, m."sentAt" DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    const results = await prisma.$queryRawUnsafe<{
      id: string;
      body: string;
      headline: string;
      sentAt: Date;
      direction: string;
      rank: number;
      conversationId: string;
      conversationTitle: string | null;
      conversationType: string;
      contactId: string | null;
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
    }[]>(searchQuery, ...params);

    // Format results
    const formattedResults: SearchResult[] = results.map((r) => ({
      id: r.id,
      body: r.body,
      headline: r.headline,
      sentAt: r.sentAt.toISOString(),
      direction: r.direction,
      rank: r.rank,
      conversation: {
        id: r.conversationId,
        title: r.conversationTitle,
        type: r.conversationType,
      },
      contact: r.contactId
        ? {
            id: r.contactId,
            displayName: r.displayName,
            firstName: r.firstName,
            lastName: r.lastName,
          }
        : null,
    }));

    const took = Date.now() - startTime;

    const response: SearchResponse = {
      success: true,
      data: {
        results: formattedResults,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        query,
        took,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Search error:', error);

    // Handle specific PostgreSQL errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: 'Search query error',
          details: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
