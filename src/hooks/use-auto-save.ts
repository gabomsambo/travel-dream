import { useRef, useEffect, useMemo } from 'react'

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 800
): T {
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

    return debounced as T
  }, [delay])

  return debouncedCallback
}
