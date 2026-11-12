import type { SessionTask, Task, TextTask } from '../types/index.ts'
import { asTextDraft, isMathDraft, readStoredVisual, type AiLevel, type AiResponseMeta, type AiTaskDraft, type AiTaskMeta, type AiTextDraft, type TaskResult } from './contract.ts'
import { blankRowIn, colorRowsIn, dotCountsIn, dotLayout, drawableColors, readExpected } from './patternDisplay.ts'

// AI-utkast → oppgaver i appen. Alltid merket som AI-generert og «ikke gjennomgått» til
// læreren sier noe annet. Rene funksjoner (ingen Firebase), så de kan testes i Node.

/**
 * Sporbarheten til én AI-oppgave, ut fra svaret den kom i. Mangler svaret sporingsdata (eldre
 * server), blir det ingen metadata. Referanse-ID-ene er de AI-en fikk på oppgavens nivå.
 */
export function aiMetaFor(draft: AiTaskDraft, meta?: AiResponseMeta): AiTaskMeta | undefined {
  if (!meta?.requestId || !meta.rulesVersion || !meta.createdAt) return undefined
  return {
    model: draft.servedBy?.model ?? meta.model,
    rulesVersion: meta.rulesVersion,
    referenceIds: meta.referenceIds?.[String(draft.level) as '1' | '2' | '3'] ?? [],
    requestId: meta.requestId,
    createdAt: meta.createdAt,
    ...(meta.area && { area: meta.area }),
    level: draft.level,
    format: isMathDraft(draft) ? 'regnestykke' : 'tekst',
    fallbackUsed: draft.servedBy?.fallbackUsed ?? meta.fallbackUsed,
    ...(meta.referenceSeed !== undefined && { referenceSeed: meta.referenceSeed }),
  }
}

/**
 * Om AI-oppgavene er en komplett pakke: nøyaktig `perLevel` på hvert av de bestilte nivåene (alle tre som standard),
 * og ingen på andre nivåer.
 * Bare en komplett pakke legges i lærerens utkast – aldri en delvis.
 */
export function isCompletePackage(drafts: AiTaskDraft[], perLevel: number, levels: readonly AiLevel[] = [1, 2, 3]) {
  return perLevel > 0 && levels.every((level) => drafts.filter((d) => d.level === level).length === perLevel) && drafts.length === perLevel * levels.length
}

/** Korte regnestykker blir vanlige regneoppgaver (samme format som hoderegningen), resten tekstoppgaver. */
export function toSessionTask(draft: AiTaskDraft, id: string, meta?: AiResponseMeta): SessionTask {
  if (!isMathDraft(draft)) return toTextTask(draft, id, meta)
  const aiMeta = aiMetaFor(draft, meta)
  const task: Task = {
    id,
    level: draft.level,
    type: draft.taskType,
    instruction: draft.instruction,
    a: draft.a,
    operator: draft.operator,
    b: draft.b,
    aiGenerated: true,
    reviewed: false,
    ...(aiMeta && { aiMeta }),
  }
  return task
}

/** AI-oppgave → fritekstoppgave (elevforslag og justering viser bare tekstoppgaver). */
export function toTextTask(draft: AiTaskDraft, id: string, meta?: AiResponseMeta): TextTask {
  const text = asTextDraft(draft)
  const aiMeta = aiMetaFor(draft, meta)
  return {
    kind: 'text',
    id,
    level: text.level,
    text: text.studentText,
    solution: text.solution,
    competenceGoal: text.competenceGoal,
    adaptation: text.adaptation,
    aiGenerated: true,
    reviewed: false,
    // Geometri: figuren appen tegner (bare gyldige figurer kommer hit – ugyldige avvises på serveren).
    ...(text.figure && { figure: text.figure }),
    // Mønster og algoritmer: prikkene i figurtallet og inputbokser i tallrekka (satt av serveren etter kontrollene).
    ...(!text.figure && text.dotCounts && dotLayout(text.dotCounts) && { figure: { kind: 'dots' as const, counts: text.dotCounts } }),
    ...(!text.figure && !text.dotCounts && text.colorItems && drawableColors(text.colorItems) && { figure: { kind: 'colors' as const, items: text.colorItems } }),
    ...(text.answerBoxes && { answerBoxes: true as const }),
    ...(readExpected(text.expected) && { expected: readExpected(text.expected) }),
    ...(aiMeta && { aiMeta }),
  }
}

/** Tekstoppgaven slik AI-en får den ved justering – med figuren (plan figur eller vinkel), så den kan beholdes. */
export function toDraft(task: TextTask): AiTextDraft {
  const figure = task.figure?.kind === 'shape' || task.figure?.kind === 'angle' ? readStoredVisual(task.figure) : null
  return {
    format: 'text',
    level: task.level,
    studentText: task.text,
    solution: task.solution,
    competenceGoal: task.competenceGoal,
    adaptation: task.adaptation,
    ...(figure && { figure }),
  }
}

/**
 * Svaret på «Juster med AI»: en ny versjon av oppgaven (ikke gjennomgått), en feilmelding når serveren avviste
 * justeringen (den opprinnelige oppgaven beholdes uendret), eller et oppfølgingsspørsmål fra AI-en.
 */
export function applyRevision(original: TextTask, result: TaskResult): { task?: TextTask; error?: string; question?: string } {
  const revised = result.tasks[0]
  if (revised) return { task: keepPatternDisplay(toTextTask(revised, original.id, result.meta), original) }
  if (result.warning) return { error: result.warning }
  return { question: result.message }
}

/**
 * Mønster og algoritmer ved «Juster med AI»: prikkfiguren, fargesirklene og inputboksene regnes ut på nytt fra den
 * justerte teksten, så de alltid stemmer med den. Står ikke antallene, fargene eller rekka der lenger, forsvinner de.
 * Svaret som rettes automatisk, fjernes: den nye teksten er ikke kontrollert, så oppgaven får dagens melding i stedet.
 * Brukes også når læreren redigerer teksten eller fasiten selv.
 */
export function keepPatternDisplay(task: TextTask, original: TextTask): TextTask {
  const { answerBoxes: _boxes, expected: _expected, ...rest } = task
  const drawn = original.figure?.kind === 'dots' || original.figure?.kind === 'colors'
  const next: TextTask = drawn && task.figure?.kind !== 'shape' && task.figure?.kind !== 'angle' ? (({ figure: _f, ...r }) => r)(rest) : rest
  if (original.figure?.kind === 'dots' && !next.figure) {
    const counts = dotCountsIn(task.text)
    if (counts && dotLayout(counts)) next.figure = { kind: 'dots', counts }
  }
  if (original.figure?.kind === 'colors' && !next.figure) {
    const rows = colorRowsIn(task.text)
    if (rows.length === 1 && drawableColors(rows[0])) next.figure = { kind: 'colors', items: rows[0] }
  }
  if ((original.answerBoxes || task.answerBoxes) && blankRowIn(task.text)) next.answerBoxes = true
  return next
}
