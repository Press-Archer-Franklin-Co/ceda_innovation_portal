// Posts the visitor has opened, so a fresh item shows its red dot only until it is opened (1.6).
// Kept in localStorage on this device only; nothing is sent to the server.

const KEY = 'ceda_opened_posts'
const MAX = 300

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isOpened(id: string): boolean {
  return read().includes(id)
}

export function markOpened(id: string) {
  try {
    const list = read().filter((x) => x !== id)
    list.unshift(id)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Private mode: the dot simply stays.
  }
}
