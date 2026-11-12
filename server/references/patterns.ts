import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { PATTERN_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Mønster og algoritmer: 45 originale referanseoppgaver skrevet for Lærestien
// (fem fagområder × tre nivåer × tre oppgaver, ID-prefiks MO). Feltnavnene er tilpasset de andre bankene
// (tema → topic, omrade → area, omradeNavn → areaTitle, nivaa → level, tittel → title, oppgavetype → format,
// pedagogiskHensikt → purpose, elevtekst → studentText, fasit → solution, losningsforslag → workedSolution,
// visuellStotte → representationHint, laerernotat → teacherNote, svarform → answerForm, kodeformat → codeFormat);
// innholdet er uendret. Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const PATTERN_REFERENCE_COUNT = 45

export const patternBankFile = new URL('./monster_og_algoritmer_referanser.json', import.meta.url)

interface PatternBank {
  codeFormat: string
  references: ReferenceTask[]
}

export function loadPatternBank(): PatternBank {
  const raw: unknown = JSON.parse(readFileSync(patternBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, PATTERN_REFERENCE_COUNT, PATTERN_BANK)
  const codeFormat = (raw as { codeFormat?: unknown }).codeFormat
  if (typeof codeFormat !== 'string' || !codeFormat.trim()) errors.push('Banken mangler beskrivelsen av kodeformatet («codeFormat»).')
  if (errors.length) throw new Error(`Referansebanken for Mønster og algoritmer er ugyldig:\n- ${errors.join('\n- ')}`)
  return raw as PatternBank
}

const bank = loadPatternBank()

export const patternReferences: readonly ReferenceTask[] = bank.references

/** Pseudokoden i temaet (feltet «kodeformat» i vedlegget). Sendes til AI-en i øktene om løkker og vilkår. */
export const patternCodeFormat: string = bank.codeFormat
