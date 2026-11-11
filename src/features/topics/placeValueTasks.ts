import type { Level, TaskType } from '../../types/index.ts'

// Grunnoppgaver i Tall og plassverdi som følger innholdsplanen og nivåprogresjonen:
// nivå 1 tydelig støtte og ett steg, nivå 2 mindre støtte og strategivalg/veksling, nivå 3
// resonnering, flere steg, feilanalyse, ukjent tall eller forklaring.
// Brukes av undertemaene i yearPlan.ts. Rene funksjoner. Importene har .ts-endelse.
// Formuleringene er egne – referanseoppgavene i server/references kopieres ikke.

/** Regnestykke: [type, tall1, regneart, tall2, instruksjon]. Samme form som TaskSpec i yearPlan.ts. */
export type PlaceValueMath = [TaskType, number, '+' | '-', number, string]
export interface PlaceValueText {
  text: string
  solution: string
}
export type PlaceValueTask = PlaceValueMath | PlaceValueText

/** Varianter av grunnoppgavene for firesifrede tall, én per økt. */
export type FourDigitVariant = 'plassverdi' | 'tallinje' | 'sammenligne' | 'bygge-dele-opp'

const H: TaskType = 'Hoderegning'
const O: TaskType = 'Oppstilling'

/** Et tall mellom min og max som varierer med økt (n) og oppgave (i). */
const vary = (n: number, i: number, min: number, max: number) => min + ((n * 7 + i * 3 + n * i) % (max - min + 1))

/** 4 682 → «4 682», −3 → «−3». */
export const fmt = (x: number) => {
  const sign = x < 0 ? '−' : ''
  const abs = Math.abs(x)
  return abs >= 1000 ? `${sign}${Math.floor(abs / 1000)} ${String(abs % 1000).padStart(3, '0')}` : `${sign}${abs}`
}

/** Fire ulike sifre 1–9 (tusener, hundrer, tier, ener) – ulike, så «sifferet 6» er entydig. */
function digits(n: number, i: number): [number, number, number, number] {
  return [0, 1, 2, 3].map((k) => ((n * 3 + i * 5 + k * 4) % 9) + 1) as [number, number, number, number]
}
const valueOf = ([t, h, te, e]: number[]) => t * 1000 + h * 100 + te * 10 + e
const PLACES = ['tusenerplassen', 'hundrerplassen', 'tierplassen', 'enerplassen']
const PLACE_VALUES = [1000, 100, 10, 1]

// ---------------------------------------------------------------------------------------------
// Firesifrede tall

function digitValue(n: number, i: number, supported: boolean): PlaceValueText {
  const d = digits(n, i)
  const pos = (n + i) % 4
  const [t, h, te, e] = d
  const intro = supported ? `${fmt(valueOf(d))} = ${fmt(t * 1000)} + ${h * 100} + ${te * 10} + ${e}. ` : ''
  return {
    text: `${intro}Hva er sifferet ${d[pos]} verdt i tallet ${fmt(valueOf(d))}?`,
    solution: `${fmt(d[pos] * PLACE_VALUES[pos])} (sifferet står på ${PLACES[pos]})`,
  }
}

function buildNumber(n: number, i: number): PlaceValueText {
  const d = digits(n, i)
  return {
    text: `Skriv tallet som har ${d[0]} tusenere, ${d[1]} hundrere, ${d[2]} tiere og ${d[3]} enere. Skriv sifrene i rekkefølge: tusenere, hundrere, tiere, enere.`,
    solution: fmt(valueOf(d)),
  }
}

function expandedForm(n: number, i: number): PlaceValueText {
  const d = digits(n, i)
  return {
    text: `Del opp ${fmt(valueOf(d))} i tusenere, hundrere, tiere og enere, og skriv det som et plusstykke.`,
    solution: `${fmt(d[0] * 1000)} + ${d[1] * 100} + ${d[2] * 10} + ${d[3]}`,
  }
}

function compare(n: number, i: number): PlaceValueText {
  const d = digits(n, i)
  // Bytt hundrer- og tiersifferet: samme tusener, så hundrerplassen avgjør.
  const a = valueOf(d)
  const b = valueOf([d[0], d[2], d[1], d[3]])
  const [small, large] = a < b ? [a, b] : [b, a]
  return {
    text: `Hvilket tall er størst, ${fmt(a)} eller ${fmt(b)}? Skriv tallene med tegnet < eller > mellom.`,
    solution: `${fmt(small)} < ${fmt(large)}`,
  }
}

function sortNumbers(n: number, i: number): PlaceValueText {
  const [t, h, te, e] = digits(n, i)
  const numbers = [valueOf([t, h, te, e]), valueOf([t, te, h, e]), valueOf([t, e, te, h]), valueOf([t, h, e, te])]
  const unique = [...new Set(numbers)]
  return {
    text: `Sorter tallene. Begynn med det minste: ${unique.map(fmt).join(', ')}.`,
    solution: [...unique].sort((a, b) => a - b).map(fmt).join(', '),
  }
}

function between(n: number, i: number): PlaceValueText {
  const start = vary(n, i, 1, 8) * 1000 + vary(n + 1, i, 1, 7) * 100
  return {
    text: `På en tallinje står ${fmt(start)} og ${fmt(start + 200)}. Hvilket tall ligger midt mellom dem?`,
    solution: fmt(start + 100),
  }
}

function constructNumber(n: number, i: number, largest: boolean): PlaceValueText {
  const d = digits(n, i)
  const sorted = [...d].sort((a, b) => (largest ? b - a : a - b))
  return {
    text: `Du har sifferkortene ${d.join(', ')}. Lag det ${largest ? 'største' : 'minste'} firesifrede tallet du kan, og forklar hvorfor sifrene står slik.`,
    solution: `${fmt(valueOf(sorted))} (det ${largest ? 'største' : 'minste'} sifferet på tusenerplassen, så nedover)`,
  }
}

function changePlace(n: number, i: number): PlaceValueText {
  const d = digits(n, i)
  // Plassen med lavest siffer (≤ 7), så det tåler å øke med 2.
  const pos = [1, 2, 3].reduce((best, p) => (d[p] < d[best] ? p : best), 1)
  const before = valueOf(d)
  const after = before + 2 * PLACE_VALUES[pos]
  return {
    text: `Sifferet på ${PLACES[pos]} i ${fmt(before)} øker med 2. Hva blir det nye tallet, og hvor mye større blir tallet?`,
    solution: `${fmt(after)}. Tallet blir ${2 * PLACE_VALUES[pos]} større.`,
  }
}

function riddle(n: number, i: number): PlaceValueText {
  const t = vary(n, i, 1, 9)
  const h = vary(n + 2, i, 0, 9)
  const e = vary(n + 1, i, 0, 7)
  const te = e + 2
  return {
    text: `Tallet har ${t} tusenere og ${h} hundrere. Det er 2 flere tiere enn enere, og enersifferet er ${e}. Hvilket tall er det?`,
    solution: fmt(valueOf([t, h, te, e])),
  }
}

const L2_KINDS: Record<FourDigitVariant, ((n: number, i: number) => PlaceValueText)[]> = {
  plassverdi: [expandedForm, compare, expandedForm, sortNumbers, compare],
  tallinje: [between, compare, between, sortNumbers, between],
  sammenligne: [compare, sortNumbers, compare, sortNumbers, compare],
  'bygge-dele-opp': [expandedForm, compare, sortNumbers, expandedForm, sortNumbers],
}

/**
 * Firesifrede tall. Nivå 1: sifferverdi (den første med utvidet form som støtte) og bygge tall.
 * Nivå 2: dele opp, sammenligne, sortere (eller tallinje). Nivå 3: konstruere tall fra vilkår og
 * forklare hvordan en plassverdi endrer tallet.
 */
export function fourDigitTasks(level: Level, n: number, variant: FourDigitVariant = 'plassverdi'): PlaceValueText[] {
  return [0, 1, 2, 3, 4].map((i) => {
    if (level === 1) return i % 2 === 0 ? digitValue(n, i, i === 0) : buildNumber(n, i)
    if (level === 2) return L2_KINDS[variant][i](n, i)
    return [(m: number, j: number) => constructNumber(m, j, true), changePlace, riddle, (m: number, j: number) => constructNumber(m, j, false), changePlace][i](n, i)
  })
}

// ---------------------------------------------------------------------------------------------
// Hoderegning med smarte strategier

/**
 * Nivå 1: strategien står i instruksjonen, ett steg. Nivå 2: eleven deler opp eller bruker
 * kompensasjon selv. Nivå 3: velge, bruke og kort forklare en strategi (tekstsvar).
 */
export function mentalStrategyTasks(level: Level, n: number): PlaceValueTask[] {
  return [0, 1, 2, 3, 4].map((i): PlaceValueTask => {
    if (level === 1) {
      switch (i) {
        case 0: {
          const units = vary(n, i, 1, 9)
          const a = vary(n + 1, i, 2, 8) * 10 + units
          return [H, a, '+', 10 - units, 'Regn i hodet. Tiervenner: fyll opp enerne til en hel tier.']
        }
        case 1: {
          const k = vary(n, i, 2, 5)
          return [H, vary(n + 1, i, 21, 59), '+', k * 10, `Regn i hodet. Legg til ${k} hele tiere.`]
        }
        case 2: {
          const k = vary(n, i, 2, 4)
          return [H, vary(n + 2, i, 105, 489), '+', k * 100, `Regn i hodet. Legg til ${k} hele hundrere.`]
        }
        case 3: {
          const tens = vary(n, i, 2, 8)
          return [H, tens * 10, '+', (10 - tens) * 10, `Regn i hodet. Hundrervenner: ${tens} tiere og ${10 - tens} tiere blir 10 tiere.`]
        }
        default: {
          const k = vary(n, i, 2, 4)
          return [H, vary(n + 1, i, 52, 98), '-', k * 10, `Regn i hodet. Trekk fra ${k} hele tiere.`]
        }
      }
    }
    if (level === 2) {
      const instruction = 'Regn i hodet. Del opp tallene eller bruk kompensasjon.'
      switch (i) {
        case 0:
          return [H, vary(n, i, 1, 6) * 100 + 98, '+', vary(n + 1, i, 23, 67), instruction]
        case 1:
          return [H, vary(n, i, 2, 7) * 100 + vary(n + 1, i, 1, 5) * 10, '+', vary(n + 2, i, 21, 49), instruction]
        case 2:
          return [H, vary(n, i, 4, 8) * 100 + vary(n + 1, i, 11, 89), '-', vary(n + 2, i, 1, 3) * 100 - 1, instruction]
        case 3:
          return [H, vary(n, i, 3, 8) * 100 + vary(n + 1, i, 5, 9) * 10 + vary(n + 2, i, 5, 9), '-', vary(n, i + 1, 2, 4) * 10 + vary(n + 1, i + 1, 1, 4), instruction]
        default:
          return [H, vary(n, i, 1, 6) * 100 + 99, '+', vary(n + 1, i, 31, 78), instruction]
      }
    }
    switch (i) {
      case 0: {
        const near = vary(n, i, 2, 6) * 100
        const a = near - 1
        const b = vary(n + 1, i, 112, 389)
        return { text: `Hvilken strategi passer best for ${a} + ${b}? Finn svaret uten å stille opp, og vis hvordan du tenkte.`, solution: `${a + b}. For eksempel ${near} + ${b} − 1 = ${a + b}.` }
      }
      case 1: {
        const b = vary(n, i, 115, 385)
        const c = vary(n + 1, i, 6, 9) * 100
        return { text: `Hvilket tall mangler? ___ + ${b} = ${c}. Forklar hvordan du fant det.`, solution: `${c - b}. ${c} − ${b} = ${c - b}.` }
      }
      case 2: {
        const a = vary(n, i, 2, 4) * 100 + vary(n + 1, i, 1, 9) * 10
        const b = vary(n + 2, i, 1, 3) * 100 + 50
        const c = vary(n, i + 1, 3, 9) * 10
        return {
          text: `Regn i hodet: ${a} + ${b} − ${c}. Skriv kort hvilken rekkefølge du regnet i.`,
          solution: `${a + b - c}. For eksempel ${a} + ${b} = ${a + b}, og ${a + b} − ${c} = ${a + b - c}.`,
        }
      }
      case 3: {
        const b = vary(n, i, 1, 4) * 100 - 1
        const a = vary(n + 1, i, 5, 9) * 100 + vary(n + 2, i, 12, 88)
        return { text: `Finn ${a} − ${b} uten å stille opp. Vis med et mellomsteg hvordan du tenkte.`, solution: `${a - b}. For eksempel ${a} − ${b + 1} + 1 = ${a - b}.` }
      }
      default: {
        const a = vary(n, i, 3, 7) * 100 + vary(n + 1, i, 21, 79)
        const round = Math.ceil(a / 100) * 100
        const target = round + vary(n + 2, i, 1, 3) * 100
        return {
          text: `Hvor mye må du legge til ${a} for å komme til ${target}? Forklar strategien din.`,
          solution: `${target - a}. For eksempel ${a} + ${round - a} = ${round}, og ${round} + ${target - round} = ${target}.`,
        }
      }
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Oppstilling med tall over 1000

/**
 * Nivå 1: fire sifre uten veksling, enere under enere (også ulikt antall sifre). Nivå 2: veksling.
 * Nivå 3: veksling gjennom nuller og kontroll med motsatt regneart, og feilanalyse.
 */
export function columnTasks(level: Level, n: number): PlaceValueTask[] {
  return [0, 1, 2, 3, 4].map((i): PlaceValueTask => {
    if (level === 1) {
      const a = digits(n, i).map((x) => Math.min(x, 8))
      const subtract = i % 2 === 1
      // Hver kolonne uten veksling: sum ≤ 9 eller ener ≤ ener.
      const b = a.map((x, k) => (subtract ? vary(n + k, i, 0, x - 1) : vary(n + k, i, 0, 9 - x)))
      if (i === 4) b[0] = 0 // ulikt antall sifre
      if (!subtract && b[0] === 0 && i !== 4) b[0] = 1
      const [x, y] = [valueOf(a), valueOf(b)]
      return [O, x, subtract ? '-' : '+', y, i === 4 ? 'Still opp og regn ut. Sett enere under enere.' : 'Still opp og regn ut.']
    }
    if (level === 2) {
      const subtract = i % 2 === 1
      // Veksling på enerplassen: 5–9 + 5–9 i addisjon, 1–4 − 5–9 i subtraksjon.
      const a = vary(n, i, 3, 8) * 1000 + vary(n + 1, i, 1, 8) * 100 + vary(n + 2, i, 1, 8) * 10 + (subtract ? vary(n + 3, i, 1, 4) : vary(n + 3, i, 5, 9))
      const b = vary(n + 1, i, 1, 2) * 1000 + vary(n + 2, i, 1, 9) * 100 + vary(n + 3, i, 2, 9) * 10 + vary(n, i, 5, 9)
      return subtract ? [O, a, '-', b, 'Still opp og regn ut. Husk å veksle.'] : [O, a, '+', b, 'Still opp og regn ut. Husk å veksle.']
    }
    if (i === 1 || i === 3) {
      const a = vary(n, i, 2, 6) * 1000 + vary(n + 1, i, 1, 8) * 100 + vary(n + 2, i, 1, 8) * 10 + vary(n + 3, i, 1, 9)
      const b = vary(n + 1, i, 2, 8) * 100 + vary(n + 2, i, 1, 9) * 10 + vary(n, i, 1, 9)
      const wrong = a + b * 10
      return {
        text: `En elev stilte opp ${fmt(a)} + ${b} og fikk ${fmt(wrong)}. Forklar hva som gikk galt, og finn riktig svar.`,
        solution: `${fmt(a + b)}. ${b} ble plassert ett sted for langt til venstre – enere skal stå under enere.`,
      }
    }
    if (i === 4) {
      const a = vary(n, i, 5, 9) * 1000 + vary(n + 1, i, 1, 4) * 100 + vary(n + 2, i, 1, 4) * 10 + vary(n + 3, i, 1, 4)
      const b = vary(n + 1, i, 1, 3) * 1000 + vary(n + 2, i, 5, 9) * 100 + vary(n + 3, i, 5, 9) * 10 + vary(n, i, 5, 9)
      return [O, a, '-', b, 'Still opp og regn ut. Kontroller svaret med motsatt regneart.']
    }
    const a = vary(n, i, 3, 9) * 1000
    const b = vary(n + 1, i, 1, 2) * 1000 + vary(n + 2, i, 1, 9) * 100 + vary(n + 3, i, 1, 9) * 10 + vary(n, i + 1, 1, 9)
    return [O, a, '-', b, 'Still opp og regn ut. Kontroller svaret med addisjon.']
  })
}

// ---------------------------------------------------------------------------------------------
// Negative tall

/**
 * Nivå 1: lese, plassere og sammenligne negative tall. Nivå 2: temperaturendringer forbi null og
 * avstand over null. Nivå 3: flere endringer, ukjent startverdi og forklaring på tallinjen.
 */
export function negativeNumberTasks(level: Level, n: number): PlaceValueText[] {
  return [0, 1, 2, 3, 4].map((i): PlaceValueText => {
    const a = vary(n, i, 2, 9)
    const b = vary(n + 1, i, 1, 8)
    if (level === 1) {
      switch (i % 5) {
        case 0:
          return { text: `Det er ${a} grader under null ute. Hvordan skriver vi den temperaturen med tall?`, solution: `${fmt(-a)} grader` }
        case 1:
          return { text: `Hvilket tall er størst, ${fmt(-a)} eller ${fmt(-a - b)}? Tenk på hvor tallene ligger på tallinjen.`, solution: `${fmt(-a)} (det ligger nærmest 0)` }
        case 2: {
          const set = [b, -a, 0, -1].filter((x, k, all) => all.indexOf(x) === k)
          return { text: `Plasser tallene på tallinjen og skriv dem fra venstre mot høyre: ${set.map(fmt).join(', ')}.`, solution: [...set].sort((x, y) => x - y).map(fmt).join(', ') }
        }
        case 3:
          return { text: `Hvilket tall ligger ett steg til venstre for ${fmt(-a)} på tallinjen?`, solution: fmt(-a - 1) }
        default:
          return { text: `Hvilken temperatur er lavest: ${fmt(-b)} grader eller ${fmt(-b - a)} grader?`, solution: `${fmt(-b - a)} grader` }
      }
    }
    if (level === 2) {
      switch (i % 3) {
        case 0:
          return { text: `Om natta var det ${fmt(-a)} grader. Til middag var det blitt ${a + b} grader varmere. Hvor mange grader var det til middag?`, solution: `${b} grader (${fmt(-a)} + ${a + b} = ${b})` }
        case 1:
          return { text: `Klokka 18 viste termometeret ${b} grader. I løpet av natta ble det ${a + b} grader kaldere. Hva viste termometeret da?`, solution: `${fmt(-a)} grader (${b} − ${a + b} = ${fmt(-a)})` }
        default:
          return { text: `Hvor mange grader er forskjellen mellom ${fmt(-a)} grader og ${b} grader?`, solution: `${a + b} grader (${a} opp til 0 og ${b} videre)` }
      }
    }
    switch (i % 3) {
      case 0: {
        const up = a + b + 2
        const down = vary(n + 2, i, 2, 6)
        const end = -a + up - down
        return {
          text: `Klokka 7 var det ${fmt(-a)} grader. Til lunsj var det blitt ${up} grader varmere, og til kvelden ${down} grader kaldere igjen. Hvor mange grader var det om kvelden?`,
          solution: `${fmt(end)} grader (${fmt(-a)} + ${up} − ${down} = ${fmt(end)})`,
        }
      }
      case 1:
        return {
          text: `Temperaturen sank ${a + b} grader og ble ${fmt(-a)} grader. Hva var temperaturen før den sank?`,
          solution: `${b} grader (${fmt(-a)} + ${a + b} = ${b})`,
        }
      default:
        return {
          text: `Forklar med tallinjen hvorfor ${fmt(-a - b)} er mindre enn ${fmt(-b)}.`,
          solution: `${fmt(-a - b)} ligger ${a} steg lenger til venstre for 0 enn ${fmt(-b)}, og tall lenger til venstre er mindre.`,
        }
    }
  })
}
