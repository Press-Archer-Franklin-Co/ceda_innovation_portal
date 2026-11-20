// Refusals (S1, ceda-security section 6): after a 401 or 403 the browser stops asking. Polling ends and the
// query is not retried, so a page someone may not see does not fill the API log with the same refusal.

export function isRefused(error) {
  return error?.status === 401 || error?.status === 403
}

/** refetchInterval for polling queries: every `ms` until the API refuses, then never. */
export function pollEvery(ms) {
  return (query) => (isRefused(query?.state?.error) ? false : ms)
}

/** Default retry: once for network or server errors, never after a refusal. */
export function retryUnlessRefused(failureCount, error) {
  return !isRefused(error) && failureCount < 1
}
