// Test data only, in the real shape of GET /api/analytics/chat/ (prompt 53). Never imported by a screen.
export const chatReportFixture = {
  totals: { started: 128, answered: 113, not_answered: 15, outside_hours: 22, escalated: 7, closed: 110, open_now: 2 },
  first_reply_minutes: { median: 4, average: 6, within_5_min_pct: 71.2 },
  chat_length_minutes: { median: 12 },
  satisfaction: { average: 4.4, rated: 61, by_score: { 1: 2, 2: 3, 3: 6, 4: 15, 5: 35 } },
  by_channel: [
    { channel: 'web', started: 74, answered: 69 },
    { channel: 'whatsapp', started: 38, answered: 32 },
    { channel: 'ussd', started: 9, answered: 7 },
    { channel: 'ai', started: 7, answered: 5 },
  ],
  per_day: [
    { date: '2026-11-20', started: 9, answered: 8 },
    { date: '2026-11-21', started: 14, answered: 12 },
    { date: '2026-11-22', started: 6, answered: 5 },
    { date: '2026-11-23', started: 11, answered: 10 },
  ],
  busiest_hours: [
    { weekday: 0, hour: 9, started: 6 },
    { weekday: 1, hour: 10, started: 12 },
    { weekday: 1, hour: 11, started: 8 },
    { weekday: 3, hour: 14, started: 5 },
    { weekday: 4, hour: 16, started: 3 },
  ],
  agents: [
    { id: 'u1', name: 'Kago Tau', handled: 64, median_first_reply_minutes: 3, average_satisfaction: 4.6, open_now: 2 },
    { id: 'u2', name: 'Lorato Sebina', handled: 49, median_first_reply_minutes: 80, average_satisfaction: null, open_now: 0 },
  ],
  live_chat_on: true,
  filters: { from: '2026-10-25', to: '2026-11-23', channel: null },
}

// No chats in the period: counts are real 0s, per_day is zero-filled, and anything with nothing behind it is null.
export const chatReportEmpty = {
  totals: { started: 0, answered: 0, not_answered: 0, outside_hours: 0, escalated: 0, closed: 0, open_now: 0 },
  first_reply_minutes: { median: null, average: null, within_5_min_pct: null },
  chat_length_minutes: { median: null },
  satisfaction: { average: null, rated: 0, by_score: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  by_channel: [{ channel: 'web', started: 0, answered: 0 }],
  per_day: [{ date: '2026-11-22', started: 0, answered: 0 }, { date: '2026-11-23', started: 0, answered: 0 }],
  busiest_hours: [],
  agents: [],
  live_chat_on: false,
  filters: { from: '2026-11-22', to: '2026-11-23', channel: null },
}
