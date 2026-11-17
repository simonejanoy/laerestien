import type { Session, SessionTask } from '../../types/index.ts'
import { parseTaskSets, serializeTaskSets } from '../sessions/taskStorage.ts'
import type { LiveSession, LiveSnapshot } from './liveProgress.ts'

// Økta slik læreren startet den, lagt ved i liveSessions/{classId}: navnet, tema og oppgavene. Eleven får nøyaktig denne
// økta og disse oppgavene, uansett hva som ligger i elevens egen nettleser (oppgavesettene læreren har endret, ligger
// bare i lærerens nettleser). Oppgavene skrives og leses felt for felt med taskStorage, så ingen ukjente felt følger med.
// Rene funksjoner, så de kan testes i Node. Importene har .ts-endelse.

/** «Multiplikasjon økt 7» – samme navn som elevvisningen viser øverst. */
export const sessionDisplayName = (session: Pick<Session, 'title' | 'numbers'>) => `${session.title} økt ${session.numbers.join(' & ')}`

export function makeSnapshot(session: Pick<Session, 'id' | 'title' | 'numbers' | 'topicId' | 'skillIds'>, tasks: SessionTask[]): LiveSnapshot {
  return {
    label: sessionDisplayName(session),
    topicId: session.topicId,
    skillIds: session.skillIds ?? [],
    tasks: serializeTaskSets({ [session.id]: tasks }),
  }
}

/** Oppgavene læreren startet økta med, eller null når dokumentet ikke har dem (eldre økter). */
export function snapshotTasks(live: Pick<LiveSession, 'sessionId' | 'tasks'> | null | undefined): SessionTask[] | null {
  if (!live?.tasks) return null
  const { sets } = parseTaskSets(live.tasks)
  return sets[live.sessionId] ?? null
}
