/**
 * providers/calendar.ts
 * Google Calendar provider — list and create calendar events.
 * Uses short-lived tokens from Auth0 Token Vault.
 */

const USE_MOCK = process.env.MOCK_PROVIDERS === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_EVENTS = [
  {
    id: 'evt_001',
    summary: 'Q2 Roadmap Review',
    start: '2026-03-27T10:00:00Z',
    end: '2026-03-27T11:00:00Z',
    attendees: ['alice@example.com', 'bob@example.com'],
    location: 'Zoom',
  },
  {
    id: 'evt_002',
    summary: 'Auth0 Hackathon Live Demo',
    start: '2026-03-28T14:00:00Z',
    end: '2026-03-28T15:00:00Z',
    attendees: ['judges@auth0.com'],
    location: 'Google Meet',
  },
  {
    id: 'evt_003',
    summary: '1:1 with Engineering Lead',
    start: '2026-03-29T09:00:00Z',
    end: '2026-03-29T09:30:00Z',
    attendees: [],
    location: '',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: string[];
  location: string;
}

export interface CreateEventParams {
  summary: string;
  start: string;
  end: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List upcoming calendar events.
 * Minimum required scope: calendar.events.readonly
 */
export async function listCalendarEvents(
  token: string,
  maxResults = 10
): Promise<CalendarEvent[]> {
  if (USE_MOCK) {
    await simulateLatency();
    return MOCK_EVENTS;
  }

  const now = new Date().toISOString();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(now)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = (await res.json()) as {
    items: Array<{
      id: string;
      summary: string;
      start: { dateTime: string };
      end: { dateTime: string };
      attendees?: Array<{ email: string }>;
      location?: string;
    }>;
  };

  return (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(no title)',
    start: e.start.dateTime,
    end: e.end.dateTime,
    attendees: (e.attendees ?? []).map((a) => a.email),
    location: e.location ?? '',
  }));
}

/**
 * Create a new calendar event.
 * Minimum required scope: calendar.events
 */
export async function createCalendarEvent(
  token: string,
  params: CreateEventParams
): Promise<CalendarEvent> {
  if (USE_MOCK) {
    await simulateLatency(500);
    return {
      id: `mock_evt_${Date.now()}`,
      summary: params.summary,
      start: params.start,
      end: params.end,
      attendees: params.attendees ?? [],
      location: params.location ?? '',
    };
  }

  const body = {
    summary: params.summary,
    description: params.description,
    location: params.location,
    start: { dateTime: params.start },
    end: { dateTime: params.end },
    attendees: (params.attendees ?? []).map((email) => ({ email })),
  };

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Calendar create error: ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    summary: string;
    start: { dateTime: string };
    end: { dateTime: string };
    attendees?: Array<{ email: string }>;
    location?: string;
  };

  return {
    id: data.id,
    summary: data.summary,
    start: data.start.dateTime,
    end: data.end.dateTime,
    attendees: (data.attendees ?? []).map((a) => a.email),
    location: data.location ?? '',
  };
}

function simulateLatency(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
