// Start-up progress for the idea bulb loader (U12). Each real start-up step reports when it is done, so the
// bulb's glow shows finished work only, never a guess. Staff console steps:
//   me      the signed-in check (me and capabilities) finished, or there was no one to check
//   config  public config loaded
//   page    the first page's code loaded (or its error page is showing)
// A failed step, or no answer within BOOT_TIMEOUT_MS, ends the loader with an error and Retry.

export const BOOT_STEPS = ['me', 'config', 'page']
export const BOOT_TIMEOUT_MS = 20_000

export function createBoot(steps, { timeoutMs = BOOT_TIMEOUT_MS, now = () => Date.now() } = {}) {
  const done = new Set()
  let failed = null
  const listeners = new Set()
  const goneListeners = new Set()
  let gone = false
  const startedAt = now()
  let timer = null

  const snapshot = () => ({ done: done.size, total: steps.length, failed, finished: !failed && done.size === steps.length, startedAt })
  const emit = () => listeners.forEach((fn) => fn(snapshot()))
  const settle = () => {
    if (timer && (failed || done.size === steps.length)) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (typeof setTimeout === 'function' && timeoutMs > 0) {
    timer = setTimeout(() => {
      if (!failed && done.size < steps.length) {
        failed = { step: steps.find((s) => !done.has(s)), reason: 'timeout' }
        emit()
      }
    }, timeoutMs)
  }

  return {
    steps,
    /** Mark a step finished. Unknown or repeated steps change nothing. */
    done(step) {
      if (failed || !steps.includes(step) || done.has(step)) return
      done.add(step)
      settle()
      emit()
    },
    /** End start-up with an error: the loader stops and shows Retry. */
    fail(step, reason = 'error') {
      if (failed || done.size === steps.length) return
      failed = { step, reason }
      settle()
      emit()
    },
    state: snapshot,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    /** The loader has faded out (or was never shown). The menu's sunrise waits for this. */
    loaderGone() {
      if (gone) return
      gone = true
      goneListeners.forEach((fn) => fn())
      goneListeners.clear()
    },
    onLoaderGone(fn) {
      if (gone) {
        fn()
        return () => {}
      }
      goneListeners.add(fn)
      return () => goneListeners.delete(fn)
    },
    isLoaderGone: () => gone,
  }
}

/** The staff console's one start-up. */
export const boot = createBoot(BOOT_STEPS)
