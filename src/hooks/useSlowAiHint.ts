import { useEffect, useState } from 'react'
import { timeoutsFor, type AiUse } from '../ai/config'

/**
 * True når et AI-kall har pågått lenger enn tidsgrensen til hovedmodellen. Da prøver
 * serveren som regel reservemodellen, og appen kan si det i stedet for å vise en feil.
 */
export function useSlowAiHint(loading: boolean, use: AiUse) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!loading) return
    const id = window.setTimeout(() => setSlow(true), timeoutsFor(use).primary)
    return () => {
      window.clearTimeout(id)
      setSlow(false)
    }
  }, [loading, use])

  return loading && slow
}
