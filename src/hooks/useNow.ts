import { useEffect, useState } from 'react'

/** Nåtiden, oppdatert med jevne mellomrom så lenge komponenten vises. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
