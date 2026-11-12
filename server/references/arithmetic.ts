import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { ARITHMETIC_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Regning: 36 originale referanseoppgaver skrevet for Lærestien (fire fagområder × tre nivåer ×
// tre oppgaver, ID-prefiks RE). Feltnavnene er tilpasset de andre bankene (tema → topic, omrade → area, omradeNavn →
// areaTitle, nivaa → level, tittel → title, oppgavetype → format, pedagogiskHensikt → purpose, elevtekst → studentText,
// fasit → solution, losningsforslag → workedSolution, visuellStotte → representationHint, laerernotat → teacherNote,
// svarform → answerForm, dataformat → dataFormat); innholdet er uendret. Lastes og kontrolleres én gang når serveren
// starter. Er dataene ugyldige, starter ikke serveren.

export const ARITHMETIC_REFERENCE_COUNT = 36

export const arithmeticBankFile = new URL('./regning_referanser.json', import.meta.url)

interface ArithmeticBank {
  dataFormat: string
  references: ReferenceTask[]
}

export function loadArithmeticBank(): ArithmeticBank {
  const raw: unknown = JSON.parse(readFileSync(arithmeticBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, ARITHMETIC_REFERENCE_COUNT, ARITHMETIC_BANK)
  const dataFormat = (raw as { dataFormat?: unknown }).dataFormat
  if (typeof dataFormat !== 'string' || !dataFormat.trim()) errors.push('Banken mangler beskrivelsen av dataformatet («dataFormat»).')
  if (errors.length) throw new Error(`Referansebanken for Regning er ugyldig:\n- ${errors.join('\n- ')}`)
  return raw as ArithmeticBank
}

const bank = loadArithmeticBank()

export const arithmeticReferences: readonly ReferenceTask[] = bank.references

/** Skrivemåten for diagrammer, tabeller og ukjente tall (feltet «dataformat» i vedlegget). Sendes til AI-en i alle regneøktene. */
export const arithmeticDataFormat: string = bank.dataFormat
