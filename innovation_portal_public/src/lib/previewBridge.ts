/**
 * Staff console previews (U5 form preview, U6 home page preview). The staff console shows a
 * public page in an iframe and posts draft content to it. Messages are accepted only from this
 * site's origin (the console is served under /staff) or the staff origin in VITE_STAFF_SITE_URL
 * for local development, and only from the parent window.
 */
const STAFF_ORIGIN = (import.meta.env.VITE_STAFF_SITE_URL as string | undefined)?.replace(/\/$/, '')

export function isStaffOrigin(origin: string): boolean {
  if (origin === window.location.origin) return true
  if (!STAFF_ORIGIN) return false
  try {
    return origin === new URL(STAFF_ORIGIN).origin
  } catch {
    return false
  }
}

/** Where to post messages back to the staff console. */
export function staffOrigin(): string {
  try {
    return STAFF_ORIGIN ? new URL(STAFF_ORIGIN).origin : window.location.origin
  } catch {
    return window.location.origin
  }
}

/** Tell the console the preview is listening. Does nothing outside an iframe. */
export function postToStaff(message: Record<string, unknown>): void {
  if (window.parent !== window) window.parent.postMessage(message, staffOrigin())
}
