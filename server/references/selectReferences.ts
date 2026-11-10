import { randomInt } from 'node:crypto'
import { MAX_REFERENCE_TASKS, type AiLevel, type AiReferenceTask, type MultiplicationArea } from '../../src/ai/contract.ts'
import type { ReferenceTask } from './types.ts'

// Velger referanser fra referansebanken for ett fagområde og ett nivå.
// Utvalget varierer mellom forespørsler, men samme frø gir alltid samme utvalg (frøet logges
// og lagres på oppgavene, så utvalget kan gjenskapes).

/** Nytt frø til en forespørsel. */
export const newReferenceSeed = () => randomInt(0, 2 ** 31)

/** Liten, deterministisk tallgenerator (mulberry32). */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffle<T>(items: T[], seed: number): T[] {
  const next = random(seed)
  const list = [...items]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const norm = (text: string) => text.trim().toLowerCase()

export interface SelectOptions {
  area: MultiplicationArea
  level: AiLevel
  seed: number
  max?: number
}

/**
 * Høyst `max` referanser fra riktig fagområde og nivå. Rekkefølgen trekkes med frøet, og
 * referanser med en hensikt og et format som ikke er valgt fra før går foran, så utvalget
 * sprer seg over ulike formål og formater der banken har det.
 */
export function selectReferences(bank: readonly ReferenceTask[], { area, level, seed, max = MAX_REFERENCE_TASKS }: SelectOptions): ReferenceTask[] {
  const pool = shuffle(
    bank.filter((r) => r.area === area && r.level === level),
    seed + level * 7919,
  )
  const chosen: ReferenceTask[] = []
  const purposes = new Set<string>()
  const formats = new Set<string>()
  // Først de som er nye i både hensikt og format, så de som er nye i ett av dem, så resten.
  for (const accept of [
    (r: ReferenceTask) => !purposes.has(norm(r.purpose)) && !formats.has(norm(r.format)),
    (r: ReferenceTask) => !purposes.has(norm(r.purpose)) || !formats.has(norm(r.format)),
    () => true,
  ]) {
    for (const ref of pool) {
      if (chosen.length >= max) break
      if (chosen.includes(ref) || !accept(ref)) continue
      chosen.push(ref)
      purposes.add(norm(ref.purpose))
      formats.add(norm(ref.format))
    }
  }
  return chosen
}

/** Referansen slik AI-en får den: ID, format, hensikt, eventuell representasjon, tekst og fasit. */
export function toAiReference(ref: ReferenceTask): AiReferenceTask {
  return {
    id: ref.id,
    taskType: ref.format,
    purpose: ref.purpose,
    ...(ref.representationHint && { representation: ref.representationHint }),
    studentText: ref.studentText,
    solution: ref.solution,
  }
}
