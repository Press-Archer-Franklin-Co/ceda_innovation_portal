// Start-up progress for the idea bulb loader (U12). Each real start-up step reports when it is done, so the
// bulb's glow shows finished work only, never a guess. Public site steps:
//   i18n    translations ready (they ship with the code, so this is done when the provider is up)
//   config  public config loaded
//   me      the signed-in check finished, or skipped when no one is signed in
//   page    the first page's code loaded (or its error page is showing)
// A failed step, or no answer within BOOT_TIMEOUT_MS, ends the loader with an error and Retry.

export const BOOT_STEPS = ['i18n', 'config', 'me', 'page']
export const BOOT_TIMEOUT_MS = 20_000

export interface BootFailure { step: string | undefined; reason: string }
export interface BootSnapshot { done: number; total: number; failed: BootFailure | null; finished: boolean; startedAt: number }
export interface Boot {
  steps: string[]
  done(step: string): void
  fail(step: string, reason?: string): void
  state(): BootSnapshot
  subscribe(fn: (s: BootSnapshot) => void): () => void
  loaderGone(): void
  onLoaderGone(fn: () => void): () => void
  isLoaderGone(): boolean
}

export function createBoot(steps: string[], { timeoutMs = BOOT_TIMEOUT_MS, now = () => Date.now() }: { timeoutMs?: number; now?: () => number } = {}): Boot {
  const done = new Set<string>()
  let failed: BootFailure | null = null
  const listeners = new Set<(s: BootSnapshot) => void>()
  const goneListeners = new Set<() => void>()
  let gone = false
  const startedAt = now()
  let timer: ReturnType<typeof setTimeout> | null = null

  const snapshot = (): BootSnapshot => ({ done: done.size, total: steps.length, failed, finished: !failed && done.size === steps.length, startedAt })
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
    done(step: string) {
      if (failed || !steps.includes(step) || done.has(step)) return
      done.add(step)
      settle()
      emit()
    },
    /** End start-up with an error: the loader stops and shows Retry. */
    fail(step: string, reason = 'error') {
      if (failed || done.size === steps.length) return
      failed = { step, reason }
      settle()
      emit()
    },
    state: snapshot,
    subscribe(fn: (s: BootSnapshot) => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    /** The loader has faded out (or was never shown). The menu's sunrise waits for this. */
    loaderGone() {
      if (gone) return
      gone = true
      goneListeners.forEach((fn) => fn())
      goneListeners.clear()
    },
    onLoaderGone(fn: () => void) {
      if (gone) {
        fn()
        return () => {}
      }
      goneListeners.add(fn)
      return () => {
        goneListeners.delete(fn)
      }
    },
    isLoaderGone: () => gone,
  }
}

/** The public site's one start-up. */
export const boot = createBoot(BOOT_STEPS)
