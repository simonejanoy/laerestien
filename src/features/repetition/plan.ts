import { topicOfSkill } from '../../ai/sessionProfile.ts'
import type { Level } from '../../types/index.ts'
import { skillTitle, skillTopic, summaryLine, type RepetitionAnalysis, type SkillResult } from './analysis.ts'

// Fra lærerens valg til bestillinger til AI-en. Hvert nivå bestilles for seg, og undertemaer fra ulike tema bestilles
// hver for seg (hvert tema har sin referansebank og sine kontroller). Antallet læreren ba om per nivå fordeles på
// temaene – flest til temaet nivået strever mest med.

/** Lærerens valg: undertemaene per nivå (fra rangeringen og lagt til selv). */
export type Selection = Record<Level, string[]>

export interface RepetitionOrder {
  level: Level
  /** Undertemaene i bestillingen (samme tema). */
  skills: string[]
  /** Antall oppgaver i denne bestillingen. */
  count: number
  /** Den anonyme oppsummeringen AI-en får («Nivå 2: Divisjon med rest – 54 % riktige …»). */
  lines: string[]
}

const LEVELS: Level[] = [1, 2, 3]

/** Resultatet for et undertema på nivået, med eller uten nok grunnlag. */
function resultOf(analysis: RepetitionAnalysis, level: Level, skill: string): SkillResult | undefined {
  const onLevel = analysis.levels.find((l) => l.level === level)
  return onLevel?.ranked.find((r) => r.skill === skill) ?? onLevel?.insufficient.find((r) => r.skill === skill)
}

/** Linjen AI-en får for et undertema: tallene når de har nok grunnlag, ellers at læreren har lagt det til. */
export function orderLine(analysis: RepetitionAnalysis, level: Level, skill: string) {
  const result = resultOf(analysis, level, skill)
  if (result?.eligible) return summaryLine(result)
  const topic = skillTopic(skill)
  return `Nivå ${level}: ${skillTitle(skill)}${topic ? ` (${topic})` : ''} – valgt for repetisjonen (for lite grunnlag i resultatene).`
}

/**
 * Bestillingene for lærerens valg: én per nivå og tema. `perLevel` oppgaver per nivå fordeles på temaene etter tur,
 * flest til temaet med størst behov; temaer som ikke får noen oppgaver, tas ikke med. Undertemaer uten tema i
 * årsplanen hoppes over.
 */
export function planOrders(analysis: RepetitionAnalysis, selection: Selection, perLevel: number): RepetitionOrder[] {
  return LEVELS.flatMap((level) => {
    const skills = selection[level] ?? []
    const need = (skill: string) => {
      const r = resultOf(analysis, level, skill)
      return r?.eligible ? r.need : -1
    }
    const groups = new Map<string, string[]>()
    for (const skill of skills) {
      const topic = topicOfSkill(skill)
      if (topic) groups.set(topic, [...(groups.get(topic) ?? []), skill])
    }
    const ordered = [...groups.values()].sort((a, b) => Math.max(...b.map(need)) - Math.max(...a.map(need)))
    const counts = ordered.map(() => 0)
    for (let i = 0; i < perLevel && ordered.length > 0; i++) counts[i % ordered.length]++
    return ordered.flatMap((group, i): RepetitionOrder[] =>
      counts[i] > 0 ? [{ level, skills: group, count: counts[i], lines: group.map((s) => orderLine(analysis, level, s)) }] : [],
    )
  })
}

/**
 * Bestillingene for områdene læreren har valgt for økta: de samme områdene på alle tre nivåene, `perLevel` oppgaver
 * per nivå (se planOrders). Tallene AI-en får, er fortsatt per nivå.
 */
export function ordersForAreas(analysis: RepetitionAnalysis, skills: readonly string[], perLevel: number): RepetitionOrder[] {
  const chosen = [...skills]
  return planOrders(analysis, { 1: chosen, 2: chosen, 3: chosen }, perLevel)
}
