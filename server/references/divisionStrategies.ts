import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { DIVISION_STRATEGIES_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Strategier i divisjon: 45 originale referanseoppgaver skrevet for Lærestien
// (fem fagområder × tre nivåer × tre oppgaver, ID-prefiks SD – SD1-N1-01 tilsvarer D1-N1-01 i Divisjon).
// Feltnavnene er tilpasset de andre bankene (elevtekst → studentText, fasit → solution, losningsforslag →
// workedSolution, visuellStotte → representationHint, divisjonstype → divisionType med «deling», «maling»
// eller «begge»); innholdet er uendret. Områdene har egne ID-er som ikke finnes i Divisjon.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const DIVISION_STRATEGIES_REFERENCE_COUNT = 45

export const divisionStrategiesBankFile = new URL('./strategier_i_divisjon_referanser.json', import.meta.url)

export function loadDivisionStrategiesReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(divisionStrategiesBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, DIVISION_STRATEGIES_REFERENCE_COUNT, DIVISION_STRATEGIES_BANK)
  if (errors.length) throw new Error(`Referansebanken for Strategier i divisjon er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const divisionStrategiesReferences: readonly ReferenceTask[] = loadDivisionStrategiesReferences()
