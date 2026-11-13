import { planned } from '../sessions/sessionTasks.ts'
import { skillById, topics } from '../topics/curriculum.ts'
import type { Level } from '../../types/index.ts'
import type { AnswerRecord } from './answers.ts'

// Analysen bak AI-støttet repetisjon. Alt regnes ut her i appen fra klassens lagrede svar: læreren får et forslag om tre
// områder for økta (rankAreas/suggestAreas, alle nivåene samlet), og AI-en får en samlet, anonym oppsummering per nivå
// (analyze/summaryLine) – aldri navn, enkeltsvar eller elev-ID-er. Uten nok svar foreslås områdene i temaplanen.

/** Et undertema er en felles utfordring først når resultatet bygger på minst så mange besvarelser … */
export const MIN_ANSWERS = 10
/** … fra minst så mange ulike elever. */
export const MIN_STUDENTS = 2
/** Vårrepetisjonen: undertemaene fra vårens tema veier så mye mer i rangeringen. */
export const SPRING_WEIGHT = 1.25
/** Oppgavetyper med færre besvarelser enn dette regnes ikke som «vanskeligst» (for tynt grunnlag). */
const MIN_TYPE_ANSWERS = 3

export type PeriodId = 'repetisjon-host' | 'repetisjon-vinter' | 'repetisjon-var'

interface PeriodSpec {
  title: string
  /** Temaene (periodene i årsplanen) resultatene hentes fra. */
  sources: string[]
  /** Temaene som veier mer (vår). */
  emphasis: string[]
}

const SPRING = ['strategier-i-divisjon', 'maling', 'monster-og-algoritmer', 'regning']

export const PERIODS: Record<PeriodId, PeriodSpec> = {
  'repetisjon-host': { title: 'Høstrepetisjon', sources: ['tall', 'multiplikasjon', 'divisjon'], emphasis: [] },
  'repetisjon-vinter': { title: 'Vinterrepetisjon', sources: ['geometri', 'problemlosing', 'tall-og-regning'], emphasis: [] },
  'repetisjon-var': {
    title: 'Vårrepetisjon',
    sources: ['tall', 'multiplikasjon', 'divisjon', 'geometri', 'problemlosing', 'tall-og-regning', ...SPRING],
    emphasis: SPRING,
  },
}

export const isPeriod = (topicId: string): topicId is PeriodId => topicId in PERIODS

/** Undertemaene øktene i periodens temaer øver på, i årsplanens rekkefølge (uten duplikater). */
export function periodSkills(period: PeriodId): string[] {
  return [...new Set(PERIODS[period].sources.flatMap((unit) => planned(unit).flatMap((p) => p.skills)))]
}

/** «Divisjon med rest» – navnet på undertemaet i årsplanen. */
export const skillTitle = (skill: string) => skillById(skill)?.name ?? skill
/** «Divisjon» – faget undertemaet hører til. */
export const skillTopic = (skill: string) => topics.find((t) => t.skills.some((s) => s.id === skill))?.name ?? ''

export interface SkillResult {
  skill: string
  title: string
  topicTitle: string
  level: Level
  answered: number
  correct: number
  /** Andel riktige (0–1). */
  share: number
  /** Gjennomsnittlig antall forsøk per besvarte oppgave. */
  avgAttempts: number
  students: number
  /** Oppgavetypene med lavest andel riktige (med nok besvarelser), dårligst først. */
  hardTypes: string[]
  /** Nok grunnlag til å kalles en felles utfordring (MIN_ANSWERS og MIN_STUDENTS). */
  eligible: boolean
  /** Rangeringen: (1 − andel riktige) × vekt. Høyest først. */
  need: number
}

export interface LevelAnalysis {
  level: Level
  /** Undertemaer med nok grunnlag, det nivået strever mest med først. */
  ranked: SkillResult[]
  /** Undertemaer med svar, men for lite grunnlag til å vurderes. */
  insufficient: SkillResult[]
}

export interface RepetitionAnalysis {
  period: PeriodId
  levels: LevelAnalysis[]
  answers: number
  students: number
}

const LEVELS: Level[] = [1, 2, 3]

/** Samler svarene i perioden per nivå og undertema, og rangerer undertemaene etter hvor mye nivået strever. */
export function analyze(records: readonly AnswerRecord[], period: PeriodId): RepetitionAnalysis {
  const spec = PERIODS[period]
  const inPeriod = records.filter((r) => spec.sources.includes(r.topicId) && LEVELS.includes(r.level))
  const levels = LEVELS.map((level): LevelAnalysis => {
    const onLevel = inPeriod.filter((r) => r.level === level)
    const results = [...new Set(onLevel.map((r) => r.skill))].map((skill): SkillResult => {
      const rows = onLevel.filter((r) => r.skill === skill)
      const correct = rows.filter((r) => r.correct).length
      const share = correct / rows.length
      const students = new Set(rows.map((r) => r.studentId)).size
      const types = [...new Set(rows.map((r) => r.taskType))]
        .map((type) => {
          const ofType = rows.filter((r) => r.taskType === type)
          return { type, n: ofType.length, share: ofType.filter((r) => r.correct).length / ofType.length }
        })
        // Bare typer med nok besvarelser, og der ikke alle svarene var riktige.
        .filter((t) => t.n >= MIN_TYPE_ANSWERS && t.share < 1)
        .sort((a, b) => a.share - b.share)
      const emphasized = rows.some((r) => spec.emphasis.includes(r.topicId))
      return {
        skill,
        title: skillTitle(skill),
        topicTitle: skillTopic(skill),
        level,
        answered: rows.length,
        correct,
        share,
        avgAttempts: rows.reduce((n, r) => n + r.attempts, 0) / rows.length,
        students,
        hardTypes: types.slice(0, 2).map((t) => t.type),
        eligible: rows.length >= MIN_ANSWERS && students >= MIN_STUDENTS,
        need: (1 - share) * (emphasized ? SPRING_WEIGHT : 1),
      }
    })
    const byNeed = (a: SkillResult, b: SkillResult) => b.need - a.need || b.answered - a.answered
    return {
      level,
      ranked: results.filter((r) => r.eligible).sort(byNeed),
      insufficient: results.filter((r) => !r.eligible).sort((a, b) => b.answered - a.answered),
    }
  })
  return { period, levels, answers: inPeriod.length, students: new Set(inPeriod.map((r) => r.studentId)).size }
}

// ---------------------------------------------------------------------------------------------
// Forslaget til læreren: tre områder for hele økta (alle nivåene samlet). Forklaringen nevner bare områdene og tallene
// – aldri elevnavn eller nivå.

/** Så mange områder foreslås. */
export const SUGGESTED_AREAS = 3

/** Ett område (undertema) med alle nivåene samlet. */
export interface AreaResult {
  skill: string
  title: string
  topicTitle: string
  answered: number
  /** Andel riktige (0–1). */
  share: number
  students: number
  /** Ulike elever som har svart feil minst én gang (brukes når to områder står likt). */
  studentsWithWrong: number
  /** Nok grunnlag (MIN_ANSWERS og MIN_STUDENTS). */
  eligible: boolean
  /** Vårens tema i vårrepetisjonen (veier SPRING_WEIGHT mer). */
  emphasized: boolean
  /** Rangeringen: andel feil × vekt. Høyest først. */
  need: number
}

/** Områdene i perioden med svar, alle nivåene samlet: de med nok grunnlag rangert etter andel feil svar. */
export function rankAreas(records: readonly AnswerRecord[], period: PeriodId) {
  const spec = PERIODS[period]
  const inPeriod = records.filter((r) => spec.sources.includes(r.topicId) && LEVELS.includes(r.level))
  const results = [...new Set(inPeriod.map((r) => r.skill))].map((skill): AreaResult => {
    const rows = inPeriod.filter((r) => r.skill === skill)
    const share = rows.filter((r) => r.correct).length / rows.length
    const students = new Set(rows.map((r) => r.studentId)).size
    const emphasized = rows.some((r) => spec.emphasis.includes(r.topicId))
    return {
      skill,
      title: skillTitle(skill),
      topicTitle: skillTopic(skill),
      answered: rows.length,
      share,
      students,
      studentsWithWrong: new Set(rows.filter((r) => !r.correct).map((r) => r.studentId)).size,
      eligible: rows.length >= MIN_ANSWERS && students >= MIN_STUDENTS,
      emphasized,
      need: (1 - share) * (emphasized ? SPRING_WEIGHT : 1),
    }
  })
  return {
    ranked: results.filter((r) => r.eligible).sort((a, b) => b.need - a.need || b.studentsWithWrong - a.studentsWithWrong || b.answered - a.answered),
    insufficient: results.filter((r) => !r.eligible),
    answers: inPeriod.length,
    students: new Set(inPeriod.map((r) => r.studentId)).size,
  }
}

export const PLAN_FALLBACK_NOTICE = 'Ikke nok elevsvar ennå – de tre første områdene i perioden er valgt. Velg selv hvilke som skal repeteres.'
export const PLAN_REASON = 'Fra temaplanen – ikke nok elevsvar her ennå.'

/** «Valgt fordi elevene har svart feil på 46 % av oppgavene her (28 svar fra 4 elever).» – uten navn og nivå. */
export function areaReason(r: AreaResult, period: PeriodId) {
  const spring = r.emphasized && PERIODS[period].emphasis.length > 0 ? ' Vårens temaer veier mer i vårrepetisjonen.' : ''
  return `Valgt fordi elevene har svart feil på ${percent(1 - r.share)} av oppgavene her (${r.answered} svar fra ${r.students} elever).${spring}`
}

/** Områdene i temaplanen for økta: øktas egne undertemaer først, så resten av periodens, i årsplanens rekkefølge. */
export function planOrder(period: PeriodId, sessionSkills: readonly string[] = []) {
  const all = periodSkills(period)
  return [...new Set([...sessionSkills.filter((s) => all.includes(s)), ...all])]
}

export interface AreaSuggestion {
  /** De foreslåtte områdene (høyst SUGGESTED_AREAS), det elevene strever mest med først. */
  skills: string[]
  /** Kort forklaring per område. */
  reasons: Record<string, string>
  /** Minst ett område kommer fra temaplanen fordi det ikke er nok elevsvar. */
  fromPlan: boolean
}

/**
 * Forslaget: områdene elevene har svart feil på oftest (med nok grunnlag). Er det færre enn tre, fylles det opp fra
 * temaplanen – tydelig merket. Ingen eksempeldata.
 */
export function suggestAreas(records: readonly AnswerRecord[], period: PeriodId, sessionSkills: readonly string[] = []): AreaSuggestion {
  const { ranked } = rankAreas(records, period)
  const fromResults = ranked.slice(0, SUGGESTED_AREAS)
  const reasons: Record<string, string> = Object.fromEntries(fromResults.map((r) => [r.skill, areaReason(r, period)]))
  const skills = fromResults.map((r) => r.skill)
  for (const skill of planOrder(period, sessionSkills)) {
    if (skills.length >= SUGGESTED_AREAS) break
    if (skills.includes(skill)) continue
    skills.push(skill)
    reasons[skill] = PLAN_REASON
  }
  return { skills, reasons, fromPlan: fromResults.length < skills.length }
}

// ---------------------------------------------------------------------------------------------
// Oppsummeringen til AI-en og læreren.

const percent = (share: number) => `${Math.round(share * 100)} %`
const decimal = (n: number) => n.toFixed(1).replace('.', ',')

/** «Nivå 2: Divisjon med rest (Divisjon) – 54 % riktige av 28 besvarelser fra 4 elever, i snitt 1,6 forsøk. Vanskeligst: Tekstoppgave.» */
export function summaryLine(r: SkillResult) {
  return `Nivå ${r.level}: ${r.title}${r.topicTitle ? ` (${r.topicTitle})` : ''} – ${percent(r.share)} riktige av ${r.answered} besvarelser fra ${r.students} elever, i snitt ${decimal(r.avgAttempts)} forsøk.${r.hardTypes.length ? ` Vanskeligst: ${r.hardTypes.join(', ')}.` : ''}`
}

/** Undertemaene i perioden som ikke har resultater på nivået (til «Legg til andre områder»). */
export function otherSkills(analysis: RepetitionAnalysis, level: Level): string[] {
  const shown = new Set(analysis.levels.find((l) => l.level === level)?.ranked.map((r) => r.skill) ?? [])
  return periodSkills(analysis.period).filter((s) => !shown.has(s))
}

