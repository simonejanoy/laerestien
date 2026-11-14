import { useEffect, useState } from 'react'
import { useLiveBackend } from './liveBackend'
import type { LiveSession, ProgressDoc } from './liveProgress'

/** Økta i klassen. `live` er undefined mens appen kobler til, og null når ingen økt er startet. */
export function useLiveSession(classId: string | null) {
  const backend = useLiveBackend()
  const [state, setState] = useState<{ classId: string | null; live: LiveSession | null | undefined; failed: boolean }>({
    classId,
    live: undefined,
    failed: false,
  })

  useEffect(() => {
    if (!classId) return
    return backend.subscribeLiveSession(
      classId,
      (live) => setState({ classId, live, failed: false }),
      () => setState((prev) => ({ ...prev, classId, failed: true })),
    )
  }, [backend, classId])

  // Ny klasse: kobler til på nytt.
  if (state.classId !== classId) return { live: undefined, failed: false }
  return { live: state.live, failed: state.failed }
}

/** Læreren: framdriften til alle elevene i én gjennomføring. Oppdateres hver gang en elev leverer. */
export function useRunProgress(classId: string, runId: string | null) {
  const backend = useLiveBackend()
  const [state, setState] = useState<{ runId: string | null; docs: ProgressDoc[]; failed: boolean }>({ runId, docs: [], failed: false })

  useEffect(() => {
    if (!runId) return
    return backend.subscribeRunProgress(
      classId,
      runId,
      (docs) => setState({ runId, docs, failed: false }),
      () => setState((prev) => ({ ...prev, runId, failed: true })),
    )
  }, [backend, classId, runId])

  if (state.runId !== runId) return { docs: [], failed: false }
  return { docs: state.docs, failed: state.failed }
}
