import { useRef, useEffect, useMemo } from 'react'

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 800
): T & { cancel: () => void } {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const debouncedCallback = useMemo(() => {
    let timeoutId: NodeJS.Timeout

    const debounced = (...args: Parameters<T>) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    }
    // Drops a pending call, for callers that run it themselves right away instead.
    debounced.cancel = () => clearTimeout(timeoutId)

    return debounced as T & { cancel: () => void }
  }, [delay])

  return debouncedCallback
}
