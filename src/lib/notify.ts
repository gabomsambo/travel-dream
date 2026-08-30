import { toast, type ExternalToast } from 'sonner'

/** Standard toast durations (ms). Deviations should be noted in PR. */
export const NOTIFY_DURATION = {
  success: 4_000,
  info: 6_000,
  warning: 10_000,
  error: 10_000,
  /** Recoverable errors with no inline home — user must dismiss or act. */
  persistent: Number.POSITIVE_INFINITY,
  clipboard: 3_000,
} as const

export type NotifyOptions = ExternalToast

function withDuration(
  duration: number,
  options?: NotifyOptions
): NotifyOptions {
  return { duration, ...options }
}

/**
 * Thin facade over Sonner so duration, dedupe keys, and copy standards live in
 * one place instead of at 160+ call sites.
 */
export const notify = {
  success(message: string, options?: NotifyOptions) {
    return toast.success(message, withDuration(NOTIFY_DURATION.success, options))
  },

  info(message: string, options?: NotifyOptions) {
    return toast.info(message, withDuration(NOTIFY_DURATION.info, options))
  },

  warning(message: string, options?: NotifyOptions) {
    return toast.warning(message, withDuration(NOTIFY_DURATION.warning, options))
  },

  error(message: string, options?: NotifyOptions) {
    return toast.error(message, withDuration(NOTIFY_DURATION.error, options))
  },

  /** Errors with no inline recovery surface — stays until dismissed. */
  errorPersistent(message: string, options?: Omit<NotifyOptions, 'duration'>) {
    return toast.error(message, {
      duration: NOTIFY_DURATION.persistent,
      closeButton: true,
      ...options,
    })
  },

  loading(message: string, options?: NotifyOptions) {
    return toast.loading(message, options)
  },

  dismiss(id?: string | number) {
    return toast.dismiss(id)
  },
}
