import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { MEASUREMENT_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Måling: 45 originale referanseoppgaver skrevet for Lærestien
// (fem fagområder × tre nivåer × tre oppgaver, ID-prefiks MA). Feltnavnene er tilpasset de andre bankene
// (tema → topic, omrade → area, omradeNavn → areaTitle, nivaa → level, tittel → title, oppgavetype → format,
// pedagogiskHensikt → purpose, elevtekst → studentText, fasit → solution, losningsforslag → workedSolution,
// visuellStotte → representationHint, laerernotat → teacherNote, svarform → answerForm); innholdet er uendret.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const MEASUREMENT_REFERENCE_COUNT = 45

export const measurementBankFile = new URL('./maling_referanser.json', import.meta.url)

export function loadMeasurementReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(measurementBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, MEASUREMENT_REFERENCE_COUNT, MEASUREMENT_BANK)
  if (errors.length) throw new Error(`Referansebanken for Måling er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const measurementReferences: readonly ReferenceTask[] = loadMeasurementReferences()
