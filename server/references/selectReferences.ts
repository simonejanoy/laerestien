import { randomInt } from 'node:crypto'
import { MAX_REFERENCE_TASKS, type AiLevel, type AiReferenceTask, type DivisionType, type ReferenceArea } from '../../src/ai/contract.ts'
import { divisionTypeOf } from '../divisionChecks.ts'
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
  /** Hovedområdet i økta. */
  area: ReferenceArea
  /** Tilgrensende områder: høyst én av plassene går til dem, resten til hovedområdet. */
  secondaryAreas?: readonly ReferenceArea[]
  level: AiLevel
  seed: number
  max?: number
  /** Divisjon: økta handler bare om delingsdivisjon eller målingsdivisjon. Referanser av den andre typen tas ikke med. */
  divisionType?: DivisionType
}

/**
 * Referanser om deltema som ingen av øktene i temaet har (i Geometri: omkrets og areal, som hører til
 * Måling). De blir værende i banken, men velges ikke.
 */
const OUTSIDE_SESSIONS = /\bomkrets|\bareal\b/i
const fitsSessions = (ref: ReferenceTask) => !(ref.topic === 'geometri' && OUTSIDE_SESSIONS.test(`${ref.studentText} ${ref.purpose}`))

/**
 * Divisjonstypen en referanse viser: typen hensikten nevner (ingen når den nevner begge), ellers typen
 * spørsmålet i oppgaveteksten viser. Null når referansen gjelder begge eller ingen av typene.
 */
export function referenceDivisionType(ref: Pick<ReferenceTask, 'purpose' | 'studentText'>): DivisionType | null {
  const deling = /delingsdivisjon/i.test(ref.purpose)
  const maling = /målingsdivisjon/i.test(ref.purpose)
  if (deling || maling) return deling === maling ? null : deling ? 'deling' : 'maling'
  return divisionTypeOf(ref.studentText)
}

/** Om referansen passer divisjonstypen i økta (alle passer når økta ikke har en type). */
const fitsType = (ref: ReferenceTask, divisionType?: DivisionType) => {
  if (!divisionType) return true
  const type = referenceDivisionType(ref)
  return type === null || type === divisionType
}

/**
 * Høyst `max` referanser fra riktig fagområde og nivå (og eventuelt divisjonstype – da kan det bli færre). Rekkefølgen trekkes med frøet, og
 * referanser med en hensikt og et format som ikke er valgt fra før går foran, så utvalget
 * sprer seg over ulike formål og formater der banken har det.
 */
export function selectReferences(bank: readonly ReferenceTask[], { area, secondaryAreas = [], level, seed, max = MAX_REFERENCE_TASKS, divisionType }: SelectOptions): ReferenceTask[] {
  if (secondaryAreas.length > 0 && max > 1) {
    // Hovedfokus: alle plassene unntatt én går til hovedområdet; én støttereferanse fra et tilgrensende område.
    const main = selectReferences(bank, { area, level, seed, max: max - 1, divisionType })
    const support = shuffle(
      bank.filter((r) => r.level === level && secondaryAreas.includes(r.area) && r.area !== area && fitsType(r, divisionType) && fitsSessions(r)),
      seed + level * 7919 + 1,
    ).slice(0, 1)
    return [...main, ...support]
  }
  const pool = shuffle(
    bank.filter((r) => r.area === area && r.level === level && fitsType(r, divisionType) && fitsSessions(r)),
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

/**
 * Referansen slik AI-en får den: ID, format, hensikt, eventuell representasjon, tekst og fasit.
 * I Problemløsing er den visuelle støtten beskrevet med ord (f.eks. en tekstbasert blokkmodell) – ikke en figur som mangler.
 * Løsningsforslaget, lærernotatet og flervalgsmetadataene sendes ikke (alternativene står i elevteksten).
 */
export function toAiReference(ref: ReferenceTask): AiReferenceTask {
  const inText = ref.topic === 'problemlosing'
  return {
    id: ref.id,
    taskType: ref.format,
    purpose: ref.purpose,
    ...(ref.representationHint && (inText ? { support: ref.representationHint } : { representation: ref.representationHint })),
    studentText: ref.studentText,
    solution: ref.solution,
  }
}
