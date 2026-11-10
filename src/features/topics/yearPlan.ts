import type { DivisionArea, DivisionType, PlaceValueArea } from '../../ai/contract.ts'
import type { Level, LevelGroup, LevelProfile, Operator, TaskProfile, TaskType, TopicDetails } from '../../types/index.ts'
import { OPEN_STRATEGY, strategyInstruction } from './multiplicationStrategies.ts'
import { columnTasks, fourDigitTasks, mentalStrategyTasks, negativeNumberTasks, type FourDigitVariant } from './placeValueTasks.ts'

// Innholdet i periodene i årsplanen (se curriculum.ts): økttitler med undertema, mål,
// nivåer og regler for oppgaver. Oppgavereglene hører til undertemaene (ferdighetene),
// så repetisjon bruker de samme reglene som temaet den repeterer.
// Oppgavene lages av enkle regler, så hver økt får nye tall. Testdata frem til Firestore er på plass.
// Økter med en oppgaveprofil (TaskProfile) får tallene sine fra profilen – f.eks. hvilke
// gangetabeller som hører til økta – så oppgavene følger overskriften. Samme profil sendes til AI-en.

/** [type, tall 1, regneart, tall 2, instruksjon] – appen retter svaret selv. */
export type TaskSpec = [TaskType, number, Operator, number, string]

/** Tekstoppgave: tekst til eleven og fasit til læreren (for svar appen ikke kan rette, f.eks. negative tall). */
export interface TextSpec {
  text: string
  solution: string
}

export type GeneratedTask = TaskSpec | TextSpec

type Generator = (level: Level, n: number, profile?: TaskProfile) => GeneratedTask[]

export interface SessionPlan {
  heading: string
  /** Undertemaene (ferdighetene) økta øver på. */
  skills: string[]
  /** Hva oppgavene i akkurat denne økta skal øve på. */
  profile?: TaskProfile
}

export interface UnitSpec {
  /** Id-en til perioden i årsplanen. */
  unitId: string
  /** Kortnavn i overskriften, f.eks. «Multiplikasjon». */
  title: string
  /** Navnet på lappen i kalenderen. */
  topic: string
  area: string
  description: string
  weeks: { title: string; sessions: SessionPlan[] }[]
  goals: string[]
  levels: Omit<LevelGroup, 'level' | 'taskCount' | 'studentCount'>[]
}

const H = 'Hoderegning'
const O = 'Oppstilling'

/** Et tall mellom min og max som varierer med økt (n) og oppgave (i). */
const vary = (n: number, i: number, min: number, max: number) => min + ((n * 7 + i * 3 + n * i) % (max - min + 1))

function five<T>(make: (i: number) => T) {
  return [0, 1, 2, 3, 4].map(make)
}

function pick<T>(list: T[], i: number) {
  return list[i % list.length]
}

/** Typografisk minus for negative tall: −3 */
const signed = (x: number) => (x < 0 ? `−${-x}` : String(x))

/** 2.5 → «2,5» */
const dec = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

/** Gangestykker: grupper · faktor. */
const times = (factors: number[], n: number, instruction: string, [minGroups, maxGroups]: [number, number] = [2, 10]) =>
  five((i): TaskSpec => [H, vary(n, i, minGroups, maxGroups), '*', pick(factors, i + n), instruction])

/**
 * Gangestykker etter øktprofilen. Uten profil brukes `fallback` (f.eks. i repetisjon på tvers av tema).
 * Når strategier er læringsfokus, får hvert stykke en strategi som passer akkurat det stykket og nivået.
 */
const tableTasks =
  (fallback: Record<Level, LevelProfile>): Generator =>
  (level, n, profile) => {
    const p = profile?.levels[level].factors ? profile.levels[level] : fallback[level]
    const tasks = times(p.factors ?? [], n, p.instruction ?? 'Regn ut.', p.groups)
    if (!profile?.strategyFocus) return tasks
    return tasks.map(([type, a, op, b, instruction]): TaskSpec => [type, a, op, b, strategyInstruction(level, a, b) ?? instruction])
  }

/** Delestykker som alltid går opp. */
const divide = (divisors: number[], n: number, instruction: string, minQ = 2, maxQ = 10, type: TaskType = H) =>
  five((i): TaskSpec => {
    const d = pick(divisors, i + n)
    return [type, d * vary(n, i, minQ, maxQ), '/', d, instruction]
  })

/** Velger regel etter nivå. */
const byLevel =
  (one: (n: number) => GeneratedTask[], two: (n: number) => GeneratedTask[], three: (n: number) => GeneratedTask[]): Generator =>
  (level, n) =>
    (level === 1 ? one : level === 2 ? two : three)(n)

/** Hoderegning med tiere og hundrere (tallmønstre og repetisjon). */
const mentalByLevel = byLevel(
  (n) => five((i): TaskSpec => [H, vary(n, i, 2, 10), '+', vary(n + 1, i, 2, 10), 'Regn i hodet.']),
  (n) => five((i): TaskSpec => [H, vary(n, i, 23, 68), '+', 10 * vary(n + 1, i, 1, 3), 'Regn i hodet: legg til tierne.']),
  (n) => five((i): TaskSpec => [H, vary(n, i, 120, 480), i % 2 === 0 ? '+' : '-', 10 * vary(n + 2, i, 2, 9), 'Regn i hodet.']),
)

// ---------------------------------------------------------------------------------------
// Divisjon: grunnoppgaver per divisjonstype og fagområde. Alle går opp, bortsett fra restoppgavene.

/** Et delestykke som går opp: total = divisor · kvotient. */
const evenDivision = (n: number, i: number, divisors: number[], [minQ, maxQ]: [number, number]) => {
  const d = pick(divisors, i + n)
  const q = vary(n, i, minQ, maxQ)
  return { d, q, total: d * q }
}

/** Delingsdivisjon: antall grupper er kjent, eleven finner hvor mange det blir i hver. */
const sharingDivision = byLevel(
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [2, 3, 4, 5], [2, 8])
      return [H, total, '/', d, `Del ${total} klistremerker likt på ${d} barn. Hvor mange får hvert barn?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [3, 4, 6], [3, 9])
      return i % 2 === 0
        ? [H, total, '/', d, `${total} kort fordeles likt mellom ${d} venner. Hvor mange kort får hver venn?`]
        : [H, total, '/', d, `${total} kroner deles likt mellom ${d} søsken. Hvor mange kroner får hver?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [6, 7, 8, 9], [3, 9])
      return i % 2 === 0
        ? [H, total, '/', d, `${total} elever deles i ${d} like store lag. Hvor mange er det på hvert lag?`]
        : [H, total, '/', d, `En bonde fordeler ${total} høner likt i ${d} hønsehus. Hvor mange høner bor i hvert hus?`]
    }),
)

/** Målingsdivisjon: størrelsen på hver gruppe er kjent, eleven finner antall grupper. */
const measuringDivision = byLevel(
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [2, 3, 4, 5], [2, 8])
      return [H, total, '/', d, `Du har ${total} pærer og legger ${d} i hver kurv. Hvor mange kurver blir det?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [3, 4, 6], [3, 9])
      return [H, total, '/', d, `Du har ${total} egg og legger ${d} i hver eske. Hvor mange esker trenger du?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const { d, total } = evenDivision(n, i, [6, 7, 8, 9], [3, 9])
      return i % 2 === 0
        ? [H, total, '/', d, `${total} elever skal sitte ${d} ved hvert bord. Hvor mange bord trengs?`]
        : [H, total, '/', d, `Ida har ${total} perler og lager armbånd med ${d} perler på hvert. Hvor mange armbånd kan hun lage?`]
    }),
)

/** Begge typene om hverandre (repetisjon og «Strategier i divisjon»), slik undertemaet alltid har gjort. */
const mixedDivision = byLevel(
  (n) =>
    five((i): TaskSpec => {
      const d = pick([2, 3, 4, 5], i + n)
      const total = d * vary(n, i, 2, 8)
      return [H, total, '/', d, `Del ${total} klistremerker likt på ${d} barn. Hvor mange får hvert barn?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const d = pick([3, 4, 6], i + n)
      const total = d * vary(n, i, 3, 9)
      return [H, total, '/', d, `Du har ${total} egg og legger ${d} i hver eske. Hvor mange esker trenger du?`]
    }),
  (n) =>
    five((i): TaskSpec => {
      const d = pick([6, 7, 8, 9], i + n)
      const total = d * vary(n, i, 3, 9)
      return i % 2 === 0
        ? [H, total, '/', d, `${total} elever deles i ${d} like store lag. Hvor mange er det på hvert lag?`]
        : [H, total, '/', d, `${total} elever skal sitte ${d} ved hvert bord. Hvor mange bord trengs?`]
    }),
)

/** «1 kake», «3 kaker» */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Et delestykke med rest: total = divisor · kvotient + rest (rest fra 1 til divisor − 1). */
const withRemainder = (n: number, i: number, divisors: number[], [minQ, maxQ]: [number, number]) => {
  const d = pick(divisors, i + n)
  const q = vary(n, i, minQ, maxQ)
  const r = vary(n + 1, i, 1, d - 1)
  return { d, q, r, total: d * q + r }
}

/**
 * Rest i hverdagen: hele grupper og hvor mange som blir til overs, eller hvor mange grupper som
 * faktisk trengs når alle skal være med (svaret rundes opp).
 */
const everydayRemainder = byLevel(
  (n) =>
    five((i): TextSpec => {
      const { d, q, r, total } = withRemainder(n, i, [3, 4, 5], [2, 6])
      return {
        text: `${total} kaker skal pakkes i esker med plass til ${d} kaker. Hvor mange esker blir helt fulle, og hvor mange kaker er igjen?`,
        solution: `${q} fulle esker og ${count(r, 'kake', 'kaker')} igjen  (${total} : ${d} = ${q} rest ${r})`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const { d, q, r, total } = withRemainder(n, i, [4, 5, 6], [3, 8])
      return i % 2 === 0
        ? {
            text: `${total} barn skal padle i kanoer med plass til ${d} barn i hver. Hvor mange kanoer trengs for at alle skal være med?`,
            solution: `${q + 1} kanoer  (${total} : ${d} = ${q} rest ${r}, så det trengs én kano til)`,
          }
        : {
            text: `${total} gulrøtter bindes i bunter med ${d} i hver. Hvor mange hele bunter blir det, og hvor mange gulrøtter er igjen?`,
            solution: `${q} hele bunter og ${count(r, 'gulrot', 'gulrøtter')} igjen  (${total} : ${d} = ${q} rest ${r})`,
          }
    }),
  (n) =>
    five((i): TextSpec => {
      const { d, q, r, total } = withRemainder(n, i, [6, 7, 8], [3, 9])
      return i % 2 === 0
        ? {
            text: `${total} bilder skal limes inn i et album med ${d} bilder på hver side. Hvor mange sider trengs, og hvor mange bilder kommer på den siste siden?`,
            solution: `${q + 1} sider. Det kommer ${count(r, 'bilde', 'bilder')} på den siste siden.  (${total} : ${d} = ${q} rest ${r})`,
          }
        : {
            text: `${total} supportere skal kjøre minibuss til kampen. Hver buss har plass til ${d}. Hvor mange busser må de bestille, og hvorfor er ikke svaret ${q}?`,
            solution: `${q + 1} busser. ${total} : ${d} = ${q} rest ${r}, og de ${r} som blir igjen, trenger også plass.`,
          }
    }),
)

/** Modelloppgaver: like grupper, tallinje, rutenett og blokkmodell – beskrevet i teksten, så eleven kan tegne eller lese dem. */
const divisionModelTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      const { d, q, total } = evenDivision(n, i, [2, 3, 4, 5], [2, 6])
      if (i % 3 === 0) {
        return { text: `Tegn ${d} ringer og fordel ${total} kryss likt i dem. Hvor mange kryss står i hver ring?`, solution: `${q} kryss  (${total} : ${d} = ${q})` }
      }
      if (i % 3 === 1) {
        return { text: `Tegn en tallinje fra 0 til ${total}. Hopp ${d} og ${d} fra 0. Hvor mange hopp trenger du for å komme til ${total}?`, solution: `${q} hopp  (${total} : ${d} = ${q})` }
      }
      return { text: `Tegn et rutenett med ${total} ruter fordelt på ${d} like lange rader. Hvor mange ruter er det i hver rad?`, solution: `${q} ruter  (${total} : ${d} = ${q})` }
    }),
  (n) =>
    five((i): TextSpec => {
      const { d, q, total } = evenDivision(n, i, [4, 5, 6], [3, 9])
      if (i % 3 === 0) {
        return { text: `Tegn en blokkmodell med totalen ${total}, delt i ${d} like store deler. Hvilket tall står i hver del? Skriv divisjonsstykket.`, solution: `${q}. ${total} : ${d} = ${q}.` }
      }
      if (i % 3 === 1) {
        return { text: `Gå baklengs på tallinjen fra ${total} til 0 med hopp på ${d}. Hvor mange hopp blir det? Skriv divisjonsstykket.`, solution: `${q} hopp. ${total} : ${d} = ${q}.` }
      }
      return { text: `Et rutenett har ${total} ruter og ${d} kolonner. Hvor mange rader har det? Skriv divisjonsstykket.`, solution: `${q} rader. ${total} : ${d} = ${q}.` }
    }),
  (n) =>
    five((i): TextSpec => {
      const { d, q, total } = evenDivision(n, i, [6, 7, 8, 9], [3, 9])
      return i % 2 === 0
        ? {
            text: `En blokkmodell har totalen ${total}, og hver del er ${d}. Tegn modellen. Hvor mange deler får den?`,
            solution: `${q} deler. ${total} : ${d} = ${q}, fordi ${q} · ${d} = ${total}.`,
          }
        : {
            text: `Vis ${total} : ${d} med et rutenett eller en tallinje. Forklar hva ${d} og svaret betyr i modellen.`,
            solution: `${q}. Modellen viser ${total} delt i grupper på ${d}, og det blir ${q} grupper (${q} · ${d} = ${total}).`,
          }
    }),
)

// ---------------------------------------------------------------------------------------
// Regler per undertema

const skillTasks: Record<string, Generator> = {
  // Tall – nivåene er tall 1–20, 1–100 og 1–1000.
  // Firesifrede tall: sifferverdi og bygge tall → dele opp, sammenligne og sortere → vilkår og endring
  // av én plassverdi. Varianten (økta) avgjør oppgavene på nivå 2 (se placeValueTasks.ts).
  'tall.firesifrede': (level, n, profile) => fourDigitTasks(level, n, (profile?.taskVariant as FourDigitVariant | undefined) ?? 'plassverdi'),
  // Hoderegning. Varianten «strategier» (økta «Hoderegning med smarte strategier»): oppgitt strategi →
  // oppdeling/kompensasjon → velge og forklare. Ellers tiere og hundrere i hodet (tallmønstre).
  'tall.hoderegning': (level, n, profile) => (profile?.taskVariant === 'strategier' ? mentalStrategyTasks(level, n) : mentalByLevel(level, n)),
  'tall.addisjon-subtraksjon': byLevel(
    (n) =>
      five((i): TaskSpec =>
        i % 2 === 0
          ? [H, vary(n, i, 2, 9), '+', vary(n + 1, i, 2, 9), 'Regn ut. Finn tiervennene.']
          : [H, vary(n, i, 11, 19), '-', vary(n + 1, i, 2, 9), 'Regn ut. Tell bakover hvis du trenger det.'],
      ),
    (n) => five((i): TaskSpec => [i < 3 ? H : O, vary(n, i, 41, 92), '-', vary(n, i, 14, 39), 'Regn ut. Husk å veksle.']),
    (n) =>
      five((i): TaskSpec => {
        const a = vary(n, i, 210, 490)
        return i % 2 === 0
          ? [O, a, '+', vary(n, i, 105, 480), 'Still opp og regn ut.']
          : [O, a, '-', vary(n, i, 105, 199), 'Still opp og regn ut. Husk å veksle.']
      }),
  ),
  // Oppstilling med tall over 1000 på alle nivåer: uten veksling → veksling → veksling gjennom nuller,
  // kontroll med motsatt regneart og feilanalyse.
  'tall.oppstilling': (level, n) => columnTasks(level, n),
  // Negative tall på alle nivåer: lese og sammenligne → endringer forbi null → flere endringer,
  // ukjent startverdi og forklaring på tallinjen.
  'tall.negative': (level, n) => negativeNumberTasks(level, n),

  // Multiplikasjon
  // Like grupper: gjentatt addisjon som skal skrives som gange.
  'mult.like-grupper': (level, n, profile) => {
    const p = profile?.levels[level] ?? { numbers: '', factors: [2, 5, 10], groups: [2, 4] as [number, number] }
    const [min, max] = p.groups ?? [2, 4]
    return five((i): TextSpec => {
      const size = pick(p.factors ?? [2], i + n)
      const groups = vary(n, i, min, max)
      return {
        text: `Skriv som gangestykke, og regn ut.\n${Array(groups).fill(size).join(' + ')} = ___`,
        solution: `${groups} · ${size} = ${groups * size}`,
      }
    })
  },
  'mult.tabell-2-10': tableTasks({
    1: { numbers: '', factors: [2, 5, 10], instruction: 'Regn ut. Tenk like grupper.' },
    2: { numbers: '', factors: [3, 4], instruction: 'Regn ut. Doble hvis du kan.' },
    3: { numbers: '', factors: [3, 4, 5] },
  }),
  'mult.tabell-6-9': tableTasks({
    1: { numbers: '', factors: [6], instruction: 'Regn ut. Bruk 3-gangen og doble.' },
    2: { numbers: '', factors: [7, 8] },
    3: { numbers: '', factors: [6, 7, 8, 9] },
  }),
  'mult.tiere-hundrere': tableTasks({
    1: { numbers: '', factors: [10], groups: [2, 9], instruction: 'Regn ut. Hva skjer når du ganger med 10?' },
    2: { numbers: '', factors: [20, 30, 40, 50], groups: [2, 9], instruction: 'Regn ut. Gang med tieren.' },
    3: { numbers: '', factors: [100, 200, 300, 400, 500], groups: [2, 9], instruction: 'Regn ut med hundrere.' },
  }),
  'mult.dele-opp': byLevel(
    (n) => five((i): TaskSpec => [H, vary(n, i, 11, 19), '*', vary(n + 1, i, 2, 5), 'Del opp: gang tieren og eneren hver for seg.']),
    (n) => five((i): TaskSpec => [H, vary(n, i, 21, 49), '*', vary(n + 1, i, 3, 6), 'Del opp: gang tierne og enerne hver for seg.']),
    (n) => five((i): TaskSpec => [H, vary(n, i, 52, 98), '*', vary(n + 1, i, 4, 9), 'Del opp tallet på en smart måte, og regn ut.']),
  ),
  'mult.blokkmodeller': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 2, 5), vary(n + 1, i, 3, 6)]
        return [H, a, '*', b, `Tegn en blokkmodell: ${a} esker med ${b} blyanter i hver. Hvor mange blyanter er det?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 3, 8), vary(n + 1, i, 4, 9)]
        return [H, a, '*', b, `Tegn en blokkmodell: ${a} poser med ${b} klinkekuler i hver. Hvor mange klinkekuler er det?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 3, 6), vary(n + 1, i, 12, 25)]
        return [H, a, '*', b, `Tegn en blokkmodell: ${a} rader med ${b} stoler i hver. Hvor mange stoler er det?`]
      }),
  ),
  'mult.kombinasjoner': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 2, 3), vary(n + 1, i, 2, 4)]
        return [H, a, '*', b, `Du har ${a} bukser og ${b} gensere. Hvor mange ulike antrekk kan du lage?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 3, 5), vary(n + 1, i, 3, 6)]
        return [H, a, '*', b, `En iskiosk har ${a} smaker og ${b} typer strøssel. Hvor mange ulike is med én smak og ett strøssel kan du lage?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 4, 6), vary(n + 1, i, 5, 8)]
        return [H, a, '*', b, `Du kan velge mellom ${a} typer brød og ${b} typer pålegg. Hvor mange ulike smørbrød kan du lage?`]
      }),
  ),

  // Divisjon
  'div.mult-og-div': byLevel(
    (n) => divide([2, 5, 10], n, 'Regn ut. Hvilket gangestykke hjelper deg?'),
    (n) => divide([3, 4, 6], n, 'Regn ut. Hvilket gangestykke hjelper deg?'),
    (n) => divide([7, 8, 9], n, 'Regn ut, og sjekk svaret med gange.'),
  ),
  // Uten divisjonstype i profilen (repetisjon, Strategier i divisjon) blandes de to typene som før.
  'div.delings-malings': (level, n, profile) =>
    profile?.divisionType === 'deling'
      ? sharingDivision(level, n)
      : profile?.divisionType === 'maling'
        ? measuringDivision(level, n)
        : mixedDivision(level, n),
  'div.rest': (level, n, profile) =>
    profile?.taskVariant === 'hverdag'
      ? everydayRemainder(level, n)
      : five((i): TextSpec => {
      const d = pick(level === 1 ? [2, 3, 5] : level === 2 ? [4, 6] : [6, 7, 8], i + n)
      const q = vary(n, i, 2, level === 1 ? 6 : 9)
      const r = vary(n + 1, i, 1, d - 1)
      const a = d * q + r
      return level < 3
        ? { text: `Regn ut. Hvor mye blir til overs?\n${a} : ${d} = ___`, solution: `${q}, og ${r} til overs  (${q} · ${d} + ${r} = ${a})` }
        : {
            text: `${a} elever skal sitte ${d} ved hvert bord. Hvor mange bord trengs?`,
            solution: `${q + 1} bord  (${a} : ${d} = ${q} med ${r} til overs, så det trengs ett bord til)`,
          }
    }),
  // Modelloppgaver: eleven tegner, leser eller tolker en konkret representasjon beskrevet i teksten.
  'div.modeller': (level, n) => divisionModelTasks(level, n),

  // Geometri
  'geo.2d': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const k = vary(n, i, 2, 9)
        return i % 2 === 0
          ? [H, k, '*', 3, `En trekant har 3 hjørner. Hvor mange hjørner har ${k} trekanter?`]
          : [H, k, '*', 4, `En firkant har 4 sider. Hvor mange sider har ${k} firkanter?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const s = vary(n, i, 3, 12)
        return i % 2 === 0
          ? [H, 4, '*', s, `Et kvadrat har sider på ${s} cm. Hva er omkretsen?`]
          : [H, 6, '*', s, `En sekskant har seks like lange sider på ${s} cm. Hva er omkretsen?`]
      }),
    (n) =>
      five((i): TextSpec => {
        const [l, b] = [vary(n, i, 4, 12), vary(n + 1, i, 2, 7)]
        return { text: `Et rektangel er ${l} cm langt og ${b} cm bredt. Hva er omkretsen?`, solution: `${2 * (l + b)} cm  (${l} + ${b} + ${l} + ${b})` }
      }),
  ),
  'geo.3d': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const k = vary(n, i, 2, 8)
        return [H, k, '*', 6, `En kube har 6 sideflater. Hvor mange sideflater har ${k} kuber til sammen?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const k = vary(n, i, 2, 9)
        return [H, k, '*', 8, `En kube har 8 hjørner. Hvor mange hjørner har ${k} kuber til sammen?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const k = vary(n, i, 2, 9)
        return [H, k, '*', 12, `En kube har 12 kanter. Hvor mange kanter har ${k} kuber til sammen?`]
      }),
  ),
  'geo.3d-til-2d': (level, n) => {
    const nets = [
      ['En kube brettes ut. Hvor mange kvadrater består utbrettingen av?', '6 kvadrater'],
      ['Et trekantet prisme brettes ut. Hvilke figurer består utbrettingen av?', '2 trekanter og 3 rektangler'],
      ['En pyramide med kvadratisk grunnflate brettes ut. Hvilke figurer ser du?', '1 kvadrat og 4 trekanter'],
      ['En sylinder brettes ut. Hvilke figurer ser du?', '2 sirkler og 1 rektangel'],
      ['En eske (et rett prisme med rektangler) brettes ut. Hvor mange rektangler blir det?', '6 rektangler'],
    ]
    return five((i): TextSpec => {
      const [q, a] = pick(nets, i + n)
      const prefix = level === 3 ? 'Tegn utbrettingen. ' : ''
      const suffix = level === 2 ? ' Forklar hvordan du vet det.' : ''
      return { text: `${prefix}${q}${suffix}`, solution: a }
    })
  },
  'geo.vinkler': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const x = 10 * vary(n, i, 1, 8)
        return [H, 90, '-', x, `En rett vinkel er 90°. Den deles i to vinkler. Den ene er ${x}°. Hvor stor er den andre?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const x = 10 * vary(n, i, 2, 16)
        return [H, 180, '-', x, `Vinklene på en rett linje er 180° til sammen. Den ene vinkelen er ${x}°. Hvor stor er den andre?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const two = 10 * vary(n, i, 9, 15)
        return [H, 180, '-', two, `Vinklene i en trekant er 180° til sammen. To av vinklene er ${two}° til sammen. Hvor stor er den tredje?`]
      }),
  ),

  // Problemløsing
  'prob.regnefortellinger': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [p, q] = [vary(n, i, 12, 45), vary(n + 1, i, 10, 35)]
        return [H, p, '+', q, `Skriv et regneuttrykk og regn ut: En is koster ${p} kr og en brus koster ${q} kr. Hva koster de til sammen?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const p = vary(n, i, 23, 89)
        return [H, 100, '-', p, `Skriv et regneuttrykk og regn ut: Du betaler med en 100-lapp for en vare som koster ${p} kr. Hvor mye får du igjen?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [p, k] = [vary(n, i, 12, 49), vary(n + 2, i, 3, 8)]
        return [H, k, '*', p, `Skriv et regneuttrykk og regn ut: Én bok koster ${p} kr. Hva koster ${k} bøker?`]
      }),
  ),
  'prob.modeller': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 12, 40), vary(n + 1, i, 3, 15)]
        return [H, a, '+', b, `Tegn en modell: Ida har ${a} kort. Ola har ${b} flere enn Ida. Hvor mange kort har Ola?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const b = vary(n, i, 12, 40)
        const a = b + vary(n + 1, i, 5, 30)
        return [H, a, '-', b, `Tegn en modell: Emil har ${a} kort og Sara har ${b}. Hvor mange flere kort har Emil?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const d = pick([3, 4, 5, 6], i + n)
        const total = d * vary(n, i, 6, 15)
        return [H, total, '/', d, `Tegn en modell: ${total} kort deles likt på ${d} barn. Hvor mange får hver?`]
      }),
  ),
  'prob.flersteg': byLevel(
    (n) =>
      five((i): TextSpec => {
        const p = vary(n, i, 10, 20)
        const m = pick([50, 100], i + n)
        return { text: `Ola har ${m} kr. Han kjøper 2 is som koster ${p} kr hver. Hvor mye har han igjen?`, solution: `${m - 2 * p} kr  (2 · ${p} = ${2 * p}, ${m} − ${2 * p} = ${m - 2 * p})` }
      }),
    (n) =>
      five((i): TextSpec => {
        const d = pick([2, 3, 4], i + n)
        const total = d * vary(n, i, 5, 8)
        const girls = vary(n + 1, i, 4, total - 4)
        return {
          text: `En klasse har ${girls} jenter og ${total - girls} gutter. De deles i grupper på ${d}. Hvor mange grupper blir det?`,
          solution: `${total / d} grupper  (${girls} + ${total - girls} = ${total}, ${total} : ${d} = ${total / d})`,
        }
      }),
    (n) =>
      five((i): TextSpec => {
        const [p, d, x] = [vary(n, i, 5, 15), vary(n + 1, i, 3, 7), vary(n + 2, i, 4, 20)]
        return {
          text: `Mia leser ${p} sider hver dag i ${d} dager, og så ${x} sider til. Hvor mange sider har hun lest?`,
          solution: `${p * d + x} sider  (${d} · ${p} = ${p * d}, ${p * d} + ${x} = ${p * d + x})`,
        }
      }),
  ),
  'prob.flervalg': (level, n) =>
    five((i): TextSpec => {
      const a = vary(n, i, level === 1 ? 12 : 25, level === 1 ? 48 : 89)
      const b = vary(n + 1, i, level === 1 ? 11 : 3, level === 1 ? 39 : 9)
      const [expression, correct] =
        level === 1 ? [`${a} + ${b}`, a + b] : level === 2 ? [`${a + b} − ${b}`, a] : [`${b} · ${a}`, a * b]
      const options = [correct, correct + 10, correct - 1]
      const order = [i % 3, (i + 1) % 3, (i + 2) % 3]
      const letters = ['A', 'B', 'C']
      const shown = order.map((k, j) => `${letters[j]}: ${options[k]}`).join('   ')
      return { text: `Hvilket svar er riktig?\n${expression} = ?\n${shown}`, solution: `${letters[order.indexOf(0)]}: ${correct}` }
    }),

  // Tall og regning
  'tr.add-sub': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 12, 48), vary(n + 1, i, 11, 39)]
        return [H, a + b, '-', b, `${a} + ${b} = ${a + b}. Bruk det til å finne ${a + b} − ${b}.`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 120, 480), vary(n + 1, i, 110, 390)]
        return [H, a + b, '-', b, `${a} + ${b} = ${a + b}. Bruk det til å finne ${a + b} − ${b}.`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 1200, 4800), vary(n + 1, i, 1100, 3900)]
        return [H, a + b, '-', a, `${a} + ${b} = ${a + b}. Bruk det til å finne ${a + b} − ${a}.`]
      }),
  ),
  'tr.mult-div': (level, n) =>
    five((i): TaskSpec => {
      const b = pick(level === 1 ? [2, 5, 10] : level === 2 ? [3, 4, 6] : [7, 8, 9], i + n)
      const a = vary(n, i, 2, 10)
      return [H, a * b, '/', b, `${a} · ${b} = ${a * b}. Bruk det til å finne ${a * b} : ${b}.`]
    }),
  'tr.tideler': byLevel(
    (n) =>
      five((i): TextSpec => {
        const t = vary(n, i, 1, 9)
        return { text: `Skriv som desimaltall: ${t} tideler`, solution: `0,${t}` }
      }),
    (n) =>
      five((i): TextSpec => {
        const [h, t] = [vary(n, i, 1, 9), vary(n + 1, i, 1, 9)]
        return { text: `Skriv som desimaltall: ${h} hele og ${t} tideler`, solution: `${h},${t}` }
      }),
    (n) =>
      five((i): TextSpec => {
        const [a, b] = [vary(n, i, 11, 49), vary(n + 1, i, 1, 9)]
        return { text: `Regn ut.\n${dec(a / 10)} + ${dec(b / 10)} = ___`, solution: dec((a + b) / 10) }
      }),
  ),
  'tr.desimal-lengde': byLevel(
    (n) =>
      five((i): TextSpec => {
        const [c, mm] = [vary(n, i, 2, 15), vary(n + 1, i, 1, 9)]
        return { text: `En blyant er ${c} cm og ${mm} mm lang. Skriv lengden i centimeter med desimaltall.`, solution: `${c},${mm} cm` }
      }),
    (n) =>
      five((i): TextSpec => {
        const m = vary(n, i, 11, 49)
        return { text: `${dec(m / 10)} m er hvor mange centimeter?`, solution: `${m * 10} cm` }
      }),
    (n) =>
      five((i): TextSpec => {
        const [c, mm] = [vary(n, i, 2, 25), vary(n + 1, i, 1, 9)]
        return { text: `Hvor mange millimeter er ${c},${mm} cm?`, solution: `${c * 10 + mm} mm` }
      }),
  ),

  // Strategier i divisjon
  'sdiv.hte': byLevel(
    (n) => divide([2, 3, 4], n, 'Del tierne og enerne hver for seg.', 11, 24),
    (n) => divide([2, 3, 4, 5], n, 'Del tierne og enerne hver for seg.', 21, 48),
    (n) => divide([3, 4, 5, 6, 7, 8], n, 'Del hundrerne, tierne og enerne hver for seg.', 25, 120),
  ),
  'sdiv.gode-mater': byLevel(
    (n) => divide([2], n, 'Del på 2 ved å halvere.', 11, 49),
    (n) => divide([4], n, 'Del på 4: halver to ganger.', 11, 30),
    (n) => divide([8], n, 'Del på 8: halver tre ganger.', 11, 25),
  ),
  'sdiv.sammenhenger': (level, n) =>
    five((i): TaskSpec => {
      const d = pick(level === 1 ? [2, 5] : level === 2 ? [3, 4, 6] : [7, 8, 9], i + n)
      const base = d * vary(n, i, 2, 9)
      return [H, base * 10, '/', d, `${base} : ${d} = ${base / d}. Hva er ${base * 10} : ${d}?`]
    }),
  'sdiv.10-100': byLevel(
    (n) => five((i): TaskSpec => [H, 10 * vary(n, i, 2, 9), '/', 10, 'Regn ut. Hva skjer med sifrene når du deler på 10?']),
    (n) => five((i): TaskSpec => [H, 10 * vary(n, i, 11, 99), '/', 10, 'Regn ut. Hva skjer med sifrene når du deler på 10?']),
    (n) => five((i): TaskSpec => [H, 100 * vary(n, i, 2, 99), '/', 100, 'Regn ut. Hva skjer med sifrene når du deler på 100?']),
  ),
  // Samme ferdighet som i høstens divisjon, men med andre tall.
  'sdiv.malings-delings': (level, n) => skillTasks['div.delings-malings'](level, n + 3),
  'sdiv.del-av-hel': byLevel(
    (n) =>
      five((i): TextSpec => {
        const d = pick([2, 3, 4, 6, 8], i + n)
        return { text: `En pizza er delt i ${d} like store biter. Du spiser 1 bit. Hvor stor del av pizzaen har du spist? Skriv som brøk.`, solution: `1/${d}` }
      }),
    (n) =>
      five((i): TextSpec => {
        const d = pick([4, 5, 6, 8, 10], i + n)
        const k = vary(n, i, 2, d - 1)
        return { text: `En sjokolade har ${d} like store biter. Du spiser ${k} biter. Hvor stor del har du spist? Skriv som brøk.`, solution: `${k}/${d}` }
      }),
    (n) =>
      five((i): TextSpec => {
        const a = pick([2, 3, 4, 5], i + n)
        const b = a + vary(n, i, 1, 6)
        return { text: `Hvilken brøk er størst: 1/${a} eller 1/${b}? Forklar hvorfor.`, solution: `1/${a}  (jo færre biter en hel deles i, jo større blir hver bit)` }
      }),
  ),
  'sdiv.del-av-mengde': (level, n) =>
    five((i): TaskSpec => {
      const d = pick(level === 1 ? [2, 4] : level === 2 ? [3, 4, 5] : [5, 8, 10], i + n)
      const a = d * vary(n, i, level === 3 ? 5 : 2, level === 3 ? 20 : 10)
      return [H, a, '/', d, `Hva er 1/${d} av ${a}?`]
    }),

  // Måling
  // Volum i liter og desiliter (ikke kuber – de ble bare gangestykker).
  'mal.volum': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 2, 5), vary(n + 1, i, 1, 4)]
        return [H, a, '+', b, `En kanne har ${a} dl saft. Du heller i ${b} dl til. Hvor mange dl er det i kanna nå?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const liters = vary(n, i, 1, 3)
        const used = vary(n + 1, i, 2, 9)
        return [H, liters * 10, '-', used, `En flaske har ${liters} liter vann (${liters * 10} dl). Du heller ut ${used} dl. Hvor mange dl er igjen?`]
      }),
    (n) =>
      five((i): TextSpec => {
        const x = vary(n, i, 11, 39)
        return { text: `${dec(x / 10)} liter er hvor mange desiliter?`, solution: `${x} dl  (1 liter = 10 dl)` }
      }),
  ),
  'mal.liter-dl': byLevel(
    (n) => five((i): TaskSpec => [H, vary(n, i, 2, 9), '*', 10, 'Hvor mange desiliter er så mange liter? (1 liter = 10 dl)']),
    (n) => five((i): TaskSpec => [H, 10 * vary(n, i, 2, 9), '/', 10, 'Hvor mange liter er så mange desiliter? (10 dl = 1 liter)']),
    (n) =>
      five((i): TaskSpec => {
        const g = pick([1, 2, 5], i + n)
        return [H, 10, '/', g, `Hvor mange glass på ${g} dl kan du fylle fra 1 liter (10 dl)?`]
      }),
  ),
  // Lengde: cm og mm, m og cm, og sammenligne lengder.
  'mal.lengde': byLevel(
    (n) => five((i): TaskSpec => [H, vary(n, i, 2, 9), '*', 10, 'Hvor mange millimeter er så mange centimeter? (1 cm = 10 mm)']),
    (n) =>
      five((i): TextSpec => {
        const [cm, mm] = [vary(n, i, 2, 15), vary(n + 1, i, 1, 9)]
        return { text: `Hvor mange millimeter er ${cm} cm og ${mm} mm?`, solution: `${cm * 10 + mm} mm  (${cm} · 10 + ${mm})` }
      }),
    (n) =>
      five((i): TextSpec => {
        const m = vary(n, i, 1, 5)
        const cm = 100 * m + 10 * vary(n + 1, i, -5, 5)
        const sign = 100 * m > cm ? '>' : 100 * m < cm ? '<' : '='
        return { text: `Sett inn riktig tegn: <, > eller =.\n${m} m ___ ${cm} cm`, solution: `${m} m ${sign} ${cm} cm  (${m} m = ${100 * m} cm)` }
      }),
  ),
  'mal.kg-g': byLevel(
    (n) => five((i): TaskSpec => [H, vary(n, i, 2, 9), '*', 1000, 'Hvor mange gram er så mange kilo? (1 kg = 1000 g)']),
    (n) => five((i): TaskSpec => [H, 100 * vary(n, i, 2, 9), '+', 100 * vary(n + 1, i, 1, 8), 'Hvor mange gram er det til sammen?']),
    (n) =>
      five((i): TaskSpec => {
        const p = pick([100, 200, 250, 500], i + n)
        return [H, 1000, '/', p, `Hvor mange poser på ${p} g går det på 1 kg (1000 g)?`]
      }),
  ),
  'mal.areal': (level, n) =>
    five((i): TaskSpec => {
      const rows = vary(n, i, 2, level === 1 ? 5 : 9)
      const cols = vary(n + 1, i, 3, level === 3 ? 12 : 8)
      return [H, rows, '*', cols, `Et rektangel har ${rows} rader med ${cols} ruter i hver. Hver rute er 1 cm². Hva er arealet?`]
    }),
  'mal.areal-omkrets': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [l, b] = [vary(n, i, 3, 9), vary(n + 1, i, 2, 6)]
        return [H, l, '*', b, `Et rektangel er ${l} cm langt og ${b} cm bredt. Hva er arealet i cm²?`]
      }),
    (n) =>
      five((i): TextSpec => {
        const [l, b] = [vary(n, i, 4, 12), vary(n + 1, i, 2, 7)]
        return { text: `Et rektangel er ${l} cm langt og ${b} cm bredt. Hva er omkretsen, og hva er arealet?`, solution: `Omkrets ${2 * (l + b)} cm, areal ${l * b} cm²` }
      }),
    (n) =>
      five((i): TextSpec => {
        const s = vary(n, i, 2, 9)
        return { text: `Et kvadrat har omkrets ${4 * s} cm. Hva er arealet?`, solution: `${s * s} cm²  (siden er ${4 * s} : 4 = ${s} cm, og ${s} · ${s} = ${s * s})` }
      }),
  ),
  'mal.tid': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const k = vary(n, i, 2, 4)
        return [H, k, '*', 15, `Et kvarter er 15 minutter. Hvor mange minutter er ${k} kvarter?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const start = 5 * vary(n, i, 1, 5)
        const end = start + 5 * vary(n + 3, i, 3, 6)
        const pad = (m: number) => String(m).padStart(2, '0')
        return [H, end, '-', start, `Filmen begynner kl. 18.${pad(start)} og slutter kl. 18.${pad(end)}. Hvor mange minutter varer den?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const hours = vary(n, i, 2, 6)
        return [H, hours, '*', 60, `En time er 60 minutter. Hvor mange minutter er ${hours} timer?`]
      }),
  ),

  // Mønster og algoritmer
  'mon.utforske': (level, n) =>
    five((i): TaskSpec => {
      const d = vary(n, i, level === 1 ? 2 : 3, level === 3 ? 12 : 9)
      const s = vary(n + 1, i, 1, 20)
      const seq = [s, s + d, s + 2 * d, s + 3 * d]
      return [H, seq[3], '+', d, `Tallfølgen er ${seq.join(', ')}. Hva er neste tall?`]
    }),
  'mon.figurtall': (level, n) =>
    five((i): TextSpec => {
      const [s, d] = [vary(n, i, 1, 5), vary(n + 1, i, 2, 4)]
      const k = level === 1 ? 4 : level === 2 ? 6 : 10
      return {
        text: `Figur 1 har ${s} prikker, figur 2 har ${s + d} og figur 3 har ${s + 2 * d}. Hvor mange prikker har figur ${k}?`,
        solution: `${s + (k - 1) * d} prikker  (det kommer ${d} til hver gang)`,
      }
    }),
  'mon.tallfolger': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const d = vary(n, i, 2, 9)
        const k = vary(n + 2, i, 6, 10)
        return [H, k, '*', d, `Tallfølgen er ${d}, ${2 * d}, ${3 * d} … Hva er tall nummer ${k}?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const d = vary(n, i, 2, 9)
        const start = vary(n, i, 60, 100)
        const seq = [start, start - d, start - 2 * d]
        return [H, seq[2], '-', d, `Tallfølgen er ${seq.join(', ')}. Hva er neste tall?`]
      }),
    (n) =>
      five((i): TextSpec => {
        const start = vary(n, i, 1, 4)
        const seq = [start, start * 2, start * 4, start * 8]
        return { text: `Finn regelen og neste tall: ${seq.join(', ')}, ___`, solution: `${start * 16}  (tallet dobles hver gang)` }
      }),
  ),
  'mon.lokker': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [r, st] = [vary(n, i, 2, 5), vary(n + 1, i, 2, 6)]
        return [H, r, '*', st, `Koden sier: «Gjenta ${r} ganger: gå ${st} steg.» Hvor mange steg går figuren?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [r, st] = [vary(n, i, 3, 8), vary(n + 1, i, 3, 9)]
        return [H, r, '*', st, `Koden sier: «Start på 0. Gjenta ${r} ganger: legg til ${st}.» Hvilket tall ender du på?`]
      }),
    (n) =>
      five((i): TextSpec => {
        const [r, st] = [vary(n, i, 3, 8), vary(n + 1, i, 4, 12)]
        return { text: `Koden sier: «Start på 100. Gjenta ${r} ganger: trekk fra ${st}.» Hvilket tall ender du på?`, solution: `${signed(100 - r * st)}  (${r} · ${st} = ${r * st}, 100 − ${r * st})` }
      }),
  ),
  'mon.vilkar': (level, n) =>
    five((i): TextSpec => {
      let x = vary(n, i, 9, 40)
      const start = x
      for (let k = 0; k < level; k++) x = x % 2 === 0 ? x / 2 : x + 1
      return {
        text: `Koden sier: «Hvis tallet er et partall, del det på 2. Ellers legg til 1.» Start på ${start}. Hvilket tall har du etter ${level} steg?`,
        solution: String(x),
      }
    }),

  // Regning
  'reg.diagrammer': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 4, 12), vary(n + 1, i, 3, 11)]
        return [H, a, '+', b, `I et søylediagram har ${a} elever svart «hund» og ${b} elever «katt». Hvor mange har svart?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const b = vary(n, i, 3, 9)
        const a = b + vary(n + 2, i, 2, 8)
        return [H, a, '-', b, `Søylen for fotball viser ${a} og søylen for håndball viser ${b}. Hvor mange flere liker fotball?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const f = pick([2, 5, 10], i + n)
        const k = vary(n, i, 3, 9)
        return [H, k, '*', f, `I et piktogram betyr hver figur ${f} elever. Hvor mange elever er ${k} figurer?`]
      }),
  ),
  'reg.tabeller': byLevel(
    (n) =>
      five((i): TaskSpec => {
        const b = vary(n, i, 3, 12)
        const a = b + vary(n + 1, i, 2, 10)
        return [H, a, '-', b, `Tabellen viser at ${a} elever går til skolen og ${b} sykler. Hvor mange flere går?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 12, 48), vary(n + 1, i, 11, 39)]
        return [H, a, '+', b, `Tabellen viser at klassen leste ${a} bøker i oktober og ${b} i november. Hvor mange bøker er det til sammen?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const [a, b] = [vary(n, i, 3, 9), vary(n + 1, i, 6, 12)]
        return [H, a, '*', b, `Tabellen viser at hver pakke har ${b} kjeks. Hvor mange kjeks er det i ${a} pakker?`]
      }),
  ),
  'reg.fire-regnearter': (level, n) =>
    five((i) => {
      const from = ['tall.addisjon-subtraksjon', 'mult.tabell-2-10', 'div.mult-og-div', 'mult.tabell-6-9']
      return skillTasks[pick(from, i + n)](level, n + i)[i]
    }),
  'reg.algebra': (level, n) =>
    five((i): TextSpec => {
      const [a, b] = [vary(n, i, 3, 20), vary(n + 1, i, 2, 9)]
      if (level === 1) return { text: `Hvilket tall skjuler seg bak □?\n□ + ${b} = ${a + b}`, solution: String(a) }
      if (level === 2) return { text: `Hvilket tall skjuler seg bak □?\n${b} · □ = ${b * a}`, solution: String(a) }
      return { text: `Hvilket tall skjuler seg bak □?\n□ − ${b} = ${a}`, solution: String(a + b) }
    }),
}

/** To oppgaver er like når teksten, eller regnestykket, er det samme. */
export const taskKey = (task: GeneratedTask) => (isTextSpec(task) ? task.text : `${task[1]} ${task[2]} ${task[3]}`)

function round(skills: string[], level: Level, n: number, profile?: TaskProfile): GeneratedTask[] {
  if (skills.length === 1) return skillTasks[skills[0]](level, n, profile)
  return five((i) => skillTasks[pick(skills, i)](level, n + i, profile)[i])
}

/**
 * Fem ulike oppgaver på nivået for økt nummer `n`. Har økta flere undertemaer, byttes det på.
 * Med profil følger tallene profilen (f.eks. bare 0- og 1-gangen). Like oppgaver byttes ut.
 */
export function tasksFor(skills: string[], level: Level, n: number, profile?: TaskProfile): GeneratedTask[] {
  const seen = new Set<string>()
  const result: GeneratedTask[] = []
  // Nye runder med andre tall til det er fem ulike (noen profiler har få mulige stykker).
  for (let attempt = 0; attempt < 12 && result.length < 5; attempt++) {
    for (const task of round(skills, level, n + attempt * 5, profile)) {
      if (result.length < 5 && !seen.has(taskKey(task))) {
        seen.add(taskKey(task))
        result.push(task)
      }
    }
  }
  return result
}

export const isTextSpec = (task: GeneratedTask): task is TextSpec => !Array.isArray(task)

/** Alle undertemaene som har oppgaveregler (brukes til å sjekke at årsplanen er komplett). */
export const skillsWithTasks = Object.keys(skillTasks)

// ---------------------------------------------------------------------------------------
// Periodene

const repetitionLevels: UnitSpec['levels'] = [
  { title: 'Grunnleggende', subtitle: 'Det vi har lært.', description: 'Øve på det grunnleggende.' },
  { title: 'Øve videre', subtitle: 'Større tall.', description: 'Velge en god strategi.' },
  { title: 'Utfordring', subtitle: 'Store tall og tekstoppgaver.', description: 'Forklare hvordan jeg tenker.' },
]

const s = (heading: string, ...skills: string[]): SessionPlan => ({ heading, skills })

/** Økt med oppgaveprofil. */
const p = (heading: string, skills: string[], profile: TaskProfile): SessionPlan => ({ heading, skills, profile })

const unique = (list: number[]) => [...new Set(list)].sort((a, b) => a - b)

const shortTimes = {
  formats: ['Hoderegning'],
  steps: 'Ett steg. Ingen delspørsmål.',
  figures: false,
}

/**
 * Gangeøkt: gangestykker med bare gangetabellene i `levels`. Alle nivåene i en økt bruker de samme
 * gangetabellene – nivåene skiller seg i støtte, tallområde og hvor selvstendig eleven regner.
 */
const timesProfile = (
  focus: string,
  levels: [LevelProfile, LevelProfile, LevelProfile],
  extra: Partial<TaskProfile> = {},
): TaskProfile => ({
  focus,
  operations: ['*'],
  factors: unique(levels.flatMap((l) => l.factors ?? [])),
  ...shortTimes,
  avoid: ['Gangetabeller som økta ikke handler om', 'Lange tekstoppgaver med flere delspørsmål'],
  levels: { 1: levels[0], 2: levels[1], 3: levels[2] },
  ...extra,
})

/** Hele tiere og hele hundrere (10–90 og 100–900). */
const TENS_AND_HUNDREDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900]

/** «2, 5 eller 10» */
const orList = (numbers: number[]) => numbers.join(', ').replace(/, (\d+)$/, ' eller $1')
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Nivå 1–3 i en strategiøkt: samme tabeller. Instruksjonen lages per regnestykke (strategyInstruction):
 * konkret mellomsteg på nivå 1, strategi i ord på nivå 2 og åpen på nivå 3. Nivå 3 har ikke 0 og 1
 * som det andre tallet, så stykkene gir en reell strategiutfordring.
 */
const strategyLevels = (tables: number[], name: string): [LevelProfile, LevelProfile, LevelProfile] => [
  {
    title: `${capitalize(name)} med støtte`,
    subtitle: 'Konkret hjelp i hvert stykke.',
    description: `Bruke ${name} med et konkret mellomsteg, f.eks. «Finn 5 · 4 og legg til 2 · 4».`,
    numbers: `Tall fra 2 til 5 ganget med ${orList(tables)}`,
    factors: tables,
    groups: [2, 5],
  },
  {
    title: capitalize(name),
    subtitle: 'Strategi i ord.',
    description: `Bruke ${name} med en foreslått strategi, f.eks. dobling eller 10-gangen minus grupper.`,
    numbers: `Tall fra 2 til 10 ganget med ${orList(tables)}`,
    factors: tables,
    groups: [2, 10],
  },
  {
    title: `${capitalize(name)} – selvstendig`,
    subtitle: 'Velg strategi selv.',
    description: `Bruke ${name} blandet og velge en smart strategi selv.`,
    numbers: `Tall fra 3 til 10 ganget med ${orList(tables)}, blandet`,
    factors: tables,
    groups: [3, 10],
    instruction: OPEN_STRATEGY,
  },
]

/** Nivå 1–3 i en tabelløkt: samme tabeller, mer støtte på nivå 1 og mer selvstendighet på nivå 3. */
const tableLevels = (
  tables: number[],
  name: string,
  support: string,
  standard: string,
  independent: string,
): [LevelProfile, LevelProfile, LevelProfile] => [
  {
    title: `${capitalize(name)} med støtte`,
    subtitle: 'Små tall og tydelig struktur.',
    description: `Bruke ${name} med små tall. ${support}`,
    numbers: `Tall fra 1 til 5 ganget med ${orList(tables)}`,
    factors: tables,
    groups: [1, 5],
    instruction: `Regn ut. ${support}`,
  },
  {
    title: capitalize(name),
    subtitle: 'Hele tabellen.',
    description: `Bruke ${name} med tall fra 0 til 10. ${standard}`,
    numbers: `Tall fra 0 til 10 ganget med ${orList(tables)}`,
    factors: tables,
    groups: [1, 10],
    instruction: `Regn ut. ${standard}`,
  },
  {
    title: `${capitalize(name)} – selvstendig`,
    subtitle: 'Blandet, uten hjelp.',
    description: `Bruke ${name} blandet og velge strategi selv. ${independent}`,
    numbers: `Tall fra 0 til 10 ganget med ${orList(tables)}, blandet`,
    factors: tables,
    groups: [0, 10],
    instruction: `Regn ut. ${independent}`,
  },
]

// ---------------------------------------------------------------------------------------
// Tall og plassverdi: hver økt har ett hovedområde i referansebanken (og eventuelt tilgrensende områder).
// Nivåene følger samme støttestruktur i alle områdene – forskjellen er ikke bare større tall.

const PLACE_VALUE_SUPPORT: Record<Level, string> = {
  1: 'Tydelig støtte og oversiktlig oppsett, hovedsakelig ett faglig steg.',
  2: 'Mindre støtte og mer selvstendig strategivalg, med tierovergang eller veksling der det passer.',
  3: 'Resonnering: flere steg, feilanalyse, ukjent tall eller forklaring der det passer – ikke bare større tall.',
}

type LevelText = Pick<LevelProfile, 'title' | 'subtitle' | 'description' | 'numbers'>

const PLACE_VALUE_LEVELS: Record<PlaceValueArea, [LevelText, LevelText, LevelText]> = {
  hoderegning: [
    { title: 'Hoderegning med støtte', subtitle: 'Oppgitt strategi, ett steg.', description: 'Bruke en oppgitt strategi, f.eks. tiervenner, hundrervenner eller hele tiere og hundrere, i hovedsakelig ett steg.', numbers: 'Tall opptil 1000: tiervenner, hundrervenner, hele tiere og hundrere' },
    { title: 'Hoderegning – velg strategi', subtitle: 'Oppdeling og kompensasjon.', description: 'Bruke oppdeling eller kompensasjon selvstendig, f.eks. 198 + 36 som 200 + 36 − 2.', numbers: 'Tall opptil 1000' },
    { title: 'Hoderegning – forklare', subtitle: 'Velge, bruke og forklare.', description: 'Velge, bruke og kort forklare en effektiv strategi, også med ukjent tall og flere mentale steg.', numbers: 'Tall opptil 1000' },
  ],
  'firesifrede-tall': [
    { title: 'Plassverdi med støtte', subtitle: 'Sifferverdi og bygge tall.', description: 'Finne verdien til et siffer og bygge firesifrede tall med tydelig støtte.', numbers: 'Firesifrede tall' },
    { title: 'Plassverdi', subtitle: 'Dele opp, sammenligne og sortere.', description: 'Dele opp firesifrede tall i utvidet form, sammenligne og sortere dem.', numbers: 'Firesifrede tall' },
    { title: 'Plassverdi – resonnere', subtitle: 'Vilkår og endringer.', description: 'Konstruere tall fra vilkår og forklare hvordan en endring i én plassverdi endrer tallet.', numbers: 'Firesifrede tall' },
  ],
  'addisjon-subtraksjon': [
    { title: 'Uten tierovergang', subtitle: 'Ett steg med støtte.', description: 'Legge sammen og trekke fra uten tierovergang eller veksling.', numbers: 'Tall opptil 1000 uten tierovergang eller veksling' },
    { title: 'Med tierovergang og veksling', subtitle: 'Mindre støtte.', description: 'Legge sammen med tierovergang og trekke fra med veksling.', numbers: 'Tall opptil 1000 med tierovergang eller veksling' },
    { title: 'Flere steg', subtitle: 'Resonnere og kontrollere.', description: 'Løse oppgaver i flere steg, finne ukjent tall og kontrollere med motsatt regneart.', numbers: 'Tall opptil 10 000' },
  ],
  'oppstilling-over-1000': [
    { title: 'Oppstilling med støtte', subtitle: 'Uten veksling.', description: 'Stille opp firesifrede tall med enere under enere, uten veksling.', numbers: 'Firesifrede tall uten veksling' },
    { title: 'Oppstilling med veksling', subtitle: 'Veksling i flere kolonner.', description: 'Stille opp og veksle i addisjon og subtraksjon.', numbers: 'Firesifrede tall med veksling' },
    { title: 'Oppstilling – resonnere', subtitle: 'Veksling gjennom nuller og flere steg.', description: 'Veksle gjennom nuller, finne feil i en oppstilling og løse oppgaver i flere steg.', numbers: 'Tall over 1000, også veksling gjennom nuller' },
  ],
  'negative-tall': [
    { title: 'Negative tall med støtte', subtitle: 'Temperatur og tallinje.', description: 'Lese og sammenligne negative tall i kjente situasjoner.', numbers: 'Hele tall fra −10 til 10' },
    { title: 'Regne med negative tall', subtitle: 'Endringer over og under null.', description: 'Finne ny verdi når et tall stiger eller synker forbi null.', numbers: 'Hele tall fra −20 til 20' },
    { title: 'Negative tall – resonnere', subtitle: 'Flere endringer og ukjent start.', description: 'Følge flere endringer, regne baklengs og forklare avstander på tallinjen.', numbers: 'Hele tall fra −20 til 20' },
  ],
}

const PLACE_VALUE_FORMATS: Record<PlaceValueArea, string[]> = {
  hoderegning: ['Hoderegning (regnestykke)', 'Korte tekstoppgaver der det passer'],
  'firesifrede-tall': ['Hoderegning (regnestykke) og korte tekstoppgaver om plassverdi'],
  'addisjon-subtraksjon': ['Hoderegning eller oppstilling (regnestykke)', 'Korte tekstoppgaver på nivå 2 og 3'],
  'oppstilling-over-1000': ['Oppstilling (regnestykke)'],
  'negative-tall': ['Korte tekstoppgaver med negative tall'],
}

/**
 * Øktprofil i Tall og plassverdi. `ownLevelTexts: false` for økter med egne nivåtekster fra før
 * (sessions/mockData.ts): da får profilen bare tallområde og støttestruktur, så AI-en og læreren ser de samme nivåene.
 */
const placeValueProfile = (
  area: PlaceValueArea,
  focus: string,
  {
    secondaryAreas,
    ownLevelTexts = true,
    taskVariant,
    requiresCarry,
  }: { secondaryAreas?: PlaceValueArea[]; ownLevelTexts?: boolean; taskVariant?: FourDigitVariant | 'strategier'; requiresCarry?: boolean } = {},
): TaskProfile => ({
  focus,
  area,
  ...(secondaryAreas && { secondaryAreas }),
  ...(taskVariant && { taskVariant }),
  ...(requiresCarry && { requiresCarry }),
  operations: ['+', '-'],
  formats: PLACE_VALUE_FORMATS[area],
  steps: 'Ett faglig steg på nivå 1. Nivå 2 kan ha strategivalg, og nivå 3 kan ha flere steg.',
  avoid: ['Avrunding', 'Deltema fra andre fagområder enn økta', 'Lange tekstoppgaver med flere delspørsmål på nivå 1'],
  figures: false,
  levels: Object.fromEntries(
    PLACE_VALUE_LEVELS[area].map((text, i) => {
      const level = (i + 1) as Level
      const levelProfile: LevelProfile = ownLevelTexts ? { ...text, support: PLACE_VALUE_SUPPORT[level] } : { numbers: text.numbers, support: PLACE_VALUE_SUPPORT[level] }
      return [level, levelProfile]
    }),
  ) as Record<Level, LevelProfile>,
})

// ---------------------------------------------------------------------------------------
// Divisjon: fire fagområder i progresjon – multiplikasjon og divisjon, delingsdivisjon og
// målingsdivisjon, divisjon med noe til overs og bruke modeller. Hver økt har ett hovedområde.

const DIVISION_SUPPORT: Record<Level, string> = {
  1: 'Tydelig støtte og små tall, ett faglig steg.',
  2: 'Mindre støtte: eleven velger fremgangsmåte selv og skriver divisjonsstykket.',
  3: 'Resonnering: forklare, begrunne, kontrollere med gange eller tolke svaret – ikke bare større tall.',
}

const DIVISION_LEVELS: Record<DivisionArea | DivisionType, [LevelText, LevelText, LevelText]> = {
  'multiplikasjon-divisjon': [
    { title: 'Gange og dele med støtte', subtitle: 'Bruke et oppgitt gangestykke.', description: 'Bruke et kjent gangestykke til å finne svaret på en divisjon, f.eks. 3 · 6 = 18, så 18 : 3 = 6.', numbers: 'Divisjon som går opp, med divisor og svar fra 1 til 10 (særlig 2, 3, 4, 5 og 10)' },
    { title: 'Gange og dele', subtitle: 'Ukjent faktor og regnefamilier.', description: 'Finne tallet som mangler i et gangestykke og skrive regnefamilier med to gangestykker og to divisjonsstykker.', numbers: 'Hele gangetabellen: divisor og svar fra 2 til 10' },
    { title: 'Gange og dele – forklare', subtitle: 'Kontrollere og forklare.', description: 'Forklare og kontrollere divisjon med gange, også når divisoren er ukjent eller et svar er feil.', numbers: 'Hele gangetabellen, særlig 6, 7, 8 og 9' },
  ],
  'delingsdivisjon-malingsdivisjon': [
    { title: 'To måter å dele på med støtte', subtitle: 'Små tall.', description: 'Dele likt i et kjent antall grupper, eller finne antall grupper når det er like mange i hver.', numbers: 'Divisjon som går opp, med 2–5 grupper eller 2–5 i hver' },
    { title: 'To måter å dele på', subtitle: 'Skille typene.', description: 'Løse delingsdivisjon og målingsdivisjon og forklare hva svaret betyr.', numbers: 'Divisjon som går opp, i hele gangetabellen' },
    { title: 'To måter å dele på – forklare', subtitle: 'Begrunne typen.', description: 'Avgjøre og begrunne om en situasjon er delingsdivisjon eller målingsdivisjon.', numbers: 'Divisjon som går opp, i hele gangetabellen' },
  ],
  deling: [
    { title: 'Dele likt med støtte', subtitle: 'Få grupper, små tall.', description: 'Fordele en mengde likt i et kjent antall grupper og finne hvor mange det blir i hver.', numbers: 'Divisjon som går opp: 2–5 grupper med opptil 8 i hver' },
    { title: 'Dele likt', subtitle: 'Selvstendig i hverdagen.', description: 'Løse delingsdivisjon i hverdagssituasjoner: antall grupper er kjent, svaret er hvor mange i hver.', numbers: 'Divisjon som går opp: 3–6 grupper med opptil 9 i hver' },
    { title: 'Dele likt – forklare', subtitle: 'Hva betyr svaret?', description: 'Løse og forklare delingsdivisjon, og lage egne regnefortellinger der antall grupper er kjent.', numbers: 'Divisjon som går opp: 6–9 grupper med opptil 9 i hver' },
  ],
  maling: [
    { title: 'Hvor mange grupper? med støtte', subtitle: 'Små grupper, små tall.', description: 'Finne hvor mange grupper det blir når det skal være like mange i hver gruppe.', numbers: 'Divisjon som går opp: 2–5 i hver gruppe, opptil 8 grupper' },
    { title: 'Hvor mange grupper?', subtitle: 'Selvstendig i hverdagen.', description: 'Løse målingsdivisjon i hverdagssituasjoner: størrelsen på hver gruppe er kjent, svaret er antall grupper.', numbers: 'Divisjon som går opp: 3–6 i hver gruppe, opptil 9 grupper' },
    { title: 'Hvor mange grupper? – forklare', subtitle: 'Begrunne typen.', description: 'Løse målingsdivisjon og begrunne at størrelsen på hver gruppe er kjent – ikke antall grupper.', numbers: 'Divisjon som går opp: 6–9 i hver gruppe, opptil 9 grupper' },
  ],
  'divisjon-med-rest': [
    { title: 'Noe til overs med støtte', subtitle: 'Hele grupper og rest.', description: 'Finne hvor mange hele grupper det blir og hvor mange som blir til overs.', numbers: 'Tall opptil 35 delt på 2, 3, 4 eller 5' },
    { title: 'Noe til overs', subtitle: 'Hva betyr resten?', description: 'Finne hele grupper og rest, og avgjøre om svaret må rundes opp fordi alle skal få plass.', numbers: 'Tall opptil 60 delt på 4, 5 eller 6' },
    { title: 'Noe til overs – forklare', subtitle: 'Resten bestemmer svaret.', description: 'Tolke resten i situasjonen, forklare når svaret må rundes opp, og løse oppgaver i flere steg.', numbers: 'Tall opptil 80 delt på 6, 7 eller 8' },
  ],
  modeller: [
    { title: 'Modeller med støtte', subtitle: 'Like grupper, tallinje og rutenett.', description: 'Bruke en oppgitt modell – like grupper, hopp på tallinjen eller et rutenett – til å finne svaret.', numbers: 'Divisjon som går opp: 2–5 grupper eller hopp, svar opptil 6' },
    { title: 'Bruke modeller', subtitle: 'Blokkmodell, tallinje og rutenett.', description: 'Tegne eller tolke en blokkmodell, en tallinje eller et rutenett og skrive divisjonsstykket modellen viser.', numbers: 'Divisjon som går opp: divisor 4–6, svar opptil 9' },
    { title: 'Modeller – velge og forklare', subtitle: 'Velge modell selv.', description: 'Velge en modell selv og forklare hva tallene i modellen betyr.', numbers: 'Divisjon som går opp: divisor 6–9, svar opptil 9' },
  ],
}

/** «Dette mestrer jeg» – alle fire fagområdene. */
const DIVISION_SUMMARY_LEVELS: [LevelText, LevelText, LevelText] = [
  { title: 'Divisjon med støtte', subtitle: 'Det vi har lært.', description: 'Dele likt, lage like grupper, finne rest og bruke et kjent gangestykke.', numbers: 'Små tall: divisor 2–5' },
  { title: 'Divisjon', subtitle: 'Velge fremgangsmåte.', description: 'Velge mellom gangestykke, modell og divisjonstype, og finne hva som blir til overs.', numbers: 'Hele gangetabellen' },
  { title: 'Divisjon – forklare', subtitle: 'Forklare og kontrollere.', description: 'Forklare hva svaret og resten betyr, og kontrollere med gange.', numbers: 'Hele gangetabellen' },
]

const DIVISION_FORMATS: Record<DivisionArea, string[]> = {
  'multiplikasjon-divisjon': ['Hoderegning (regnestykke) der instruksjonen viser til et gangestykke', 'Korte tekstoppgaver med utfylling, ukjent faktor, regnefamilie eller forklaring'],
  'delingsdivisjon-malingsdivisjon': ['Korte tekstoppgaver fra hverdagen (eller regnestykke med situasjonen i instruksjonen)'],
  'divisjon-med-rest': ['Korte tekstoppgaver med hele grupper og rest, eller der svaret må rundes opp'],
  modeller: ['Korte tekstoppgaver der eleven tegner, leser eller tolker en modell som er beskrevet i teksten'],
}

const DIVISION_AVOID: Record<DivisionArea | DivisionType, string> = {
  'multiplikasjon-divisjon': 'Rene gangestykker eller delestykker uten sammenheng mellom gange og dele',
  'delingsdivisjon-malingsdivisjon': 'Oppgaver der det er uklart om antall grupper eller størrelsen på hver gruppe er kjent',
  deling: 'Målingsdivisjon (like mange i hver gruppe, finne antall grupper)',
  maling: 'Delingsdivisjon (dele likt i et kjent antall grupper)',
  'divisjon-med-rest': 'Oppgaver der delingen går opp',
  modeller: 'Oppgaver som bare nevner ordet «modell» uten at eleven tegner, leser eller tolker en representasjon',
}

/** Øktprofil i Divisjon. Uten `summary` følger nivåene fagområdet (og divisjonstypen). */
const divisionProfile = (
  area: DivisionArea,
  focus: string,
  { divisionType, secondaryAreas, taskVariant, summary }: { divisionType?: DivisionType; secondaryAreas?: DivisionArea[]; taskVariant?: 'hverdag'; summary?: boolean } = {},
): TaskProfile => {
  const allowsRemainder = area === 'divisjon-med-rest' || secondaryAreas?.includes('divisjon-med-rest')
  const texts = summary ? DIVISION_SUMMARY_LEVELS : DIVISION_LEVELS[divisionType ?? area]
  return {
    focus,
    area,
    ...(secondaryAreas && { secondaryAreas }),
    ...(divisionType && { divisionType }),
    ...(taskVariant && { taskVariant }),
    operations: area === 'multiplikasjon-divisjon' ? ['*', '/'] : ['/'],
    formats: summary ? [...new Set([area, ...(secondaryAreas ?? [])].flatMap((a) => DIVISION_FORMATS[a]))] : DIVISION_FORMATS[area],
    steps: 'Ett faglig steg på nivå 1. Nivå 2 kan ha to steg, og nivå 3 kan be om forklaring eller begrunnelse.',
    avoid: [
      ...(summary ? [] : [DIVISION_AVOID[divisionType ?? area]]),
      ...(allowsRemainder ? [] : ['Divisjon med rest (alle delestykkene i økta går opp)']),
      'Divisjon med 0',
      'Desimaltall og negative tall',
      'Tall utenfor gangetabellen (divisor og svar høyst 10)',
    ],
    figures: false,
    levels: Object.fromEntries(
      texts.map((text, i) => {
        const level = (i + 1) as Level
        return [level, { ...text, support: DIVISION_SUPPORT[level] }]
      }),
    ) as Record<Level, LevelProfile>,
  }
}

/** Måleøkt. */
const measureProfile = (
  focus: string,
  units: string[],
  operations: Operator[],
  levels: [LevelProfile, LevelProfile, LevelProfile],
  extra: Partial<TaskProfile> = {},
): TaskProfile => ({
  focus,
  operations,
  units,
  formats: ['Hoderegning', 'Tekstoppgave'],
  steps: 'Ett steg, høyst to på nivå 3. Ingen delspørsmål.',
  avoid: ['Rene gangestykker der måleenheten ikke betyr noe', 'Kubeoppgaver som bare er gangestykker'],
  figures: false,
  levels: { 1: levels[0], 2: levels[1], 3: levels[2] },
  ...extra,
})

export const unitSpecs: UnitSpec[] = [
  {
    unitId: 'tall',
    title: 'Tall og plassverdi',
    topic: 'Tall og plassverdi',
    area: 'Tall og algebra',
    description:
      'Elevene utforsker plassverdi i firesifrede tall, regner i hodet med smarte strategier, legger sammen og trekker fra med og uten veksling, stiller opp tall over 1000 og møter negative tall på tallinjen.',
    // Økt 1–6 ligger i uke 41–43 og økt 7–14 i uke 44–45 (uke 44 står i sessions/mockData.ts).
    weeks: [
      {
        title: 'Uke 1 - plassverdi',
        sessions: [
          p(
            'Enere, tiere, hundrere og tusenere',
            ['tall.firesifrede'],
            placeValueProfile('firesifrede-tall', 'Plassverdi: sifferets verdi, og å bygge og dele opp tall i tusenere, hundrere, tiere og enere.', { taskVariant: 'plassverdi' }),
          ),
          p(
            'Tall på tallinjen',
            ['tall.firesifrede'],
            placeValueProfile('firesifrede-tall', 'Plassere og lese firesifrede tall på tallinjen ved hjelp av plassverdi.', { taskVariant: 'tallinje' }),
          ),
          p(
            'Større enn og mindre enn',
            ['tall.firesifrede'],
            placeValueProfile('firesifrede-tall', 'Sammenligne og ordne firesifrede tall ved hjelp av plassverdi.', { taskVariant: 'sammenligne' }),
          ),
        ],
      },
      {
        title: 'Uke 2 - plassverdi og hoderegning',
        sessions: [
          p(
            '10 mer og 100 mer – tallmønstre',
            ['tall.hoderegning'],
            placeValueProfile('hoderegning', 'Hoderegning med 10 mer, 100 mer, 10 mindre og 100 mindre, og tallmønstre som bygger på plassverdi.', { secondaryAreas: ['firesifrede-tall'] }),
          ),
          // Økt 5 og 6 (tidligere avrunding, som ikke er med i temaet): samme ID-er og plass i timeplanen.
          p(
            'Bygge og dele opp firesifrede tall',
            ['tall.firesifrede'],
            placeValueProfile(
              'firesifrede-tall',
              'Sifferets verdi, utvidet form, bygge firesifrede tall, sammenligne og sortere dem, og endre én bestemt plassverdi.',
              { taskVariant: 'bygge-dele-opp' },
            ),
          ),
          p(
            'Hoderegning med smarte strategier',
            ['tall.hoderegning'],
            placeValueProfile(
              'hoderegning',
              'Hoderegning med hele tiere og hundrere, tiervenner og hundrervenner, oppdeling, kompensasjon (f.eks. 198 + 36 som 200 + 36 − 2), ukjent tall og enkle regneuttrykk med flere mentale steg.',
              { secondaryAreas: ['addisjon-subtraksjon'], taskVariant: 'strategier' },
            ),
          ),
        ],
      },
      {
        title: 'Uke 3 - addisjon og subtraksjon',
        sessions: [
          // Økt 7–10 vises fra sessions/mockData.ts med egne nivåtekster – profilene har derfor bare tallområde og støtte.
          p(
            'Tiere, enere og smarte regnestrategier',
            ['tall.addisjon-subtraksjon'],
            placeValueProfile('hoderegning', 'Smarte hoderegningsstrategier med tiere og enere: tiervenner, fylle opp en tier og dele opp tall.', {
              secondaryAreas: ['addisjon-subtraksjon'],
              ownLevelTexts: false,
            }),
          ),
          p(
            'Addisjon med tierovergang – forstå og utforske',
            ['tall.addisjon-subtraksjon'],
            placeValueProfile('addisjon-subtraksjon', 'Forstå addisjon med tierovergang: fylle opp en tier og dele opp tall.', {
              secondaryAreas: ['hoderegning'],
              ownLevelTexts: false,
              requiresCarry: true,
            }),
          ),
          p(
            'Addisjon med tierovergang – øve og bruke',
            ['tall.addisjon-subtraksjon'],
            placeValueProfile('addisjon-subtraksjon', 'Øve på addisjon med tierovergang og forklare hvordan man tenker. Alle oppgavene krever veksling i minst én plassverdi.', {
              secondaryAreas: ['hoderegning'],
              ownLevelTexts: false,
              requiresCarry: true,
            }),
          ),
          p(
            'Subtraksjon – ta bort og finne forskjellen',
            ['tall.addisjon-subtraksjon'],
            placeValueProfile('addisjon-subtraksjon', 'Subtraksjon som å ta bort og som å finne forskjellen mellom to tall.', { secondaryAreas: ['hoderegning'], ownLevelTexts: false }),
          ),
        ],
      },
      {
        title: 'Uke 4 - veksling, oppstilling og negative tall',
        sessions: [
          p('Veksle en tier – forstå og utforske', ['tall.addisjon-subtraksjon'], placeValueProfile('addisjon-subtraksjon', 'Forstå veksling: én tier blir ti enere i addisjon og subtraksjon.')),
          p('Subtraksjon med veksling – øve og bruke', ['tall.addisjon-subtraksjon'], placeValueProfile('addisjon-subtraksjon', 'Øve på subtraksjon med veksling og kontrollere med addisjon.')),
          p('Oppstilling med tall over 1000', ['tall.oppstilling'], placeValueProfile('oppstilling-over-1000', 'Stille opp og regne ut addisjon og subtraksjon med tall over 1000, med enere under enere og veksling.')),
          p('Negative tall og tallinjen', ['tall.negative'], placeValueProfile('negative-tall', 'Negative tall på tallinjen: lese, sammenligne og regne med endringer over og under null.')),
        ],
      },
    ],
    goals: [
      'Forklare plassverdi i tall opptil 10 000.',
      'Regne i hodet med tiere og hundrere og bruke smarte strategier.',
      'Legge sammen og trekke fra, med og uten veksling.',
      'Stille opp og regne med tall over 1000.',
      'Plassere negative tall på tallinjen.',
    ],
    levels: [
      { title: 'Tall 1–20', subtitle: 'Tiervenner og tall opptil 20.', description: 'Legge sammen og trekke fra opptil 20.' },
      { title: 'Tall 1–100', subtitle: 'Tierovergang og ukjente tall.', description: 'Dele opp tall for å regne.' },
      { title: 'Tall 1–1000', subtitle: 'Tresifrede tall.', description: 'Stille opp og sjekke svaret.' },
    ],
  },
  {
    unitId: 'multiplikasjon',
    title: 'Multiplikasjon',
    topic: 'Multiplikasjon',
    area: 'De fire regneartene',
    description:
      'Elevene utforsker gange som like grupper, øver på gangetabellen, ganger med tiere og hundrere, deler opp tall og bruker blokkmodeller og kombinasjoner.',
    // Én profil per økt, så hver økt bare øver på gangetabellene i overskriften.
    weeks: [
      {
        title: 'Uke 1 - gange som like grupper',
        sessions: [
          p('Like grupper og gjentatt addisjon', ['mult.like-grupper'], {
            focus: 'Multiplikasjon som like grupper: skrive gjentatt addisjon som gange og regne ut.',
            area: 'tabell-2-3-4-5-10',
            operations: ['+', '*'],
            factors: [2, 3, 4, 5, 10],
            formats: ['Tekstoppgave: «Skriv som gangestykke, og regn ut.» med én gjentatt addisjon'],
            steps: 'Ett steg: skriv om til gange og regn ut. Ingen delspørsmål.',
            avoid: ['Gangestykker fra gangetabellen uten like grupper', 'Lange tekstoppgaver med flere delspørsmål'],
            figures: true,
            levels: {
              1: { title: 'Få grupper', subtitle: '2–3 like grupper.', description: 'Se like grupper og skrive dem som gange.', numbers: '2–3 grupper med 2, 3, 4, 5 eller 10 i hver', factors: [2, 3, 4, 5, 10], groups: [2, 3] },
              2: { title: 'Flere grupper', subtitle: '4–5 like grupper.', description: 'Skrive lange plusstykker som gange.', numbers: '4–5 grupper med 2, 3, 4, 5 eller 10 i hver', factors: [2, 3, 4, 5, 10], groups: [4, 5] },
              3: { title: 'Mange grupper', subtitle: '6–8 like grupper.', description: 'Skrive om og regne ut selvstendig med mange grupper.', numbers: '6–8 grupper med 2, 3, 4, 5 eller 10 i hver', factors: [2, 3, 4, 5, 10], groups: [6, 8] },
            },
          }),
          p(
            'Gangetegnet og 0- og 1-gangen',
            ['mult.tabell-2-10'],
            timesProfile('Gangetegnet (·), 0-gangen og 1-gangen.', [
              { title: '0- og 1-gangen', subtitle: 'Gange med 0 og 1.', description: 'Vite at et tall ganger 1 er tallet selv, og ganger 0 er 0.', numbers: 'Tall fra 0 til 10 ganget med 0 eller 1', factors: [0, 1], groups: [0, 10] },
              { title: '0- og 1-gangen', subtitle: 'Blandet og raskt.', description: 'Bruke reglene for 0 og 1 raskt, med 0 og 1 først eller sist.', numbers: 'Tall fra 0 til 10 ganget med 0 eller 1, blandet', factors: [0, 1], groups: [0, 10] },
              { title: 'Store tall med 0 og 1', subtitle: 'Tall opp til 100.', description: 'Bruke reglene for 0 og 1 på store tall.', numbers: 'Tall fra 11 til 99 ganget med 0 eller 1', factors: [0, 1], groups: [11, 99] },
            ], { area: 'tabell-2-3-4-5-10', allowSwappedFactors: true }),
          ),
        ],
      },
      {
        title: 'Uke 2 - 2-, 3-, 4-, 5- og 10-gangen',
        sessions: [
          p(
            '2-, 5- og 10-gangen',
            ['mult.tabell-2-10'],
            timesProfile(
              '2-gangen, 5-gangen og 10-gangen.',
              tableLevels([2, 5, 10], '2-, 5- og 10-gangen', 'Tell i steg på 2, 5 eller 10.', '5-gangen er halvparten av 10-gangen.', 'Velg den raskeste måten.'),
              { area: 'tabell-2-3-4-5-10' },
            ),
          ),
          p(
            '3- og 4-gangen – doble og halvere',
            ['mult.tabell-2-10'],
            timesProfile(
              '3-gangen og 4-gangen. 4-gangen er det dobbelte av 2-gangen.',
              tableLevels([3, 4], '3- og 4-gangen', 'Tell i steg på 3 eller 4.', 'Doble 2-gangen når du ganger med 4.', 'Bruk dobling og kjente stykker.'),
              { area: 'tabell-2-3-4-5-10' },
            ),
          ),
        ],
      },
      {
        title: 'Uke 3 - 6-, 7-, 8- og 9-gangen',
        sessions: [
          p(
            '6-gangen og sammenhenger i tabellen',
            ['mult.tabell-6-9'],
            timesProfile(
              '6-gangen. Strategi: 6 · a er det dobbelte av 3 · a, eller 5 · a pluss én gruppe.',
              strategyLevels([6], '6-gangen'),
              { area: 'tabell-6-7-8-9', strategyFocus: true },
            ),
          ),
          p(
            '7-, 8- og 9-gangen med smarte strategier',
            ['mult.tabell-6-9'],
            timesProfile(
              '7-gangen, 8-gangen og 9-gangen med strategier som dobling og 10-gangen minus én gruppe.',
              strategyLevels([7, 8, 9], '7-, 8- og 9-gangen'),
              { area: 'tabell-6-7-8-9', strategyFocus: true },
            ),
          ),
        ],
      },
      {
        title: 'Uke 4 - store tall',
        sessions: [
          p(
            'Multiplisere med tiere og hundrere',
            ['mult.tiere-hundrere'],
            timesProfile(
              'Gange ensifrede tall med hele tiere og hele hundrere ved å bruke gangetabellen og plassverdi.',
              [
                { title: 'Tiere og hundrere med støtte', subtitle: 'Få grupper, tydelig struktur.', description: 'Tenke tiere og hundrere som enheter: 3 · 2 tiere = 6 tiere.', numbers: 'Tall fra 2 til 4 ganget med hele tiere eller hele hundrere', factors: TENS_AND_HUNDREDS, groups: [2, 4], instruction: 'Regn ut. Tenk tiere eller hundrere: 3 · 20 er 3 · 2 tiere.' },
                { title: 'Tiere og hundrere', subtitle: 'Ensifret · tiere og hundrere.', description: 'Bruke gangetabellen og plassverdi.', numbers: 'Tall fra 2 til 9 ganget med hele tiere eller hele hundrere', factors: TENS_AND_HUNDREDS, groups: [2, 9], instruction: 'Regn ut. Bruk gangetabellen og plassverdi.' },
                { title: 'Tiere og hundrere – selvstendig', subtitle: 'Uten hjelp.', description: 'Regne selvstendig og kontrollere svaret med plassverdi.', numbers: 'Tall fra 3 til 9 ganget med hele tiere eller hele hundrere', factors: TENS_AND_HUNDREDS, groups: [3, 9], instruction: 'Regn ut, og sjekk svaret med plassverdi.' },
              ],
              { area: 'tiere-hundrere' },
            ),
          ),
          p('Dele opp og multiplisere', ['mult.dele-opp'], {
            focus: 'Dele opp et tosifret tall i tiere og enere og gange hver del med et ensifret tall.',
            area: 'dele-opp',
            operations: ['*'],
            formats: ['Hoderegning der eleven deler opp tallet, på alle nivåer'],
            steps: 'Ett regnestykke. Eleven deler opp – ingen delspørsmål.',
            avoid: ['Gangetabellfakta uten tosifret tall', 'Oppstilling (standardalgoritmen)', 'Lange tekstoppgaver med flere delspørsmål'],
            figures: false,
            levels: {
              1: { title: 'Dele opp med støtte', subtitle: 'Tall fra 11 til 19.', description: 'Dele opp i 10 og enerne, gange hver del og legge sammen.', numbers: 'Tall fra 11 til 19 ganget med 2–5' },
              2: { title: 'Dele opp', subtitle: 'Tall fra 21 til 49.', description: 'Dele opp i tiere og enere selv og finne delproduktene.', numbers: 'Tall fra 21 til 49 ganget med 3–6' },
              3: { title: 'Dele opp – selvstendig', subtitle: 'Tall fra 52 til 98.', description: 'Velge en smart oppdeling selv, også ved å runde opp og trekke fra.', numbers: 'Tall fra 52 til 98 ganget med 4–9' },
            },
          }),
        ],
      },
      {
        title: 'Uke 5 - modeller og kombinasjoner',
        sessions: [
          p('Bruke blokkmodeller', ['mult.blokkmodeller'], {
            focus: 'Like grupper i hverdagssituasjoner, løst med en blokkmodell og ett gangestykke.',
            area: 'blokkmodell',
            operations: ['*'],
            formats: ['Kort hverdagsoppgave med ett gangestykke: «Tegn en blokkmodell: …»'],
            steps: 'Ett steg. Ingen delspørsmål.',
            avoid: ['Oppgaver med flere regnearter eller flere steg'],
            figures: false,
            levels: {
              1: { title: 'Blokkmodell med støtte', subtitle: 'Få deler, små tall.', description: 'Lese en blokkmodell med kjent antall deler og kjent verdi i hver del.', numbers: '2–5 grupper med 3–6 i hver' },
              2: { title: 'Blokkmodell', subtitle: 'Flere deler.', description: 'Gjøre en kort situasjon om til en blokkmodell og ett gangestykke.', numbers: '3–8 grupper med 4–9 i hver' },
              3: { title: 'Blokkmodell – selvstendig', subtitle: 'Større tall i hver del.', description: 'Lage modellen selv og regne med tosifrede tall i hver del.', numbers: '3–6 grupper med 12–25 i hver' },
            },
          }),
          p('Antall ulike kombinasjoner', ['mult.kombinasjoner'], {
            focus: 'Finne antall kombinasjoner av to valg med ett gangestykke.',
            area: 'kombinasjoner',
            operations: ['*'],
            formats: ['Kort hverdagsoppgave med ett gangestykke'],
            steps: 'Ett steg. Ingen delspørsmål.',
            avoid: ['Kombinasjoner med tre eller flere valg', 'Lange tekstoppgaver med flere delspørsmål'],
            figures: false,
            levels: {
              1: { title: 'Kombinasjoner med støtte', subtitle: 'Få valg.', description: 'Finne alle kombinasjoner av to små valg, gjerne ved å liste dem opp.', numbers: '2–3 og 2–4 valg' },
              2: { title: 'Kombinasjoner', subtitle: 'Flere valg.', description: 'Se at antall kombinasjoner er et gangestykke.', numbers: '3–5 og 3–6 valg' },
              3: { title: 'Kombinasjoner – selvstendig', subtitle: 'Mange valg.', description: 'Finne antallet med gange uten å liste opp, og forklare hvorfor.', numbers: '4–6 og 5–8 valg' },
            },
          }),
        ],
      },
    ],
    goals: [
      'Forstå multiplikasjon som like grupper og gjentatt addisjon.',
      'Kunne gangetabellen.',
      'Gange med tiere og hundrere, og dele opp tall for å gange.',
      'Bruke blokkmodeller og finne antall kombinasjoner.',
    ],
    levels: [
      { title: 'Like grupper', subtitle: 'Gange med 2, 5 og 10.', description: 'Telle grupper med like mange.' },
      { title: 'Gangetabellen', subtitle: 'Gange med 3, 4, 6, 7 og 8.', description: 'Bruke dobling og kjente fakta.' },
      { title: 'Store gangestykker', subtitle: 'Tosifrede tall, tiere og hundrere.', description: 'Dele opp tall for å gange.' },
    ],
  },
  {
    unitId: 'divisjon',
    title: 'Divisjon',
    topic: 'Divisjon',
    area: 'De fire regneartene',
    description:
      'Elevene ser sammenhengen mellom gange og dele, skiller mellom delingsdivisjon og målingsdivisjon, regner med rest og bruker modeller.',
    weeks: [
      {
        title: 'Uke 1 - gange og dele',
        sessions: [
          p(
            'Multiplikasjon og divisjon henger sammen',
            ['div.mult-og-div'],
            divisionProfile('multiplikasjon-divisjon', 'Sammenhengen mellom multiplikasjon og divisjon: motsatte regneoperasjoner og regnefamilier, f.eks. 6 · 4 = 24, 24 : 6 = 4 og 24 : 4 = 6.'),
          ),
          p(
            'Dele med gangetabellen',
            ['div.mult-og-div'],
            divisionProfile('multiplikasjon-divisjon', 'Dele ved å bruke gangetabellen baklengs: finne den ukjente faktoren og kontrollere svaret med gange.'),
          ),
        ],
      },
      {
        title: 'Uke 2 - to måter å dele på',
        sessions: [
          p(
            'Delingsdivisjon – dele likt',
            ['div.delings-malings'],
            divisionProfile('delingsdivisjon-malingsdivisjon', 'Delingsdivisjon: antall grupper er kjent, og eleven finner hvor mange det blir i hver gruppe.', { divisionType: 'deling' }),
          ),
          p(
            'Målingsdivisjon – hvor mange grupper?',
            ['div.delings-malings'],
            divisionProfile('delingsdivisjon-malingsdivisjon', 'Målingsdivisjon: størrelsen på hver gruppe er kjent, og eleven finner antall grupper.', { divisionType: 'maling' }),
          ),
        ],
      },
      {
        title: 'Uke 3 - noe til overs',
        sessions: [
          p(
            'Divisjon med noe til overs',
            ['div.rest'],
            divisionProfile('divisjon-med-rest', 'Divisjon med rest: finne hvor mange hele grupper det blir og hvor mange som blir til overs.'),
          ),
          p(
            'Rest i hverdagen',
            ['div.rest'],
            divisionProfile(
              'divisjon-med-rest',
              'Hva resten betyr i hverdagen: hele grupper og hva som blir til overs, eller hvor mange grupper som faktisk trengs når alle skal være med (svaret rundes opp).',
              { taskVariant: 'hverdag' },
            ),
          ),
        ],
      },
      {
        title: 'Uke 4 - modeller',
        sessions: [
          p(
            'Bruke modeller i divisjon',
            ['div.modeller'],
            divisionProfile('modeller', 'Bruke og tolke modeller i divisjon: like grupper, tallinje, rutenett og blokkmodell, beskrevet i tekst eller tegnet av eleven.'),
          ),
          // Oppsummering av alle fire fagområdene: hovedområdet er sammenhengen med gange, de andre er tilgrensende.
          p(
            'Dette mestrer jeg – divisjon',
            ['div.mult-og-div', 'div.delings-malings', 'div.rest', 'div.modeller'],
            divisionProfile('multiplikasjon-divisjon', 'Oppsummering av divisjon: sammenhengen med gange, delingsdivisjon og målingsdivisjon, rest og modeller.', {
              secondaryAreas: ['delingsdivisjon-malingsdivisjon', 'divisjon-med-rest', 'modeller'],
              summary: true,
            }),
          ),
        ],
      },
    ],
    goals: [
      'Bruke gangetabellen til å dele.',
      'Skille mellom delingsdivisjon og målingsdivisjon.',
      'Dele med noe til overs og forklare hva resten betyr.',
      'Bruke modeller til å løse divisjonsoppgaver.',
    ],
    levels: [
      { title: 'Dele likt', subtitle: 'Dele med 2, 3, 4 og 5.', description: 'Dele likt med konkreter.' },
      { title: 'Dele med tabellen', subtitle: 'Dele med 3, 4 og 6.', description: 'Bruke gangetabellen baklengs.' },
      { title: 'Dele større tall', subtitle: 'Dele med 6–9 og rest.', description: 'Dele og sjekke svaret med gange.' },
    ],
  },
  {
    unitId: 'repetisjon-host',
    title: 'Repetisjon',
    topic: 'Repetisjon',
    area: 'Repetisjon',
    description: 'Elevene repeterer høstens tema og velger selv strategi og regneart. Økta avsluttes med en felles samtale om hva de mestrer.',
    weeks: [
      { title: 'Uke 1 - tall', sessions: [s('Repetisjon: tallforståelse og plassverdi', 'tall.firesifrede', 'tall.hoderegning'), s('Repetisjon: addisjon og subtraksjon', 'tall.addisjon-subtraksjon')] },
      {
        title: 'Uke 2 - gange og dele',
        sessions: [
          p(
            'Repetisjon: gangetabellen',
            ['mult.tabell-2-10', 'mult.tabell-6-9'],
            timesProfile(
              'Repetisjon av gangetabellen fra 2 til 10.',
              tableLevels([2, 3, 4, 5, 6, 7, 8, 9, 10], 'gangetabellen', 'Tell i steg eller bruk et stykke du kan.', 'Bruk dobling og kjente stykker.', 'Velg en smart strategi.'),
            ),
          ), s('Repetisjon: grunnleggende divisjon', 'div.mult-og-div', 'div.delings-malings'),
        ],
      },
      {
        title: 'Uke 3 - flere regnearter',
        sessions: [
          s('Problemløsing med flere regnearter', 'tall.addisjon-subtraksjon', 'mult.tabell-2-10', 'div.delings-malings'),
          s('Dette mestrer jeg – høsten oppsummert', 'tall.firesifrede', 'tall.addisjon-subtraksjon', 'mult.tabell-6-9', 'div.mult-og-div'),
        ],
      },
    ],
    goals: ['Bruke strategier for addisjon og subtraksjon.', 'Huske gangetabellen og bruke den til å dele.', 'Velge regneart i oppgaver med flere steg.'],
    levels: repetitionLevels,
  },
  {
    unitId: 'geometri',
    title: 'Geometri',
    topic: 'Geometri',
    area: 'Geometri',
    description: 'Elevene beskriver todimensjonale og tredimensjonale figurer, bretter ut romfigurer og undersøker vinkler.',
    weeks: [
      { title: 'Uke 1 - todimensjonale figurer', sessions: [s('Mangekanter – sider og hjørner', 'geo.2d'), s('Omkrets av mangekanter', 'geo.2d')] },
      { title: 'Uke 2 - tredimensjonale figurer', sessions: [s('Kube, prisme, pyramide og sylinder', 'geo.3d'), s('Fra tredimensjonal til todimensjonal', 'geo.3d-til-2d')] },
      { title: 'Uke 3 - vinkler', sessions: [s('Rette, spisse og butte vinkler', 'geo.vinkler'), s('Vinkler i trekanter', 'geo.vinkler')] },
    ],
    goals: [
      'Beskrive todimensjonale figurer ut fra sider og hjørner.',
      'Beskrive tredimensjonale figurer ut fra flater, kanter og hjørner.',
      'Se sammenhengen mellom en romfigur og utbrettingen av den.',
      'Kjenne igjen og sammenligne vinkler.',
    ],
    levels: [
      { title: 'Sider og hjørner', subtitle: 'Trekanter og firkanter.', description: 'Telle sider, hjørner og flater.' },
      { title: 'Omkrets og flater', subtitle: 'Kvadrater og romfigurer.', description: 'Regne ut omkrets og telle flater.' },
      { title: 'Vinkler og utbrettinger', subtitle: 'Vinkelsum og utbrettinger.', description: 'Bruke at vinklene er 180° til sammen.' },
    ],
  },
  {
    unitId: 'problemlosing',
    title: 'Problemløsing',
    topic: 'Problemløsing',
    area: 'Problemløsing',
    description: 'Elevene lager regneuttrykk til regnefortellinger, bruker modeller, løser oppgaver med flere steg og vurderer svaralternativer.',
    weeks: [
      { title: 'Uke 1 - fortellinger og modeller', sessions: [s('Regnefortellinger og regneuttrykk', 'prob.regnefortellinger'), s('Bruke modeller', 'prob.modeller')] },
      { title: 'Uke 2 - flere steg og valg', sessions: [s('Flerstegsoppgaver', 'prob.flersteg'), s('Flervalgsoppgaver', 'prob.flervalg')] },
    ],
    goals: ['Skrive regneuttrykk til regnefortellinger.', 'Bruke modeller til å løse oppgaver.', 'Løse oppgaver med flere steg og vurdere om svaret er rimelig.'],
    levels: [
      { title: 'Ett steg', subtitle: 'Regnefortellinger med pluss.', description: 'Skrive regneuttrykket.' },
      { title: 'Modeller', subtitle: 'Pluss, minus og modeller.', description: 'Tegne en modell før jeg regner.' },
      { title: 'Flere steg', subtitle: 'Oppgaver med to steg.', description: 'Planlegge og sjekke svaret.' },
    ],
  },
  {
    unitId: 'tall-og-regning',
    title: 'Tall og regning',
    topic: 'Tall og regning',
    area: 'Tall og algebra',
    description: 'Elevene bruker sammenhengen mellom regneartene, og blir kjent med desimaltall med tideler og i lengdemåling.',
    weeks: [
      { title: 'Uke 1 - sammenhenger', sessions: [s('Sammenhengen mellom addisjon og subtraksjon', 'tr.add-sub'), s('Sammenhengen mellom multiplikasjon og divisjon', 'tr.mult-div')] },
      { title: 'Uke 2 - tideler', sessions: [s('Desimaltall med tideler', 'tr.tideler'), s('Tideler på tallinjen', 'tr.tideler')] },
      { title: 'Uke 3 - desimaltall i måling', sessions: [s('Desimaltall i lengdemåling', 'tr.desimal-lengde'), s('Måle og skrive lengder med desimaltall', 'tr.desimal-lengde')] },
    ],
    goals: ['Bruke sammenhengen mellom regneartene til å sjekke svar.', 'Forstå og skrive desimaltall med tideler.', 'Bruke desimaltall i lengdemåling.'],
    levels: [
      { title: 'Sammenhenger', subtitle: 'Pluss og minus, gange og dele.', description: 'Bruke ett regnestykke til å finne et annet.' },
      { title: 'Tideler', subtitle: 'Hele og tideler.', description: 'Skrive desimaltall.' },
      { title: 'Desimaltall i bruk', subtitle: 'Regne og måle med desimaltall.', description: 'Bytte mellom enheter.' },
    ],
  },
  {
    unitId: 'repetisjon-vinter',
    title: 'Repetisjon',
    topic: 'Repetisjon',
    area: 'Repetisjon',
    description: 'Elevene repeterer vinterens tema: figurer og vinkler, problemløsing med flere steg, sammenhenger mellom regneartene og tideler.',
    weeks: [
      { title: 'Uke 1 - geometri', sessions: [s('Repetisjon: todimensjonale og tredimensjonale figurer', 'geo.2d', 'geo.3d'), s('Repetisjon: vinkler og geometriske egenskaper', 'geo.vinkler')] },
      { title: 'Uke 2 - regning', sessions: [s('Repetisjon: problemløsing og sammenhenger', 'prob.flersteg', 'tr.add-sub', 'tr.mult-div'), s('Repetisjon: desimaltall og tideler', 'tr.tideler')] },
    ],
    goals: ['Beskrive figurer og vinkler.', 'Løse oppgaver med flere steg.', 'Bruke sammenhenger mellom regneartene og tideler.'],
    levels: repetitionLevels,
  },
  {
    unitId: 'strategier-i-divisjon',
    title: 'Divisjon',
    topic: 'Strategier i divisjon',
    area: 'De fire regneartene',
    description:
      'Elevene deler større tall ved å dele opp i hundrere, tiere og enere, finner gode måter å dele på, deler med 10 og 100 og finner del av en hel og del av en mengde.',
    weeks: [
      { title: 'Uke 1 - dele opp tall', sessions: [s('Dele tall i hundrere, tiere og enere', 'sdiv.hte'), s('Dele tall på gode måter', 'sdiv.gode-mater')] },
      { title: 'Uke 2 - sammenhenger', sessions: [s('Sammenhenger i divisjon', 'sdiv.sammenhenger'), s('Dividere med 10 og 100', 'sdiv.10-100')] },
      { title: 'Uke 3 - deler', sessions: [s('Målingsdivisjon og delingsdivisjon', 'sdiv.malings-delings'), s('Del av en hel og del av en mengde', 'sdiv.del-av-hel', 'sdiv.del-av-mengde')] },
    ],
    goals: ['Dele større tall ved å dele opp i hundrere, tiere og enere.', 'Velge en god måte å dele på.', 'Dele med 10 og 100.', 'Finne del av en hel og del av en mengde.'],
    levels: [
      { title: 'Dele opp', subtitle: 'Tosifrede tall.', description: 'Dele tiere og enere hver for seg.' },
      { title: 'Gode måter', subtitle: 'Halvere og bruke sammenhenger.', description: 'Velge strategi.' },
      { title: 'Store tall', subtitle: 'Tresifrede tall og brøk.', description: 'Dele og sjekke svaret med gange.' },
    ],
  },
  {
    unitId: 'maling',
    title: 'Måling',
    topic: 'Måling',
    area: 'Måling',
    description: 'Elevene måler volum, masse, areal, omkrets og tid, og bytter mellom måleenheter.',
    // Hver økt måler én størrelse, så oppgavene og AI-en holder seg til enhetene i overskriften.
    weeks: [
      {
        title: 'Uke 1 - volum og masse',
        sessions: [
          p(
            'Måle volum – liter og desiliter',
            ['mal.volum', 'mal.liter-dl'],
            measureProfile('Volum: måle i liter og desiliter, og gjøre om mellom dem (1 liter = 10 dl).', ['liter', 'dl', 'ml'], ['+', '-', '*', '/'], [
              { title: 'Liter og dl', subtitle: 'Hele liter og desiliter.', description: 'Legge sammen og trekke fra desiliter.', numbers: 'Desiliter opp til 10, hele liter opp til 3', units: ['liter', 'dl'] },
              { title: 'Gjøre om', subtitle: 'Liter til dl og dl til liter.', description: 'Bruke at 1 liter er 10 dl.', numbers: 'Opp til 9 liter og 90 dl', units: ['liter', 'dl'] },
              { title: 'Sammenligne volum', subtitle: 'Liter, dl, ml og desimaltall.', description: 'Sammenligne og gjøre om med desimaltall.', numbers: 'Desimaltall med tideler (f.eks. 2,5 liter) og liter, dl og ml', units: ['liter', 'dl', 'ml'] },
            ]),
          ),
          p(
            'Kilogram og gram',
            ['mal.kg-g'],
            measureProfile('Masse: kilogram og gram, og gjøre om mellom dem (1 kg = 1000 g).', ['kg', 'g'], ['+', '*', '/'], [
              { title: 'Kilo til gram', subtitle: 'Hele kilo.', description: 'Bruke at 1 kg er 1000 g.', numbers: '1–9 kg', units: ['kg', 'g'] },
              { title: 'Regne med gram', subtitle: 'Hele hundre gram.', description: 'Legge sammen gram.', numbers: '100–900 g', units: ['g'] },
              { title: 'Sammenligne masse', subtitle: 'Kilo og gram.', description: 'Dele opp en kilo og sammenligne kilo og gram.', numbers: 'Opp til 8000 g og 8 kg', units: ['kg', 'g'] },
            ]),
          ),
        ],
      },
      {
        title: 'Uke 2 - lengde og areal',
        sessions: [
          p(
            'Lengde – cm, mm og sammenligne måleenheter',
            ['mal.lengde'],
            measureProfile('Lengde: centimeter og millimeter, meter og centimeter, og sammenligne lengder med ulike enheter.', ['km', 'm', 'dm', 'cm', 'mm'], ['+', '*'], [
              { title: 'Centimeter og millimeter', subtitle: 'cm og mm.', description: 'Bruke at 1 cm er 10 mm.', numbers: '1–20 cm', units: ['cm', 'mm'] },
              { title: 'Sammenligne lengder', subtitle: 'cm og mm.', description: 'Gjøre om til samme enhet før jeg sammenligner.', numbers: 'Opp til 25 cm og 300 mm', units: ['m', 'cm', 'mm'] },
              { title: 'Sammenligne måleenheter', subtitle: 'km, m, dm, cm og mm.', description: 'Sammenligne lengder med ulike enheter og løse lengdegåter.', numbers: 'Opp til 5 km og 5 m', units: ['km', 'm', 'dm', 'cm', 'mm'] },
            ]),
          ),
          p(
            'Måle areal',
            ['mal.areal'],
            measureProfile('Areal: telle ruter på 1 cm² og regne ut areal av rektangler som rader · ruter.', ['cm²', 'm²'], ['*'], [
              { title: 'Telle ruter', subtitle: 'Små rektangler.', description: 'Telle ruter på 1 cm².', numbers: '2–5 rader med 3–8 ruter', units: ['cm²'] },
              { title: 'Rader og ruter', subtitle: 'Større rektangler.', description: 'Regne rader · ruter.', numbers: '2–9 rader med 3–8 ruter', units: ['cm²'] },
              { title: 'Areal i cm² og m²', subtitle: 'Sammensatte figurer og m².', description: 'Finne areal og sammenligne cm² og m².', numbers: '2–9 rader med 3–12 ruter, og cm² og m²', units: ['cm²', 'm²'] },
            ], { figures: true }),
          ),
        ],
      },
      {
        title: 'Uke 3 - omkrets og tid',
        sessions: [
          p(
            'Areal og omkrets',
            ['mal.areal-omkrets'],
            measureProfile('Areal og omkrets av rektangler og kvadrater.', ['cm', 'cm²'], ['+', '*', '/'], [
              { title: 'Areal', subtitle: 'Rektangler.', description: 'Lengde · bredde.', numbers: 'Sider fra 2 til 9 cm', units: ['cm', 'cm²'] },
              { title: 'Areal og omkrets', subtitle: 'Rektangler.', description: 'Skille mellom areal og omkrets.', numbers: 'Sider fra 2 til 12 cm', units: ['cm', 'cm²'] },
              { title: 'Fra omkrets til areal', subtitle: 'Kvadrater.', description: 'Finne siden ut fra omkretsen.', numbers: 'Omkrets opp til 36 cm', units: ['cm', 'cm²'] },
            ]),
          ),
          p(
            'Tid – klokka og hvor lang tid',
            ['mal.tid'],
            measureProfile('Tid: lese klokka, minutter, kvarter og timer, og regne ut hvor lang tid noe tar.', ['minutter', 'kvarter', 'timer'], ['+', '-', '*'], [
              { title: 'Kvarter og halvtimer', subtitle: 'Hel, halv og kvart.', description: 'Lese klokka og regne med kvarter.', numbers: '1–4 kvarter', units: ['minutter', 'kvarter'] },
              { title: 'Hvor lang tid?', subtitle: 'Minutter.', description: 'Regne ut hvor lang tid noe varer.', numbers: 'Opp til 60 minutter', units: ['minutter'] },
              { title: 'Timer og minutter', subtitle: 'Timer.', description: 'Gjøre om mellom timer og minutter.', numbers: 'Opp til 6 timer', units: ['minutter', 'timer'] },
            ], { figures: true }),
          ),
        ],
      },
    ],
    goals: ['Måle og sammenligne volum, masse og lengde.', 'Bytte mellom måleenheter.', 'Finne areal og omkrets.', 'Lese klokka og regne med tid.'],
    levels: [
      { title: 'Måle', subtitle: 'Hele enheter.', description: 'Måle og telle.' },
      { title: 'Bytte enheter', subtitle: 'Liter, dl, kg og g.', description: 'Gjøre om mellom enheter.' },
      { title: 'Regne med måling', subtitle: 'Desimaltall, areal og tid.', description: 'Bruke måling i oppgaver.' },
    ],
  },
  {
    unitId: 'monster-og-algoritmer',
    title: 'Mønster',
    topic: 'Mønster og algoritmer',
    area: 'Tall og algebra',
    description: 'Elevene utforsker mønster, figurtall og tallfølger, og lager koder med løkker og vilkår.',
    weeks: [
      { title: 'Uke 1 - mønster', sessions: [s('Utforske mønster og figurtall', 'mon.utforske', 'mon.figurtall'), s('Mønster i tallfølger', 'mon.tallfolger')] },
      { title: 'Uke 2 - algoritmer', sessions: [s('Koder med løkker', 'mon.lokker'), s('Koder med vilkår', 'mon.vilkar')] },
    ],
    goals: ['Beskrive og fortsette mønster og figurtall.', 'Finne regelen i en tallfølge.', 'Lese og lage enkle koder med løkker og vilkår.'],
    levels: [
      { title: 'Fortsette mønsteret', subtitle: 'Tallfølger som øker.', description: 'Finne neste tall.' },
      { title: 'Finne regelen', subtitle: 'Figurtall og løkker.', description: 'Beskrive hvordan mønsteret vokser.' },
      { title: 'Koder', subtitle: 'Løkker og vilkår.', description: 'Følge og forklare en algoritme.' },
    ],
  },
  {
    unitId: 'regning',
    title: 'Regning',
    topic: 'Regning',
    area: 'Statistikk',
    description: 'Elevene leser og tolker diagrammer og tabeller, bruker de fire regneartene og utforsker algebra.',
    weeks: [
      { title: 'Uke 1 - diagrammer og tabeller', sessions: [s('Lese og tolke diagrammer', 'reg.diagrammer'), s('Lese og tolke tabeller', 'reg.tabeller')] },
      { title: 'Uke 2 - de fire regneartene', sessions: [s('De fire regneartene', 'reg.fire-regnearter'), s('Velge regneart i tekstoppgaver', 'reg.fire-regnearter')] },
      { title: 'Uke 3 - algebra', sessions: [s('Utforske algebra – finne det ukjente tallet', 'reg.algebra'), s('Likninger med symboler', 'reg.algebra')] },
    ],
    goals: ['Lese og tolke diagrammer og tabeller.', 'Velge og bruke riktig regneart.', 'Finne ukjente tall i enkle likninger.'],
    levels: [
      { title: 'Lese av', subtitle: 'Diagrammer og tabeller.', description: 'Finne hvor mange.' },
      { title: 'Sammenligne', subtitle: 'Forskjeller og summer.', description: 'Velge regneart.' },
      { title: 'Tolke og regne', subtitle: 'Piktogram og likninger.', description: 'Forklare hvordan jeg tenker.' },
    ],
  },
  {
    unitId: 'repetisjon-var',
    title: 'Repetisjon',
    topic: 'Repetisjon',
    area: 'Repetisjon',
    description: 'Elevene repeterer skoleårets tema og viser hva de har lært. Økta avsluttes med en felles samtale om hva de mestrer.',
    weeks: [
      { title: 'Uke 1 - divisjon og måling', sessions: [s('Repetisjon: divisjon og ulike strategier', 'sdiv.hte', 'sdiv.malings-delings'), s('Repetisjon: måling, areal og omkrets', 'mal.areal', 'mal.areal-omkrets', 'mal.tid')] },
      { title: 'Uke 2 - skoleåret oppsummert', sessions: [s('Repetisjon: mønstre, tabeller og diagrammer', 'mon.tallfolger', 'reg.tabeller', 'reg.diagrammer'), s('Dette mestrer jeg – skoleåret oppsummert', 'reg.fire-regnearter', 'prob.flersteg')] },
    ],
    goals: ['Bruke ulike strategier i divisjon.', 'Regne med måling, areal og omkrets.', 'Lese tabeller og diagrammer og løse sammensatte oppgaver.'],
    levels: repetitionLevels,
  },
]

/** Plan og mål for hver periode (vises på temasiden). */
export const unitDetails: TopicDetails[] = unitSpecs.map(({ unitId, weeks, goals }) => ({
  topicId: unitId,
  weeks: weeks.map((w) => ({ title: w.title, sessions: w.sessions.map((x) => x.heading) })),
  goals,
}))

/** Øktprofilen til økta med overskriften `heading` i temaet `unitId` (for økter som er laget utenfor årsplanen). */
export function sessionProfile(unitId: string, heading: string): TaskProfile | undefined {
  return unitSpecs.find((u) => u.unitId === unitId)?.weeks.flatMap((w) => w.sessions).find((x) => x.heading === heading)?.profile
}
