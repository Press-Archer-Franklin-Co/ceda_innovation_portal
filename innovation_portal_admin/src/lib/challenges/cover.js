/** Rules for a challenge cover picture, matching the media library's image limits. */
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const COVER_MAX_BYTES = 10 * 1024 * 1024

/** Returns the string key of the problem with `file`, or null when it can be uploaded. */
export function coverProblem(file) {
  if (!file) return null
  if (!COVER_TYPES.includes(file.type)) return 'cover.wrongType'
  if (file.size > COVER_MAX_BYTES) return 'cover.tooBig'
  return null
}
