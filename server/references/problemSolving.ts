import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { PROBLEM_SOLVING_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Problemløsing: 36 originale referanseoppgaver skrevet for Lærestien
// (fire fagområder × tre nivåer × tre oppgaver). Feltnavnene er tilpasset de andre bankene
// (elevtekst → studentText, fasit → solution, losningsforslag → workedSolution, visuellStotte →
// representationHint, alternativer → options, korrektAlternativ → correctOptions); innholdet er uendret.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const PROBLEM_SOLVING_REFERENCE_COUNT = 36

export const problemSolvingBankFile = new URL('./problemlosing_referanser.json', import.meta.url)

export function loadProblemSolvingReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(problemSolvingBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, PROBLEM_SOLVING_REFERENCE_COUNT, PROBLEM_SOLVING_BANK)
  if (errors.length) throw new Error(`Referansebanken for Problemløsing er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const problemSolvingReferences: readonly ReferenceTask[] = loadProblemSolvingReferences()
