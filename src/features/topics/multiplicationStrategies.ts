import type { Level } from '../../types/index.ts'

// Strategistøtte i økter der strategier er læringsfokus (6-gangen og 7-, 8- og 9-gangen).
// Brukes både av grunnoppgavene (yearPlan.ts) og av kontrollen av AI-oppgaver (server/taskChecks.ts).
// Rene funksjoner, så de kan testes i Node. Importene har .ts-endelse.
//
// Et regnestykke a · b leses som «a grupper fra b-gangen»: strategien velges ut fra b (tabellen),
// og konkrete hint bruker a. Eksempel: 6 · 9 = 10 · 6 − 6.

/** Nivå 3: åpen formulering – eleven velger strategi selv. */
export const OPEN_STRATEGY = 'Regn ut. Velg en smart strategi.'

/** Tabellene som har en egen strategi. */
const STRATEGY_TABLES = [6, 7, 8, 9]

/**
 * Instruksjonen til a · b på nivået, eller null når ingen av faktorene har en egen strategi.
 * Tabellen er b når b er 6–9, ellers a (7 · 4 leses som 4 grupper fra 7-gangen).
 * Nivå 1 gir et konkret mellomsteg med tallene i regnestykket, nivå 2 foreslår strategien i ord,
 * og nivå 3 er åpen. Alle strategiene er matematisk gyldige for akkurat a · b.
 */
export function strategyInstruction(level: Level, a: number, b: number): string | null {
  const [groups, table] = STRATEGY_TABLES.includes(b) ? [a, b] : STRATEGY_TABLES.includes(a) ? [b, a] : [a, b]
  if (!STRATEGY_TABLES.includes(table)) return null
  if (level === 3) return OPEN_STRATEGY
  return tableInstruction(level === 1, groups, table)
}

function tableInstruction(concrete: boolean, a: number, b: number): string | null {
  switch (b) {
    case 6:
      return concrete ? `Regn ut. Finn 3 · ${a} og doble svaret.` : 'Regn ut. Doble 3-gangen, eller bruk 5-gangen og legg til én gruppe.'
    case 7:
      return concrete ? `Regn ut. Finn 5 · ${a} og legg til 2 · ${a}.` : 'Regn ut. Bruk 5-gangen og legg til to grupper.'
    case 8:
      return concrete ? `Regn ut. Finn 4 · ${a} og doble svaret.` : 'Regn ut. Doble 4-gangen, eller ta 10-gangen minus to grupper.'
    case 9:
      return concrete ? `Regn ut. Tenk 10 · ${a} og trekk fra ${a}.` : 'Regn ut. Bruk 10-gangen og trekk fra én gruppe.'
    default:
      return null
  }
}

/** Hvordan støtten ser ut på nivået – til AI-en, med eksempler fra tabellene i økta. */
export function strategySupport(level: Level, tables: number[]): string {
  if (level === 3) return `Åpen formulering uten konkret hjelp: «${OPEN_STRATEGY}» Regnestykkene skal gi en passende utfordring (ikke 0 eller 1 som det andre tallet).`
  const examples = tables
    .map((b) => strategyInstruction(level, 6, b))
    .filter((x): x is string => x !== null)
    .map((x) => `«${x}»`)
  return level === 1
    ? `Konkret hjelp med et mellomsteg som bruker tallene i regnestykket. Eksempler for 6 · ${tables.join(', 6 · ')}: ${examples.join(' ')} Tilpass tallene til regnestykket du lager.`
    : `Foreslå én eller flere gyldige strategier med ord, som passer tabellen i regnestykket. Eksempler: ${examples.join(' ')}`
}

const NUMBER_WORDS: Record<string, number> = { én: 1, en: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5 }
const count = (word: string) => NUMBER_WORDS[word] ?? Number(word)

/**
 * Hvorfor strategien i instruksjonen ikke passer a · b, eller null når den passer (eller ikke kan
 * kontrolleres). Kjenner igjen:
 * - «10-gangen minus én gruppe», «5-gangen og legg til to grupper» o.l.: tabellen ± antall grupper
 *   må være en av faktorene
 * - «doble 4-gangen»: det dobbelte av tabellen må være en av faktorene
 * - konkrete mellomsteg: «Tenk 10 · 6 og trekk fra 6», «Finn 4 · 6 og doble svaret»,
 *   «Finn 5 · 6 og legg til 2 · 6» må gi a · b
 */
export function strategyProblem(instruction: string, a: number, b: number): string | null {
  const text = instruction.toLowerCase().replace(/[×x*]/g, '·').replace(/−/g, '-')
  const product = a * b
  const isFactor = (n: number) => n === a || n === b

  for (const m of text.matchAll(/(\d+)-gangen,?\s+(?:og\s+)?(minus|trekk fra|pluss|legg til)\s+(én|en|ett|to|tre|fire|fem|\d+)\s+grupp/g)) {
    const table = Number(m[1])
    const target = /minus|trekk/.test(m[2]) ? table - count(m[3]) : table + count(m[3])
    if (!isFactor(target)) return `«${m[0]}» gir ${target}-gangen, ikke ${a} · ${b}`
  }
  for (const m of text.matchAll(/(?:doble|dobbelte av)\s+(\d+)-gangen/g)) {
    const target = 2 * Number(m[1])
    if (!isFactor(target)) return `«${m[0]}» gir ${target}-gangen, ikke ${a} · ${b}`
  }

  const step = (x: string, y: string) => Number(x) * Number(y)
  for (const m of text.matchAll(/(\d+)\s*·\s*(\d+)\s+og\s+trekk\s+fra\s+(\d+)(?:\s*·\s*(\d+))?/g)) {
    const value = step(m[1], m[2]) - Number(m[3]) * (m[4] ? Number(m[4]) : 1)
    if (value !== product) return `«${m[0]}» gir ${value}, ikke ${product}`
  }
  for (const m of text.matchAll(/(\d+)\s*·\s*(\d+)\s+og\s+legg\s+til\s+(\d+)(?:\s*·\s*(\d+))?/g)) {
    const value = step(m[1], m[2]) + Number(m[3]) * (m[4] ? Number(m[4]) : 1)
    if (value !== product) return `«${m[0]}» gir ${value}, ikke ${product}`
  }
  for (const m of text.matchAll(/(\d+)\s*·\s*(\d+)\s+og\s+doble/g)) {
    const value = 2 * step(m[1], m[2])
    if (value !== product) return `«${m[0]}» gir ${value}, ikke ${product}`
  }
  return null
}
