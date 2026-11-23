// Test data only, in the shape asked for in R-85. Never imported by a screen.
export const chatReportFixture = {
  live_chat_on: true,
  totals: { started: 128, answered: 113, answered_pct: 88.3, median_first_reply_minutes: 4, average_rating: 4.4, rated_count: 61, outside_hours: 22, escalated: 7 },
  per_day: [
    { date: '2026-11-20', started: 9, answered: 8 },
    { date: '2026-11-21', started: 14, answered: 12 },
    { date: '2026-11-22', started: 6, answered: 5 },
    { date: '2026-11-23', started: 11, answered: 10 },
  ],
  by_channel: [
    { channel: 'web', started: 74, answered: 69 },
    { channel: 'whatsapp', started: 38, answered: 32 },
    { channel: 'ussd', started: 9, answered: 7 },
    { channel: 'ai', started: 7, answered: 5 },
  ],
  busiest: [
    { weekday: 0, hour: 9, chats: 6 },
    { weekday: 1, hour: 10, chats: 12 },
    { weekday: 1, hour: 11, chats: 8 },
    { weekday: 3, hour: 14, chats: 5 },
    { weekday: 4, hour: 16, chats: 3 },
  ],
  ratings: [{ stars: 1, count: 2 }, { stars: 2, count: 3 }, { stars: 3, count: 6 }, { stars: 4, count: 15 }, { stars: 5, count: 35 }],
  answerers: [
    { id: 'u1', name: 'Kago Tau', chats_handled: 64, median_first_reply_minutes: 3, average_rating: 4.6, open_now: 2 },
    { id: 'u2', name: 'Lorato Sebina', chats_handled: 49, median_first_reply_minutes: 80, average_rating: null, open_now: 0 },
  ],
}

export const chatReportEmpty = {
  live_chat_on: false,
  totals: { started: 0, answered: 0, answered_pct: null, median_first_reply_minutes: null, average_rating: null, rated_count: 0, outside_hours: 0, escalated: 0 },
  per_day: [], by_channel: [], busiest: [], ratings: [], answerers: [],
}
