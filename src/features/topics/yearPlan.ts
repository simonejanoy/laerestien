import { visualSignature, type AiVisual, type DivisionArea, type DivisionType, type GeometryArea, type MeasurementArea, type NumbersAndOperationsArea, type PatternArea, type PlaceValueArea, type ProblemSolvingArea } from '../../ai/contract.ts'
import type { Level, LevelGroup, LevelProfile, Operator, TaskProfile, TaskType, TopicDetails } from '../../types/index.ts'
import type { ColorsFigure, DotsFigure, ExpectedAnswer } from '../../ai/patternDisplay.ts'
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
  /** Geometri: plan figur eller vinkel som appen tegner til oppgaven. Mønster og algoritmer: figurtall med prikker. */
  figure?: AiVisual | DotsFigure | ColorsFigure
  /** Mønster og algoritmer: tallrekka med tomme felt vises med inputbokser. */
  answerBoxes?: true
  /** Mønster og algoritmer: det korte svaret appen retter automatisk (brukes bare i øktene i temaet). */
  expected?: ExpectedAnswer
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

/** 2.5 → «2,5» */
const dec = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

/** Gjentakelsene i mønstrene i «Utforske mønster», per nivå: to eller tre ledd på nivå 1 og 2, fire på nivå 3. */
const PATTERN_UNITS: Record<Level, string[][]> = {
  1: [['▲', '●'], ['■', '▲'], ['●', '■', '■'], ['gul', 'grønn'], ['▲', '▲', '●']],
  2: [['■', '●', '●'], ['▲', '■', '●'], ['●', '●', '▲'], ['rød', 'gul', 'gul'], ['■', '▲', '▲']],
  3: [['▲', '●', '●', '■'], ['●', '■', '■', '▲'], ['■', '■', '●', '▲'], ['blå', 'rød', 'rød', 'gul'], ['●', '▲', '■', '■']],
}
const isColor = (item: string) => /^\p{L}+$/u.test(item)
/** «● ■ ●» med figurer, «rød, blå, rød» med fargeord. */
const patternLine = (items: string[]) => items.join(isColor(items[0]) ? ', ' : ' ')

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
// Geometri: grunnoppgaver per økt. Tekstoppgaver uten figur – skal eleven se en figur, tegner eleven den selv.

/** Repetisjon (uten profil): som før. */
const oldPlaneTasks = byLevel(
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
)

/** Repetisjon (uten profil): som før. */
const oldSolidTasks = byLevel(
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
)

/** Manglende del av en rett vinkel, en rett linje og vinkelsummen i en trekant (Vinkler i trekanter og repetisjon). */
const angleSumTasks = byLevel(
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
)

/**
 * «Vinkler i trekanter»: de samme oppgavene som tekstoppgaver. Et regnestykke under teksten («90 − 10 =») ville
 * røpe hvordan oppgaven løses; eleven ser bare teksten, og fasiten viser utregningen for læreren.
 */
const angleSumTextTasks = (level: Level, n: number): TextSpec[] =>
  angleSumTasks(level, n).map((task) => {
    const [, a, , b, text] = task as TaskSpec
    return { text, solution: `${a - b}°  (${a}° − ${b}° = ${a - b}°)` }
  })

/** Tekst, fasit og eventuelt en figur appen tegner. */
type Item = [string, string] | [string, string, AiVisual]
/** Fem ulike oppgaver fra lista (lista har minst fem), forskjøvet med økta. */
const fromList = (items: Item[], n: number) => five((i): TextSpec => {
  const [text, solution, figure] = pick(items, i + n)
  return { text, solution, ...(figure && { figure }) }
})
const shape = (s: Extract<AiVisual, { kind: 'shape' }>['shape']): AiVisual => ({ kind: 'shape', shape: s })

/** Mangekanter: gjenkjenne og telle → sammenligne og sortere → resonnere. */
const polygonTasks = byLevel(
  (n) =>
    fromList(
      [
        ['Hvor mange hjørner har en trekant, og hvor mange sider har den?', '3 hjørner og 3 sider'],
        ['En figur har fire sider og fire hjørner. Hva kaller vi en slik figur?', 'Firkant'],
        ['Hvor mange sider har en sekskant?', '6 sider'],
        ['En mangekant har åtte sider. Hvor mange hjørner har den?', '8 hjørner'],
        ['Hvor mange sider og hjørner har figuren?', '5 sider og 5 hjørner', shape('pentagon')],
        ['En figur er rund og har ingen hjørner. Hva heter figuren?', 'Sirkel'],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Hvor mange flere hjørner har en sekskant enn en firkant?', '2 flere hjørner (6 − 4 = 2)'],
        ['Sorter figurene etter antall sider, fra færrest til flest: femkant, trekant, åttekant, firkant.', 'Trekant (3), firkant (4), femkant (5), åttekant (8)'],
        ['Hva er likt, og hva er ulikt, ved en trekant og en sekskant?', 'Begge er mangekanter med like mange sider som hjørner. Trekanten har 3 sider og 3 hjørner, mens sekskanten har 6 sider og 6 hjørner.'],
        ['Sorter beskrivelsene: A har fem sider. B har ingen hjørner. C har tre hjørner. Hvilken er en trekant, en femkant og en sirkel?', 'A er en femkant, B er en sirkel og C er en trekant.'],
        ['Hvor mange flere hjørner har figuren enn en firkant?', '4 flere hjørner. Figuren er en åttekant med 8 hjørner, og 8 − 4 = 4.', shape('octagon')],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Jeg er en mangekant med like mange sider som hjørner. Til sammen har jeg 10 sider og hjørner. Hvilken figur er jeg?', 'Femkant (5 sider og 5 hjørner)'],
        ['Kan en mangekant ha tre sider og fire hjørner? Forklar.', 'Nei. En mangekant har like mange hjørner som sider, så tre sider gir tre hjørner.'],
        ['Ola sier at en sekskant har fem hjørner. Har Ola rett? Forklar.', 'Nei. En sekskant har 6 sider og 6 hjørner.'],
        ['Hvilken mangekant har dobbelt så mange hjørner som en firkant? Forklar.', 'Åttekant. En firkant har 4 hjørner, og 4 · 2 = 8.'],
        [
          'Figuren er en femkant. Forklar hvorfor den fortsatt ville vært en femkant om sidene hadde vært ulikt lange.',
          'Den har 5 sider og 5 hjørner. Det er antall sider og hjørner som bestemmer at figuren er en femkant, ikke lengden på sidene.',
          shape('pentagon'),
        ],
      ],
      n,
    ),
)

/** Firkanter: egenskaper ved kvadrat og rektangel → sammenligne og symmetri → resonnere om klassifisering. */
const quadrilateralTasks = byLevel(
  (n) =>
    fromList(
      [
        ['Hvor mange rette vinkler har et kvadrat?', '4 rette vinkler'],
        ['Hvor mange rette vinkler har rektangelet på figuren?', '4 rette vinkler', shape('rectangle')],
        ['Et kvadrat har fire sider. Hva er spesielt med lengden på sidene?', 'Alle de fire sidene er like lange.'],
        ['Hvor mange hjørner har et rektangel?', '4 hjørner'],
        ['En firkant har fire like lange sider og fire rette vinkler. Hva heter figuren?', 'Kvadrat'],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Figuren er et kvadrat. Hvor mange symmetrilinjer har det?', '4 symmetrilinjer', shape('square')],
        ['Rektangelet på figuren er ikke et kvadrat. Hvor mange symmetrilinjer har det?', '2 symmetrilinjer', shape('rectangle')],
        ['Hva er likt, og hva er ulikt, ved et kvadrat og et rektangel?', 'Begge har 4 sider og 4 rette vinkler. Kvadratet har fire like lange sider, mens rektangelet har to par like lange motstående sider.'],
        ['Sorter: A har fire like lange sider og fire rette vinkler. B har fire rette vinkler, og bare de motstående sidene er like lange. Hvilken er kvadrat, og hvilken er rektangel?', 'A er et kvadrat, og B er et rektangel.'],
        ['En trekant har nøyaktig én symmetrilinje. Hva kan du si om sidene?', 'To av sidene er like lange.'],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Mia sier at et rektangel aldri kan være et kvadrat. Har Mia rett? Forklar.', 'Nei. Et rektangel med fire like lange sider er et kvadrat. Alle kvadrater er rektangler.'],
        ['Kan en firkant ha fire rette vinkler uten å være et kvadrat? Forklar, og gi et eksempel.', 'Ja. Et rektangel har fire rette vinkler, men sidene trenger ikke være like lange.'],
        ['Jeg er en firkant med fire rette vinkler. To av sidene mine er 3 cm, og to er 7 cm. Hvilken figur er jeg?', 'Rektangel'],
        ['Hvor mange symmetrilinjer har et kvadrat, og hvor mange har et rektangel som ikke er et kvadrat? Forklar forskjellen.', 'Kvadratet har 4 symmetrilinjer, og rektangelet har 2. Fordi alle sidene i kvadratet er like lange, går det også symmetrilinjer gjennom hjørnene.'],
        ['Firkanten på figuren har ingen rette vinkler. Kan den være et rektangel? Forklar.', 'Nei. Et rektangel må ha fire rette vinkler, og denne firkanten har ingen.', shape('quadrilateral')],
      ],
      n,
    ),
)

/** Romfigurer: gjenkjenne og telle → flater og former → resonnere. */
const solidTasks = byLevel(
  (n) =>
    fromList(
      [
        ['Hvor mange hjørner har en kube?', '8 hjørner'],
        ['Hvor mange kanter har en terning?', '12 kanter'],
        ['En romfigur er helt rund og har ingen kanter eller hjørner. Hva heter den?', 'Kule'],
        ['Hvilken romfigur ligner mest på en hermetikkboks?', 'Sylinder'],
        ['Hvor mange flater har en kube?', '6 flater'],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Hvilken form har endeflatene på en sylinder?', 'Sirkler. En sylinder har 2 sirkelformede endeflater og én krum sideflate.'],
        ['Hvor mange flater har et trekantet prisme, og hvilke former har de?', '5 flater: 2 trekanter og 3 rektangler.'],
        ['Hva er forskjellen på et trekantet prisme og en trekantet pyramide?', 'Prismet har to like trekantede endeflater og tre rektangulære sideflater. Pyramiden har en trekantet grunnflate og trekantede sideflater som møtes i ett toppunkt.'],
        ['Hvor mange sideflater har en firkantet pyramide, og hvilken form har de?', '4 sideflater. De er trekanter.'],
        ['En romfigur har 5 flater: én kvadratisk grunnflate og fire trekanter. Hva heter romfiguren?', 'Firkantet pyramide'],
      ],
      n,
    ),
  (n) =>
    fromList(
      [
        ['Jeg har seks flater, men ikke alle er kvadrater. Hvilken romfigur kan jeg være?', 'Et firkantet prisme, for eksempel en eske.'],
        ['Hvilke av romfigurene kule, kube og sylinder kan rulle? Forklar.', 'Kulen og sylinderen kan rulle fordi de har krumme flater. Kuben har bare plane flater og ruller ikke jevnt.'],
        ['Ali sier at alle romfigurer med seks flater er kuber. Har Ali rett? Forklar.', 'Nei. Et firkantet prisme har også seks flater, men flatene trenger ikke være kvadrater.'],
        ['En firkantet pyramide og en kube står på bordet. Hvilken har flest hjørner, og hvor mange flere?', 'Kuben har 8 hjørner og pyramiden har 5, så kuben har 3 flere.'],
        ['Hvor mange kanter har et trekantet prisme? Forklar hvordan du teller.', '9 kanter: 3 kanter i hver av de to trekantene og 3 kanter som går mellom dem.'],
      ],
      n,
    ),
)

const ANGLE_NAMES = (d: number) => (d < 90 ? 'spiss' : d === 90 ? 'rett' : 'stump')

/** Vinkeltyper: klassifisere → sammenligne og dele opp en rett vinkel → resonnere og forklare. */
const angleTypeTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      // Appen tegner vinkelen med det samme gradtallet (rett vinkel med rettvinkelsymbol).
      const d = pick([30, 120, 45, 150, 60, 90, 100, 20, 135, 75], i + n)
      return {
        text: `Vinkelen på figuren er ${d}°. Er den spiss, rett eller stump?`,
        solution: `${capitalize(ANGLE_NAMES(d))} vinkel (${d < 90 ? 'mindre enn 90°' : d === 90 ? 'nøyaktig 90°' : 'mellom 90° og 180°'})`,
        figure: { kind: 'angle', angleType: d < 90 ? 'acute' : d === 90 ? 'right' : 'obtuse', degrees: d },
      }
    }),
  (n) =>
    five((i): TextSpec => {
      if (i % 2 === 0) {
        const x = 10 * vary(n, i, 2, 7)
        return { text: `En rett vinkel deles i to. Den ene delen er ${x}°. Hvor stor er den andre delen, og hva slags vinkler er begge delene?`, solution: `${90 - x}°. Begge delene er spisse vinkler.` }
      }
      const [a, b] = [pick([40, 70, 85, 60, 35], i + n), pick([110, 95, 140, 125, 160], i + n)]
      return { text: `Hvilken vinkel er størst: ${a}° eller ${b}°? Hva slags vinkel er den største?`, solution: `${b}° er størst. ${b}° er en stump vinkel.` }
    }),
  (n) =>
    five((i): TextSpec => {
      if (i % 2 === 0) {
        const d = pick([85, 95, 80, 100, 88, 92], i + n)
        return { text: `Lars sier at en vinkel på ${d}° er rett fordi den er nesten 90°. Har Lars rett? Forklar.`, solution: `Nei. En rett vinkel er nøyaktig 90°. ${d}° er en ${ANGLE_NAMES(d)} vinkel.` }
      }
      const h = pick([3, 2, 4, 1, 5], i + n)
      const d = 30 * h
      return { text: `Viserne på en klokke peker på 12 og ${h}. Hver time på urskiven er 30°. Hvor stor er vinkelen mellom viserne, og hva slags vinkel er det?`, solution: `${d}°, en ${ANGLE_NAMES(d)} vinkel (${h} · 30 = ${d}).` }
    }),
)

// ---------------------------------------------------------------------------------------
// Problemløsing: fire fagområder i fire økter – regnefortellinger og regneuttrykk, bruke modeller,
// flerstegsoppgaver og flervalgsoppgaver. Grunnoppgavene er tekstoppgaver, så eleven selv skriver
// regneuttrykket, tegner modellen og viser stegene. Nivåene handler om støtte og resonnement:
// synlig støtte → velge framgangsmåte selv → vurdere, finne feil og forklare.

const PEOPLE = ['Ida', 'Ola', 'Nora', 'Emil', 'Sara', 'Ali', 'Mia', 'Jonas', 'Lisa', 'Even']
const person = (i: number) => pick(PEOPLE, i)
const LETTERS = ['A', 'B', 'C', 'D']

/** Svaralternativene på hver sin linje («A) …»). Det riktige flyttes rundt med `i`. */
function choices(correct: string, wrong: string[], i: number) {
  const all = [correct, ...wrong]
  const shift = i % all.length
  const order = [...all.slice(shift), ...all.slice(0, shift)]
  return { lines: order.map((o, k) => `${LETTERS[k]}) ${o}`).join('\n'), letter: LETTERS[order.indexOf(correct)] }
}

/** Regnefortellinger og regneuttrykk: ett steg → ett uttrykk med to regnetegn → finne feilen i et uttrykk. */
const storyTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      const [p, q] = [vary(n, i, 12, 45), vary(n + 1, i, 10, 35)]
      return {
        text: `En is koster ${p} kr og en brus koster ${q} kr. Hva koster de til sammen? Skriv regneuttrykket og svaret.`,
        solution: `${p} + ${q} = ${p + q}. De koster ${p + q} kr til sammen.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const variant = (i + n) % 3
      if (variant === 0) {
        const [a, b, c] = [vary(n, i, 24, 48), vary(n + 1, i, 6, 19), vary(n + 2, i, 4, 15)]
        return {
          text: `Det sitter ${a} personer på bussen. På en holdeplass går ${b} av, og ${c} går på. Skriv ett regneuttrykk som viser hvor mange som sitter på bussen nå. Regn ut.`,
          solution: `${a} − ${b} + ${c} = ${a - b + c}. Nå sitter det ${a - b + c} personer på bussen.`,
        }
      }
      if (variant === 1) {
        const [m, book, gift] = [vary(n, i, 60, 150), vary(n + 1, i, 25, 55), vary(n + 2, i, 20, 50)]
        const who = person(i + n)
        return {
          text: `${who} har ${m} kr. ${who} kjøper en bok til ${book} kr og får ${gift} kr av bestemor. Skriv ett regneuttrykk som viser hvor mange kroner ${who} har nå. Regn ut.`,
          solution: `${m} − ${book} + ${gift} = ${m - book + gift}. ${who} har ${m - book + gift} kr nå.`,
        }
      }
      const [k, m, x] = [vary(n, i, 3, 6), vary(n + 1, i, 4, 9), vary(n + 2, i, 2, 9)]
      return {
        text: `Det er ${k} poser med ${m} epler i hver. I tillegg ligger det ${x} løse epler i kurven. Skriv ett regneuttrykk som viser hvor mange epler det er til sammen. Regn ut.`,
        solution: `${k} · ${m} + ${x} = ${k * m + x}. Det er ${k * m + x} epler til sammen.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const who = person(i + n + 3)
      const variant = (i + n) % 3
      if (variant === 0) {
        const [t, k] = [vary(n, i, 52, 96), vary(n + 1, i, 13, 39)]
        return {
          text: `Oppgave: «Det er ${t} bøker i klassebiblioteket. ${k} av dem er lånt ut. Hvor mange bøker står i hylla?»\n${who} skriver ${t} + ${k} = ${t + k}. Hva har ${who} gjort feil? Skriv riktig regneuttrykk og svar, og forklar hvorfor svaret til ${who} ikke kan stemme.`,
          solution: `${who} har lagt sammen i stedet for å trekke fra. Riktig: ${t} − ${k} = ${t - k}. ${t - k} bøker står i hylla. ${t + k} er flere enn alle bøkene i klassebiblioteket, så svaret kan ikke stemme.`,
        }
      }
      if (variant === 1) {
        const [g, m] = [vary(n, i, 3, 6), vary(n + 1, i, 6, 9)]
        return {
          text: `Oppgave: «Det er ${g} brett med ${m} boller på hvert brett. Hvor mange boller er det til sammen?»\n${who} skriver ${g} + ${m} = ${g + m}. Hva har ${who} gjort feil? Skriv riktig regneuttrykk og svar, og forklar.`,
          solution: `${who} har lagt sammen tallene, men det er ${g} like grupper med ${m} i hver. Riktig: ${g} · ${m} = ${g * m}. Det er ${g * m} boller til sammen.`,
        }
      }
      const [a, b] = [vary(n, i, 30, 60), vary(n + 1, i, 8, 25)]
      return {
        text: `Oppgave: «Lisa har ${a} klistremerker. Hun får ${b} klistremerker til. Hvor mange har hun nå?»\n${who} skriver ${a} − ${b} = ${a - b}. Hva har ${who} gjort feil? Skriv riktig regneuttrykk og svar, og forklar.`,
        solution: `${who} har trukket fra, men Lisa får flere klistremerker. Riktig: ${a} + ${b} = ${a + b}. Lisa har ${a + b} klistremerker nå.`,
      }
    }),
)

/** Bruke modeller: ferdig modell eller tydelig tegneinstruksjon → tegne og bruke modellen selv → tolke og vurdere en modell. */
const modelTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      const variant = (i + n) % 4
      if (variant === 0) {
        const [a, b] = [vary(n, i, 12, 40), vary(n + 1, i, 3, 15)]
        return {
          text: `Ida har ${a} kort. Ola har ${b} flere enn Ida. Blokkmodellen viser problemet:\n\nIda: [ ${a} ]\nOla: [ ${a} ][ ${b} ]\n\nHvor mange kort har Ola?`,
          solution: `${a} + ${b} = ${a + b}. Ola har ${a + b} kort.`,
        }
      }
      if (variant === 1) {
        const [t, a] = [vary(n, i, 60, 150), vary(n + 1, i, 15, 45)]
        return {
          text: `Klassen har samlet ${t} flasker på to uker. Den første uka samlet de ${a} flasker. Blokkmodellen viser problemet:\n\nTil sammen: ${t}\n[ Første uke: ${a} ][ Andre uke: ? ]\n\nHvor mange flasker samlet de den andre uka?`,
          solution: `${t} − ${a} = ${t - a}. De samlet ${t - a} flasker den andre uka.`,
        }
      }
      if (variant === 2) {
        const [k, m] = [vary(n, i, 3, 6), vary(n + 1, i, 4, 8)]
        return {
          text: `På en hylle står ${k} esker. I hver eske ligger ${m} baller. Tegn ${k} ringer med ${m} prikker i hver ring. Hvor mange baller er det i alt?`,
          solution: `${k} · ${m} = ${k * m}. Det er ${k * m} baller i alt.`,
        }
      }
      const length = pick([500, 600, 700, 800, 900], i + n)
      const walked = 100 * vary(n, i, 1, length / 100 - 1)
      const who = person(i + n)
      return {
        text: `Et løp er ${length} meter. ${who} har løpt ${walked} meter. Tegn en tallinje som starter på 0 og slutter på ${length}, med en strek for hver hundre meter. Sett et kryss der ${who} er nå. Hvor langt er det igjen til mål?`,
        solution: `${length} − ${walked} = ${length - walked}. Det er ${length - walked} meter igjen til mål.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const variant = (i + n) % 4
      const [first, second] = [person(i + n), person(i + n + 5)]
      if (variant === 0) {
        const b = vary(n, i, 12, 40)
        const a = b + vary(n + 1, i, 5, 30)
        return {
          text: `${first} har ${a} kort og ${second} har ${b} kort. Tegn en blokkmodell med én stripe for ${first} og én for ${second}. Hvor mange flere kort har ${first}?`,
          solution: `${a} − ${b} = ${a - b}. ${first} har ${a - b} flere kort enn ${second}.`,
        }
      }
      if (variant === 1) {
        const [a, b] = [vary(n, i, 30, 60), vary(n + 1, i, 5, 20)]
        return {
          text: `${first} har ${a} klistremerker. ${second} har ${b} færre enn ${first}. Tegn en blokkmodell med én stripe for ${first} og én for ${second}. Hvor mange klistremerker har ${second}? Hvor mange har de til sammen?`,
          solution: `${second}: ${a} − ${b} = ${a - b}. Til sammen: ${a} + ${a - b} = ${2 * a - b}.`,
        }
      }
      if (variant === 2) {
        const p = vary(n, i, 6, 15)
        const [one, many] = pick([['klistremerkeark', 'klistremerkeark'], ['frimerke', 'frimerker'], ['postkort', 'postkort']], i + n)
        return {
          text: `Ett ${one} koster ${p} kr. Fyll ut en tabell med kolonnene «Antall» og «Pris» for 1 til 5 ${many}. Hva må du betale for 5 ${many}?`,
          solution: `1: ${p} kr, 2: ${2 * p} kr, 3: ${3 * p} kr, 4: ${4 * p} kr, 5: ${5 * p} kr. 5 · ${p} = ${5 * p}, så prisen er ${5 * p} kr for 5 ${many}.`,
        }
      }
      const [k, q] = [vary(n, i, 3, 5), vary(n + 1, i, 8, 19)]
      return {
        text: `${k * q} klistremerker skal fordeles likt i ${k} album. Tegn en blokkmodell som er delt i ${k} like store deler. Hvor mange klistremerker blir det i hvert album?`,
        solution: `${k * q} : ${k} = ${q}. Det blir ${q} klistremerker i hvert album.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const variant = (i + n) % 3
      if (variant === 0) {
        const [bigDef, smallDef] = pick([['Sykkelen', 'hjelmen'], ['Gitaren', 'sekken'], ['Teltet', 'soveposen']], i + n)
        const [k, u] = [vary(n, i, 2, 4), 10 * vary(n + 1, i, 3, 9)]
        const total = (k + 1) * u
        return {
          text: `${bigDef} er ${k} ganger så dyr som ${smallDef}. Til sammen koster ${bigDef.toLowerCase()} og ${smallDef} ${total} kr. Bruk en blokkmodell til å finne prisen på hver av dem, og forklar hvordan modellen hjelper deg.`,
          solution: `${smallDef.charAt(0).toUpperCase()}${smallDef.slice(1)} koster ${u} kr, og ${bigDef.toLowerCase()} koster ${k * u} kr. ${k} + 1 = ${k + 1} like blokker, og ${total} : ${k + 1} = ${u}. ${k} · ${u} = ${k * u}.`,
        }
      }
      const [a, b, c] = [person(i + n), person(i + n + 4), person(i + n + 7)]
      if (variant === 1) {
        const beads = vary(n, i, 8, 19)
        return {
          text: `Oppgave: «${a} har 3 ganger så mange perler som ${b}. ${b} har ${beads} perler. Hvor mange perler har ${a}?»\n${c} tegner denne modellen:\n${b}: [ ${beads} ]\n${a}: [ ${beads} ][ ${beads} ]\nEr modellen riktig? Forklar og finn hvor mange perler ${a} har.`,
          solution: `Nei. ${a} skal ha 3 blokker på ${beads}, ikke 2. 3 · ${beads} = ${3 * beads}. ${a} har ${3 * beads} perler.`,
        }
      }
      const [part, extra] = [5 * vary(n, i, 2, 9), vary(n + 1, i, 3, 9)]
      return {
        text: `Blokkmodellen viser en mengde som er delt i fire blokker:\n\n[ ${part} ][ ${part} ][ ${part} ][ ${extra} ]\nHele mengden: ?\n\nSkriv en hverdagsfortelling som modellen kan vise, og et regneuttrykk som passer. Regn ut og forklar hva hver blokk betyr.`,
        solution: `3 · ${part} + ${extra} = ${3 * part + extra}. Fortellingen må ha 3 like deler på ${part} og én del på ${extra}.`,
      }
    }),
)

/** Jenter og gutter deles i grupper (to steg uten synlig støtte). Nivå 2. */
function groupTripTasks(n: number) {
  return five((i): TextSpec => {
    const d = pick([2, 3, 4], i + n)
    const total = d * vary(n, i, 5, 8)
    const girls = vary(n + 1, i, 4, total - 4)
    return {
      text: `En klasse har ${girls} jenter og ${total - girls} gutter. De deles i grupper på ${d}. Hvor mange grupper blir det?`,
      solution: `${total / d} grupper  (${girls} + ${total - girls} = ${total}, ${total} : ${d} = ${total / d})`,
    }
  })
}

/** Flerstegsoppgaver (i økta og i repetisjon): synlige steg → to steg uten støtte → tolke svaret (avrunding oppover) og finne et glemt steg. */
const multiStepTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      const p = vary(n, i, 10, 20)
      const m = pick([50, 100], i + n)
      return {
        text: `Ola har ${m} kr. Han kjøper 2 is som koster ${p} kr hver.\nSteg 1: Hva koster de 2 isene?\nSteg 2: Hvor mye har Ola igjen?`,
        solution: `Steg 1: 2 · ${p} = ${2 * p} kr. Steg 2: ${m} − ${2 * p} = ${m - 2 * p} kr. Ola har ${m - 2 * p} kr igjen.`,
      }
    }),
  (n) => groupTripTasks(n),
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        const total = vary(n, i, 40, 90)
        const seats = pick([8, 9, 12, 15], i + n)
        let cycling = vary(n + 1, i, 5, 20)
        if ((total - cycling) % seats === 0) cycling++
        const bus = total - cycling
        const [q, r] = [Math.floor(bus / seats), bus % seats]
        return {
          text: `${total} elever skal på tur. ${cycling} av dem sykler. Resten tar minibuss. Hver minibuss har plass til ${seats} elever. Hvor mange minibusser trengs? Forklar hvordan du tenker.`,
          solution: `${total} − ${cycling} = ${bus} elever tar minibuss. ${bus} : ${seats} = ${q} rest ${r}. ${q} minibusser er for lite, fordi ${r} elever da ikke får plass. Det trengs ${q + 1} minibusser.`,
        }
      }
      const [k, m] = [vary(n, i, 3, 5), vary(n + 1, i, 6, 10)]
      const x = vary(n + 2, i, 2, m - 1)
      const [a, b] = [person(i + n), person(i + n + 3)]
      return {
        text: `Oppgave: «${a} har ${k} poser med ${m} drops i hver. ${a} gir bort ${x} drops. Hvor mange drops er igjen?»\n${b} regner slik: ${m} − ${x} = ${m - x}. Hva har ${b} glemt? Løs oppgaven riktig og forklar.`,
        solution: `${b} har glemt at det er ${k} poser. ${k} · ${m} = ${k * m}, og ${k * m} − ${x} = ${k * m - x}. Det er ${k * m - x} drops igjen.`,
      }
    }),
)

/** Flervalgsoppgaver: ett steg → to steg med begrunnelse → vurdere løsninger og påstander. Gale svar kommer av typiske tankefeil. */
const choiceTasks = byLevel(
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        let a = vary(n, i, 23, 48)
        const b = vary(n + 1, i, 6, 9)
        // Tierovergang, så «glemt tieren» er en tankefeil som gir et annet svar.
        if ((a % 10) + b < 10) a = a - (a % 10) + 7
        const sum = a + b
        const who = person(i + n)
        const { lines, letter } = choices(String(sum), [String(a - b), String(sum - 10), String(sum + 1)], i)
        return { text: `I en boks ligger ${a} knapper. ${who} legger ${b} knapper til i boksen. Hvor mange knapper er det i boksen nå?\n${lines}`, solution: `${letter}) ${sum}. ${a} + ${b} = ${sum}.` }
      }
      const [rows, hooks] = [vary(n, i, 5, 9), vary(n + 1, i, 2, 4)]
      const { lines, letter } = choices(`${rows} · ${hooks}`, [`${rows} + ${hooks}`, `${rows} − ${hooks}`], i)
      return {
        text: `I en garderobe er det ${rows} rader. Hver rad har ${hooks} knagger. Hvilket regneuttrykk viser hvor mange knagger det er i alt?\n${lines}`,
        solution: `${letter}) ${rows} · ${hooks}. Det er ${rows * hooks} knagger.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const who = person(i + n)
      if ((i + n) % 2 === 0) {
        const [k, m, x] = [vary(n, i, 3, 6), vary(n + 1, i, 6, 12), vary(n + 2, i, 3, 8)]
        const left = k * m - x
        const { lines, letter } = choices(String(left), [String(k * m), String(k * m + x), String(k + m - x)], i)
        return {
          text: `${who} har ${k} esker med ${m} kritt i hver. ${x} kritt er knekt og kastes. Hvor mange hele kritt er det igjen? Forklar hvordan du fant svaret.\n${lines}`,
          solution: `${letter}) ${left}. ${k} · ${m} = ${k * m}, ${k * m} − ${x} = ${left}.`,
        }
      }
      const [a, b] = [vary(n, i, 40, 90), vary(n + 1, i, 12, 35)]
      const { lines, letter } = choices(
        `${who} har ${a} kr og bruker ${b} kr på en bok. Hvor mange kroner har ${who} igjen?`,
        [`${who} har ${b} kr og får ${a} kr til. Hvor mange kroner har ${who} nå?`, `Det er ${b} esker med ${a} kritt i hver. Hvor mange kritt er det?`],
        i,
      )
      return {
        text: `Hvilken fortelling passer til ${a} − ${b}? Forklar hvorfor.\n${lines}`,
        solution: `${letter}. ${a} − ${b} = ${a - b}. Bare i ${letter} blir noe tatt bort fra ${a}. De andre fortellingene passer til pluss og gange.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        const [perDay, days] = [vary(n, i, 5, 15), vary(n + 1, i, 3, 5)]
        const length = perDay * days + vary(n + 2, i, 10, 60)
        const who = person(i + n + 2)
        const { lines, letter } = choices(
          `Bo: ${perDay} · ${days} = ${perDay * days}, ${length} − ${perDay * days} = ${length - perDay * days}`,
          [`Ali: ${length} − ${perDay} − ${days} = ${length - perDay - days}`, `Cem: ${length} − ${perDay} = ${length - perDay}, ${length - perDay} − ${days} = ${length - perDay - days}`],
          i,
        )
        return {
          text: `Oppgave: «Et puslespill har ${length} brikker. ${who} legger ${perDay} brikker hver kveld i ${days} kvelder. Hvor mange brikker er det igjen å legge?»\nHvem har riktig løsning? Forklar hva de andre har tenkt feil.\n${lines}`,
          solution: `${letter}) Bo. ${who} har lagt ${perDay} · ${days} = ${perDay * days} brikker, så det er ${length - perDay * days} brikker igjen. De andre trekker fra ${days} som om det var brikker, men ${days} er antall kvelder.`,
        }
      }
      const [rows, seats, broken] = [vary(n, i, 3, 6), vary(n + 1, i, 5, 9), vary(n + 2, i, 2, 6)]
      const left = rows * seats - broken
      return {
        text: `Oppgave: «Det er ${rows} rader med ${seats} stoler i hver rad. ${broken} stoler er ødelagte. Hvor mange stoler kan brukes?»\nHvilke påstander er sanne? Det kan være mer enn én. Forklar.\nA) Oppgaven har to regnesteg.\nB) Svaret er ${left}.\nC) Oppgaven kan løses med ${rows} + ${seats} − ${broken}.\nD) Svaret er mindre enn ${rows * seats}.`,
        solution: `A, B og D er sanne. ${rows} · ${seats} = ${rows * seats}, ${rows * seats} − ${broken} = ${left}. C er feil fordi ${rows} + ${seats} − ${broken} = ${rows + seats - broken}.`,
      }
    }),
)

// ---------------------------------------------------------------------------------------
// Tall og regning: sammenhengen mellom regneartene (økt 1–2), desimaltall med tideler (økt 3–4) og desimaltall
// i lengdemåling (økt 5–6). Nivå 1 har tydelig støtte, nivå 2 bruker sammenhengen selv, og nivå 3 vurderer,
// forklarer eller finner feil. Repetisjon uten profil bruker de samme reglene som øktene den repeterer.

/** «1 tidel», «3 tideler». */
const tenths = (k: number) => `${k} ${k === 1 ? 'tidel' : 'tideler'}`

/** Pluss og minus: bruke et pluss-stykke → ukjent ledd og kontroll → vurdere og forklare sammenhengen. */
const addSubTasks = byLevel(
  (n) =>
    five((i): TaskSpec => {
      const [a, b] = [vary(n, i, 12, 48), vary(n + 1, i, 11, 39)]
      return [H, a + b, '-', b, `${a} + ${b} = ${a + b}. Bruk det til å finne ${a + b} − ${b}.`]
    }),
  (n) =>
    five((i): TextSpec => {
      const variant = (i + n) % 3
      if (variant === 0) {
        const [b, x] = [vary(n, i, 24, 68), vary(n + 1, i, 27, 89)]
        return { text: `Hvilket tall skal stå på den tomme plassen? __ + ${b} = ${x + b}. Vis hvilket minus-stykke som gir svaret.`, solution: `${x}. Minus-stykket er ${x + b} − ${b} = ${x}.` }
      }
      if (variant === 1) {
        const [b, d] = [vary(n, i, 35, 79), vary(n + 1, i, 48, 160)]
        return { text: `Hvilket tall skal stå på den tomme plassen? __ − ${b} = ${d}. Vis hvilket pluss-stykke som gir svaret.`, solution: `${d + b}. Pluss-stykket er ${d} + ${b} = ${d + b}.` }
      }
      const [c, b] = [vary(n, i, 201, 480), vary(n + 1, i, 112, 189)]
      return { text: `Regn ut ${c} − ${b}, og sjekk svaret ved å legge sammen.`, solution: `${c} − ${b} = ${c - b}. Kontroll: ${c - b} + ${b} = ${c}.` }
    }),
  (n) =>
    five((i): TextSpec => {
      const who = person(i + n)
      if ((i + n) % 2 === 0) {
        const [b, d] = [vary(n, i, 18, 45), vary(n + 1, i, 50, 95)]
        return {
          text: `I regnestykket __ − ${b} = ${d} mangler et tall. ${who} mener at det er ${d - b}, fordi ${d} − ${b} = ${d - b}. Stemmer det? Forklar og finn det riktige tallet.`,
          solution: `Nei. Tallet som mangler er helheten: ${d} + ${b} = ${d + b}, og ${d + b} − ${b} = ${d}.`,
        }
      }
      const [a, b] = [10 * vary(n, i, 8, 19), 10 * vary(n + 1, i, 6, 14)]
      return {
        text: `Forklar hvorfor ${a + b} − ${b} = ${a} betyr at ${a} + ${b} = ${a + b}. Bruk ordene helhet og del.`,
        solution: `Begge regnestykkene handler om helheten ${a + b} med delene ${a} og ${b}. Tar vi bort delen ${b} fra helheten, står ${a} igjen. Legger vi delene sammen, får vi ${a + b}.`,
      }
    }),
)

/** Gange og dele: bruke et gangestykke → tiere og ukjent tall → vurdere en påstand og finne feilen. */
const multDivTasks = byLevel(
  (n) =>
    five((i): TaskSpec => {
      const b = pick([2, 5, 10], i + n)
      const a = vary(n, i, 2, 10)
      return [H, a * b, '/', b, `${a} · ${b} = ${a * b}. Bruk det til å finne ${a * b} : ${b}.`]
    }),
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        const [f, t] = [vary(n, i, 2, 6), 10 * vary(n + 1, i, 2, 9)]
        return { text: `Du vet at ${f} · ${t} = ${f * t}. Hvilke to delestykker kan du løse med dette? Skriv dem med svar.`, solution: `${f * t} : ${f} = ${t} og ${f * t} : ${t} = ${f}.` }
      }
      const [q, d] = [vary(n, i, 3, 9), vary(n + 1, i, 3, 9)]
      return { text: `Hvilket tall mangler? ${q * d} : __ = ${q}. Skriv gangestykket som viser svaret.`, solution: `${d}. Gangestykket er ${q} · ${d} = ${q * d}.` }
    }),
  (n) =>
    five((i): TextSpec => {
      const who = person(i + n + 2)
      if ((i + n) % 2 === 0) {
        const [f, t] = [vary(n, i, 3, 8), 10 * vary(n + 1, i, 2, 9)]
        return {
          text: `${who} påstår: «Siden ${f} · ${t} = ${f * t}, er ${f * t} : ${t} = ${f}.» Har ${who} rett? Forklar.`,
          solution: `Ja. ${f} og ${t} er faktorer, og ${f * t} er produktet. Deler vi produktet på den ene faktoren, får vi den andre: ${f * t} : ${t} = ${f}.`,
        }
      }
      const [a, q] = [vary(n, i, 6, 8), vary(n + 1, i, 6, 9)]
      return {
        text: `${who} mener at ${a * q} : ${a} = ${q + 1}. Som begrunnelse skriver ${who} at ${a} · ${q + 1} = ${a * q}. Hva er galt? Skriv riktig svar og forklar.`,
        solution: `${a} · ${q + 1} = ${a * (q + 1)}, ikke ${a * q}. ${a} · ${q} = ${a * q}, så ${a * q} : ${a} = ${q}.`,
      }
    }),
)

/** Tideler: skrive tideler → addisjon over én hel og sammenligning → vurdere en misoppfatning og forklare. */
const writeTenths = byLevel(
  (n) =>
    five((i): TextSpec => {
      const t = vary(n, i, 1, 9)
      return { text: `Skriv som desimaltall: ${tenths(t)}`, solution: `0,${t}` }
    }),
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        const x = vary(n, i, 4, 9)
        const y = Math.max(vary(n + 1, i, 3, 9), 11 - x)
        const sum = x + y
        return {
          text: `Legg sammen 0,${x} og 0,${y}. Hvor mange hele og tideler blir det? Skriv svaret som desimaltall.`,
          solution: `${dec(sum / 10)}. 0,${x} + 0,${y} = ${dec(sum / 10)}. ${tenths(x)} + ${tenths(y)} = ${sum} tideler, som er 1 hel og ${tenths(sum - 10)}.`,
        }
      }
      const x = vary(n, i, 1, 4)
      const y = x + vary(n + 1, i, 3, 5)
      return { text: `Hvilket tall er størst, 1,${x} eller 0,${y}? Forklar med tideler.`, solution: `1,${x} er størst. 1,${x} er ${10 + x} tideler, og 0,${y} er ${y} tideler.` }
    }),
  (n) =>
    five((i): TextSpec => {
      if ((i + n) % 2 === 0) {
        const x = vary(n, i, 1, 4)
        const y = x + vary(n + 1, i, 3, 5)
        const who = person(i + n)
        return {
          text: `«0,${y} må være større enn 1,${x}, for ${y} er større enn ${x}», sier ${who}. Stemmer det? Forklar med tideler.`,
          solution: `Nei. 1,${x} er større enn 0,${y}. 1,${x} er ${10 + x} tideler, og 0,${y} er bare ${y} tideler.`,
        }
      }
      const [h, t] = [vary(n, i, 2, 9), vary(n + 1, i, 1, 9)]
      return {
        text: `Et tall har ${h} hele og ${tenths(t)}. Skriv tallet som desimaltall, og forklar hvor mange tideler det er i tallet til sammen.`,
        solution: `${h},${t}. Det er ${10 * h + t} tideler, fordi ${h} hele er ${10 * h} tideler og ${tenths(t)} til gir ${10 * h + t} tideler.`,
      }
    }),
)

/** Tideler på tallinjen: hopp fra 0 → hopp fra et desimaltall → ordne og vurdere plassering. */
const numberLineTenths = byLevel(
  (n) =>
    five((i): TextSpec => {
      const k = vary(n, i, 1, 9)
      return {
        text: `Tenk deg en tallinje fra 0 til 1 med 10 like lange hopp. Hvilket desimaltall kommer du til etter ${k} hopp fra 0?`,
        solution: `0,${k}. Hvert hopp er én tidel, og ${k} hopp er ${k} tideler.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const start = 10 * vary(n, i, 0, 1) + vary(n + 1, i, 1, 9)
      let k = vary(n + 2, i, 3, 8)
      if ((start + k) % 10 === 0) k++
      return {
        text: `Du står på ${dec(start / 10)} på tallinjen og hopper ${k} tideler fremover. Hvilket desimaltall lander du på?`,
        solution: `${dec((start + k) / 10)}. ${dec(start / 10)} + 0,${k} = ${dec((start + k) / 10)}.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const x = vary(n, i, 1, 4)
      if ((i + n) % 2 === 0) {
        const y = x + vary(n + 1, i, 2, 5)
        const w = y > 5 ? y - 4 : y + 2
        const z = vary(n + 2, i, 5, 9) === x ? x + 4 : vary(n + 2, i, 5, 9)
        const values = [10 + x, y, 10 + z, w]
        return {
          text: `Sett tallene i rekkefølge fra minst til størst, og forklar hvordan en tallinje fra 0 til 2 hjelper deg: ${values.map((v) => dec(v / 10)).join(' ')}`,
          solution: `${[...values].sort((a, b) => a - b).map((v) => dec(v / 10)).join(' ')}. Tallene med 0 hele ligger mellom 0 og 1 på tallinjen, og tallene med 1 hel ligger mellom 1 og 2. Innenfor hver del ser vi på tidelene.`,
        }
      }
      const who = person(i + n + 1)
      return {
        text: `${who} plasserer 1,${x} mellom 0 og 1 på tallinjen. Har ${who} rett? Forklar hvor tallet skal stå.`,
        solution: `Nei. 1,${x} er større enn 1, så tallet skal stå mellom 1 og 2, ${x} tideler etter 1.`,
      }
    }),
)

/** Lengder: centimeter og millimeter → meter til desimeter → vurdere en omgjøring og regne på to måter. */
const convertLengths = byLevel(
  (n) =>
    five((i): TextSpec => {
      const [c, mm] = [vary(n, i, 2, 15), vary(n + 1, i, 1, 9)]
      return { text: `En blyant er ${c} cm og ${mm} mm lang. Skriv lengden i centimeter med desimaltall.`, solution: `${c},${mm} cm` }
    }),
  (n) =>
    five((i): TextSpec => {
      const m = vary(n, i, 11, 49)
      return { text: `Gjør om ${dec(m / 10)} m til desimeter.`, solution: `${m} dm` }
    }),
  (n) =>
    five((i): TextSpec => {
      const who = person(i + n)
      if ((i + n) % 2 === 0) {
        const [h, t] = [vary(n, i, 1, 4), vary(n + 1, i, 1, 9)]
        return {
          text: `«${h},${t} meter og ${10 * h + t} centimeter er like langt», sier ${who}. Stemmer det? Forklar ved å gjøre om til samme enhet.`,
          solution: `Nei. ${h},${t} m er ${10 * h + t} dm, som er ${100 * h + 10 * t} cm. ${10 * h + t} cm er mye kortere.`,
        }
      }
      const length = vary(n, i, 2, 5)
      const cut = 10 * vary(n + 1, i, 1, length - 1) + vary(n + 2, i, 1, 9)
      const left = 10 * length - cut
      return {
        text: `${who} har et bånd på ${length} m og bruker ${dec(cut / 10)} m til en sløyfe. Regn ut hvor mye bånd som er igjen, først i meter og så i desimeter. Forklar hvorfor svarene viser samme lengde.`,
        solution: `${dec(left / 10)} m, som er ${left} dm. Meter: ${length} − ${dec(cut / 10)} = ${dec(left / 10)}. Desimeter: ${10 * length} dm − ${cut} dm = ${left} dm. 1 m er 10 dm, så begge svarene viser samme lengde.`,
      }
    }),
)

/** Skrive og sammenligne lengder: meter og desimeter → sammenligne to enheter → ordne tre enheter. */
const writeLengths = byLevel(
  (n) =>
    five((i): TextSpec => {
      const [m, d] = [vary(n, i, 1, 3), vary(n + 1, i, 1, 9)]
      return { text: `En hylle måler ${m} m og ${d} dm. Hvor lang er hylla i meter? Skriv svaret som desimaltall.`, solution: `${m},${d} m` }
    }),
  (n) =>
    five((i): TextSpec => {
      const [c, mm] = [vary(n, i, 3, 8), vary(n + 1, i, 1, 9)]
      const inMm = 10 * c + mm
      const other = inMm + pick([-6, -4, -3, 3, 4, 6], i + n)
      const [first, second] = [person(i + n), person(i + n + 5)]
      const longest = inMm > other ? `${c},${mm} cm` : `${other} mm`
      const order = inMm > other ? `${inMm} mm er mer enn ${other} mm` : `${other} mm er mer enn ${inMm} mm`
      return {
        text: `${first} har en blyant på ${c},${mm} cm, og ${second} har en på ${other} mm. Hvilken blyant er lengst? Gjør om til samme enhet og forklar.`,
        solution: `Blyanten på ${longest} er lengst. ${c},${mm} cm er ${inMm} mm, og ${order}.`,
      }
    }),
  (n) =>
    five((i): TextSpec => {
      const dm = vary(n, i, 11, 19)
      const m = vary(n + 1, i, 1, 3)
      let cm = vary(n + 2, i, 8, 24)
      while (cm === dm || cm === 10 * m) cm++
      const items = [
        { label: `${dec(dm / 10)} dm`, cm: dm },
        { label: `${cm} cm`, cm },
        { label: `${dec(m / 10)} m`, cm: 10 * m },
      ]
      const sorted = [...items].sort((a, b) => a.cm - b.cm)
      return {
        text: `Ordne disse lengdene fra kortest til lengst: ${items.map((x) => x.label).join(', ')}. Gjør dem om til samme enhet først, og begrunn rekkefølgen.`,
        solution: `${sorted.map((x) => x.label).join(', ')}. ${dec(dm / 10)} dm = ${dm} cm og ${dec(m / 10)} m = ${10 * m} cm, så ${sorted.map((x) => `${x.cm} cm`).join(' < ')}.`,
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

  // Geometri. Økter med profil (Geometri-perioden) får grunnoppgaver etter progresjonen gjenkjenne → sammenligne
  // → resonnere; uten profil (repetisjon) lages de samme oppgavene som før.
  'geo.2d': (level, n, profile) =>
    profile?.taskVariant === 'mangekanter'
      ? polygonTasks(level, n)
      : profile?.taskVariant === 'firkanter'
        ? quadrilateralTasks(level, n)
        : oldPlaneTasks(level, n),
  'geo.3d': (level, n, profile) => (profile?.area === 'tredimensjonale-figurer' ? solidTasks(level, n) : oldSolidTasks(level, n)),
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
      // Elevvisningen har ikke tegneverktøy: nivå 3 forklarer sammenhengen i stedet for å tegne nettet.
      const suffix = level === 2 ? ' Forklar hvordan du vet det.' : level === 3 ? ' Forklar hvilke flater på romfiguren figurene i nettet kommer fra.' : ''
      return { text: `${q}${suffix}`, solution: a }
    })
  },
  // Repetisjonsøkta (uten profil) har regnestykkene som før.
  'geo.vinkler': (level, n, profile) =>
    profile?.taskVariant === 'klassifisere' ? angleTypeTasks(level, n) : profile ? angleSumTextTasks(level, n) : angleSumTasks(level, n),

  // Problemløsing. Repetisjonsøktene bruker de samme grunnoppgavene som øktene de repeterer.
  'prob.regnefortellinger': storyTasks,
  'prob.modeller': modelTasks,
  'prob.flersteg': multiStepTasks,
  'prob.flervalg': choiceTasks,

  // Tall og regning. Repetisjon uten profil bruker de samme reglene (tideler: uten tallinjevarianten).
  'tr.add-sub': addSubTasks,
  'tr.mult-div': multDivTasks,
  'tr.tideler': (level, n, profile) => (profile?.taskVariant === 'tallinje' ? numberLineTenths : writeTenths)(level, n),
  'tr.desimal-lengde': (level, n, profile) => (profile?.taskVariant === 'skrive' ? writeLengths : convertLengths)(level, n),

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
    // Nivå 3: to steg med hele liter og desiliter (desimaltall hører til økta om desimaltall i måling).
    (n) =>
      five((i): TextSpec => {
        const liters = vary(n, i, 2, 3)
        const glasses = vary(n + 1, i, 2, 4)
        const size = pick([2, 3], i + n)
        const [all, used] = [liters * 10, glasses * size]
        return {
          text: `En kanne har ${liters} liter saft. Du fyller ${glasses} glass som rommer ${size} dl hver. Hvor mange dl saft er igjen i kanna?`,
          solution: `${all - used} dl  (${liters} liter = ${all} dl. ${glasses} · ${size} dl = ${used} dl. ${all} dl − ${used} dl = ${all - used} dl.)`,
        }
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
  // Desimaltall i måling: liter og kilogram med én desimal (lengde med desimaltall hører til Tall og regning).
  'mal.desimal': byLevel(
    (n) =>
      five((i): TextSpec => {
        const t = vary(n, i, 1, 9)
        if (i % 2 === 0) {
          const container = pick(['Et glass', 'En kopp', 'En boks'], i + n)
          return { text: `${container} rommer ${t} dl. Skriv hvor mange liter det er, som desimaltall.`, solution: `0,${t} liter  (${t} dl er ${t} tideler av en liter)` }
        }
        return { text: `En ost veier 0,${t} kg. Hvor mange gram er det? Tips: 0,1 kg = 100 g.`, solution: `${t * 100} g  (0,${t} kg er ${t} tideler av en kilo. ${t} · 100 g = ${t * 100} g.)` }
      }),
    (n) =>
      five((i): TextSpec => {
        const [a, b] = [vary(n, i, 1, 3), vary(n + 1, i, 1, 9)]
        if (i % 2 === 0) {
          return { text: `Gjør om ${a},${b} liter til desiliter.`, solution: `${a * 10 + b} dl  (${a} liter er ${a * 10} dl, og 0,${b} liter er ${b} dl.)` }
        }
        const item = pick(['En pose poteter', 'En sekk med jord', 'En pose mel'], i + n)
        return { text: `${item} veier ${a},${b} kg på butikkvekta. Skriv vekten i gram.`, solution: `${a * 1000 + b * 100} g  (${a} kg er ${a * 1000} g, og 0,${b} kg er ${b * 100} g.)` }
      }),
    (n) =>
      five((i): TextSpec => {
        const [a, b] = [vary(n, i, 1, 3), vary(n + 1, i, 1, 9)]
        if (i % 2 === 0) {
          // Den andre kanna har 1–3 dl mer eller mindre (aldri like mye).
          const dl = 10 * a + b
          const other = dl + pick([-3, -2, -1, 1, 2, 3], i + n)
          const [red, blue] = [`${a},${b} liter`, `${other} dl`]
          const winner = other > dl ? ['Den blå kanna', blue] : ['Den røde kanna', red]
          return {
            text: `Den røde kanna rommer ${red}. Den blå kanna rommer ${blue}. Hvilken kanne rommer mest? Forklar med samme enhet.`,
            solution: `${winner[0]} rommer mest: ${winner[1]}. ${red} er ${dl} dl, og ${Math.max(dl, other)} dl er mer enn ${Math.min(dl, other)} dl.`,
          }
        }
        // Masse: 0,b kg mot gram som er 50 g mer eller mindre.
        const grams = 100 * b + pick([-50, 50], i + n)
        const heavy = grams > 100 * b ? `${grams} g` : `0,${b} kg`
        return {
          text: `En pakke veier 0,${b} kg. En annen pakke veier ${grams} g. Hvilken pakke er tyngst? Forklar med samme enhet.`,
          solution: `Pakken på ${heavy} er tyngst. 0,${b} kg er ${100 * b} g, og ${Math.max(grams, 100 * b)} g er mer enn ${Math.min(grams, 100 * b)} g.`,
        }
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
        return [H, end, '-', start, `Filmen begynner kl. 18:${pad(start)} og slutter kl. 18:${pad(end)}. Hvor mange minutter varer den?`]
      }),
    (n) =>
      five((i): TaskSpec => {
        const hours = vary(n, i, 2, 6)
        return [H, hours, '*', 60, `En time er 60 minutter. Hvor mange minutter er ${hours} timer?`]
      }),
  ),

  // Mønster og algoritmer
  'mon.utforske': (level, n) =>
    five((i): TextSpec => {
      // Gjentakende mønstre med ●, ■ og ▲ eller fargeord. Gjentakelsen vises minst to ganger, og fasiten regnes ut.
      const unit = PATTERN_UNITS[level][(i + n) % 5]
      const p = unit.length
      const shown = Array.from({ length: p === 2 ? 6 : p === 3 ? 6 : 8 }, (_, j) => unit[j % p])
      const line = patternLine(shown)
      // Fargemønstre tegnes som sirkler med fargenavnet under (plassen det spørres etter er alltid etter rekka).
      const colors = isColor(unit[0]) ? { figure: { kind: 'colors' as const, items: shown } } : {}
      const word = isColor(unit[0]) ? 'farge' : 'figur'
      const at = (k: number) => unit[(k - 1) % p]
      if (level === 2 && i % 2 === 1 && !isColor(unit[0])) {
        const total = p * vary(n, i, 4, 7)
        const item = unit.find((u) => unit.filter((x) => x === u).length === 1) ?? unit[0]
        const each = unit.filter((x) => x === item).length
        return {
          text: `Ola legger figurer i dette mønsteret:\n${line}\nHan fortsetter til han har lagt ${total} figurer. Hvor mange ${item} har han lagt?`,
          solution: `${(total / p) * each} ${item}. ${total} : ${p} = ${total / p} gjentakelser med ${each} ${item} i hver.`,
          expected: { kind: 'number', value: (total / p) * each },
        }
      }
      if (level === 3) {
        const k = vary(n, i, 30, 60)
        const m = k - ((k - 1) % p) - 1
        return {
          text: `Mønsteret fortsetter likt hele veien:\n${line}\nFinn ${word}en på plass ${k} uten å skrive hele mønsteret. Forklar hvordan du tenker.`,
          solution: `${at(k)}. Gjentakelsen har ${p} ${word}r, og ${m} er i ${p === 4 ? 'fire' : 'tre'}gangen. Plass ${m} er den siste i en gjentakelse, så plass ${k} er nr. ${k - m} i neste.`,
          expected: { kind: 'item', value: at(k) },
          ...colors,
        }
      }
      // Ulik plass i hver oppgave på nivået (7–12 på nivå 1, 13–24 på nivå 2).
      const k = level === 1 ? 7 + ((n + i) % 6) : 13 + ((n + 2 * i) % 12)
      return {
        text: `Her gjentar ${word === 'farge' ? 'fargene' : 'figurene'} seg:\n${line}\nHvilken ${word} står på plass ${k}?${level === 2 ? ' Forklar.' : ''}`,
        solution: `${at(k)}. Gjentakelsen er ${patternLine(unit)}.`,
        expected: { kind: 'item', value: at(k) },
        ...colors,
      }
    }),
  'mon.figurtall': (level, n) =>
    five((i): TextSpec => {
      const [s, d] = [vary(n, i, 1, 5), vary(n + 1, i, 2, 4)]
      const k = level === 1 ? 4 : level === 2 ? 6 : 10
      // Egen formulering – «Figur 1 har 2 prikker. Figur 2 har 4 prikker …» er referanseoppgaven MO2-N1-01.
      // Appen tegner figur 1–3 som prikker (ikke figuren det spørres etter).
      return {
        text: `Et figurtall vokser med like mange prikker hver gang.\nFigur 1: ${s} prikker. Figur 2: ${s + d} prikker. Figur 3: ${s + 2 * d} prikker.\nHvor mange prikker blir det i figur ${k}?`,
        solution: `${s + (k - 1) * d} prikker. Det kommer ${d} nye prikker hver gang.`,
        figure: { kind: 'dots', counts: [s, s + d, s + 2 * d] },
        expected: { kind: 'number', value: s + (k - 1) * d },
      }
    }),
  // Tekstoppgaver: et regnestykke under teksten («16 + 4 = ___») ville vist regelen eleven skal finne.
  'mon.tallfolger': byLevel(
    (n) =>
      five((i): TextSpec => {
        const d = vary(n, i, 2, 9)
        const k = vary(n + 2, i, 6, 10)
        return { text: `Tallfølgen er ${d}, ${2 * d}, ${3 * d}, ${4 * d} … Hva er tall nummer ${k}?`, solution: `${k * d}. Regelen er +${d}.`, expected: { kind: 'number', value: k * d } }
      }),
    (n) =>
      five((i): TextSpec => {
        const d = vary(n, i, 2, 9)
        const start = vary(n, i, 60, 100)
        const seq = [start, start - d, start - 2 * d, start - 3 * d]
        return { text: `Fortsett tallfølgen: ${seq.join(', ')}, __, __`, solution: `${start - 4 * d} og ${start - 5 * d}. Regelen er −${d}.`, answerBoxes: true, expected: { kind: 'numbers', values: [start - 4 * d, start - 5 * d] } }
      }),
    (n) =>
      five((i): TextSpec => {
        // Ikke 4: «4, 8, 16, 32» står allerede i arbeidsarket i økta.
        const start = pick([1, 2, 3, 5, 6], i + n)
        const seq = [start, start * 2, start * 4, start * 8]
        return { text: `Finn regelen og neste tall: ${seq.join(', ')}, ___`, solution: `${start * 16}  (tallet dobles hver gang)`, answerBoxes: true, expected: { kind: 'numbers', values: [start * 16] } }
      }),
  ),
  // Pseudokode i kodeformatet: én kommando per linje og fire mellomrom innrykk inne i løkker og vilkår.
  'mon.lokker': byLevel(
    (n) =>
      five((i): TextSpec => {
        const [r, st] = [vary(n, i, 2, 5), vary(n + 1, i, 2, 6)]
        return {
          text: `En robot følger programmet:\ngjenta ${r} ganger:\n    gå ${st} steg fram\nHvor mange steg går roboten til sammen?`,
          solution: `${r * st} steg. ${r} · ${st} = ${r * st}.`,
          expected: { kind: 'number', value: r * st },
        }
      }),
    (n) =>
      five((i): TextSpec => {
        const [s, r, a, b] = [vary(n, i, 1, 10), vary(n + 1, i, 2, 4), vary(n + 2, i, 5, 9), vary(n + 3, i, 1, 4)]
        return {
          text: `Start med ${s}.\ngjenta ${r} ganger:\n    legg til ${a}\n    trekk fra ${b}\nHvilket tall ender programmet på?`,
          solution: `${s + r * (a - b)}. Hver runde gir ${a} − ${b} = ${a - b} mer: ${s} + ${r} · ${a - b} = ${s + r * (a - b)}.`,
          expected: { kind: 'number', value: s + r * (a - b) },
        }
      }),
    (n) =>
      five((i): TextSpec => {
        const [r, st] = [vary(n, i, 3, 6), vary(n + 1, i, 4, 12)]
        const rounds = Array.from({ length: r }, (_, j) => 100 - (j + 1) * st)
        return {
          text: `Start med 100.\ngjenta ${r} ganger:\n    trekk fra ${st}\nSkriv tallet etter hver runde. Hvilket tall ender du på?`,
          solution: `${rounds.join(', ')}. Tallet til slutt er ${rounds[r - 1]}.`,
          expected: { kind: 'numbers', values: rounds },
        }
      }),
  ),
  'mon.vilkar': byLevel(
    (n) =>
      five((i): TextSpec => {
        const x = vary(n, i, 9, 40)
        const even = x % 2 === 0
        return {
          text: `Start med ${x}.\nhvis tallet er et partall:\n    legg til 10\nellers:\n    legg til 1\nHvilket tall får du?`,
          solution: `${even ? x + 10 : x + 1}. ${x} er et ${even ? 'partall, så programmet legger til 10' : 'oddetall, så programmet går til «ellers» og legger til 1'}.`,
          expected: { kind: 'number', value: even ? x + 10 : x + 1 },
        }
      }),
    (n) =>
      five((i): TextSpec => {
        // Grensetilfellet (tallet er lik grensen) er med: da er tallet ikke større enn grensen.
        const g = vary(n, i, 10, 20)
        const x = g + [0, 3, -2, 0, 5][i]
        const [a, b] = [vary(n + 1, i, 2, 6), vary(n + 2, i, 2, 6)]
        const bigger = x > g
        return {
          text: `Start med ${x}.\nhvis tallet er større enn ${g}:\n    trekk fra ${a}\nellers:\n    legg til ${b}\nHvilket tall får du?`,
          solution: `${bigger ? x - a : x + b}. ${x} er ${bigger ? '' : 'ikke '}større enn ${g}, så programmet ${bigger ? `trekker fra ${a}` : `går til «ellers» og legger til ${b}`}.`,
          expected: { kind: 'number', value: bigger ? x - a : x + b },
        }
      }),
    (n) =>
      five((i): TextSpec => {
        const x = vary(n, i, 12, 24)
        const rounds: number[] = []
        for (let v = x, j = 0; j < 4; j++) rounds.push((v = v > 20 ? v - 6 : v + 5))
        return {
          text: `Start med ${x}.\ngjenta 4 ganger:\n    hvis tallet er større enn 20:\n        trekk fra 6\n    ellers:\n        legg til 5\nHvilket tall har du etter hver runde?`,
          solution: `${rounds.join(', ')}. Tallet til slutt er ${rounds[3]}. Vilkåret sjekkes på nytt i hver runde.`,
          expected: { kind: 'numbers', values: rounds },
        }
      }),
  ),

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
export const taskKey = (task: GeneratedTask) =>
  isTextSpec(task) ? `${task.text}${task.figure && task.figure.kind !== 'dots' && task.figure.kind !== 'colors' ? `|${visualSignature(task.figure)}` : ''}` : `${task[1]} ${task[2]} ${task[3]}`

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

// ---------------------------------------------------------------------------------------
// Geometri: fire fagområder fordelt på seks økter i tre uker – todimensjonale figurer (økt 1–2),
// tredimensjonale figurer (økt 3), fra tredimensjonal til todimensjonal (økt 4) og vinkler (økt 5–6).
// Nivåene: gjenkjenne og beskrive → sammenligne og bruke egenskaper → resonnere og forklare.

const GEOMETRY_SUPPORT: Record<Level, string> = {
  1: 'Gjenkjenne og beskrive: korte, konkrete spørsmål om navn, sider, hjørner, kanter, flater og enkle vinkeltyper.',
  2: 'Sammenligne og bruke egenskaper: sortere, sammenligne, symmetri, flater og nett, enkle vinkelberegninger. Mindre støtte enn på nivå 1.',
  3: 'Resonnere og forklare: vurdere påstander, begrunne klassifiseringer, lage eller undersøke nett og trekke slutninger fra egenskaper.',
}

const GEOMETRY_LEVELS: Record<GeometryArea, [LevelText, LevelText, LevelText]> = {
  'todimensjonale-figurer': [
    { title: 'Plane figurer – gjenkjenne', subtitle: 'Navn, sider og hjørner.', description: 'Kjenne igjen trekanter, firkanter og andre mangekanter og telle sider og hjørner.', numbers: 'Mangekanter med 3 til 8 sider' },
    { title: 'Plane figurer – sammenligne', subtitle: 'Egenskaper og symmetri.', description: 'Sammenligne og sortere figurer etter sider, hjørner og rette vinkler, og finne symmetrilinjer.', numbers: 'Mangekanter med 3 til 8 sider' },
    { title: 'Plane figurer – resonnere', subtitle: 'Påstander og egenskaper.', description: 'Vurdere påstander om figurer og finne en figur ut fra flere egenskaper.', numbers: 'Mangekanter med 3 til 8 sider' },
  ],
  'tredimensjonale-figurer': [
    { title: 'Romfigurer – gjenkjenne', subtitle: 'Navn, flater, kanter og hjørner.', description: 'Kjenne igjen kube, kule, sylinder, prisme og pyramide og telle flater, kanter og hjørner.', numbers: 'Kube, kule, sylinder, prisme og pyramide' },
    { title: 'Romfigurer – sammenligne', subtitle: 'Flater og former.', description: 'Beskrive formen på flatene og sammenligne romfigurer.', numbers: 'Kube, kule, sylinder, prisme og pyramide' },
    { title: 'Romfigurer – resonnere', subtitle: 'Kjennetegn og påstander.', description: 'Finne en romfigur ut fra flere kjennetegn og forklare hvorfor én egenskap ikke alltid er nok.', numbers: 'Kube, kule, sylinder, prisme og pyramide' },
  ],
  'fra-3d-til-2d': [
    { title: 'Fra rom til plan – gjenkjenne', subtitle: 'Avtrykk og flater.', description: 'Finne den plane figuren en flate på en romfigur gir, og telle figurene i et enkelt nett.', numbers: 'Kube, eske, sylinder, prisme og pyramide' },
    { title: 'Fra rom til plan – sammenligne', subtitle: 'Nett og former.', description: 'Beskrive hvilke plane figurer nettet til en romfigur består av, og forklare hvorfor.', numbers: 'Kube, eske, sylinder, prisme og pyramide' },
    { title: 'Fra rom til plan – resonnere', subtitle: 'Lage og vurdere nett.', description: 'Forklare hvilke figurer et nett består av, og vurdere om et nett kan brettes til romfiguren.', numbers: 'Kube, eske, sylinder, prisme og pyramide' },
  ],
  vinkler: [
    { title: 'Vinkler – gjenkjenne', subtitle: 'Spiss, rett og stump.', description: 'Kjenne igjen og navngi spisse, rette og stumpe (butte) vinkler ut fra gradtall.', numbers: 'Vinkler fra 10° til 180°' },
    { title: 'Vinkler – sammenligne og regne', subtitle: 'Sortere og dele opp.', description: 'Sortere vinkler og finne den manglende delen av en rett vinkel eller en rett linje.', numbers: 'Vinkler fra 10° til 180°' },
    { title: 'Vinkler – resonnere', subtitle: 'Forklare og løse sammensatte oppgaver.', description: 'Begrunne en klassifisering, finne feil og løse vinkeloppgaver i flere steg.', numbers: 'Vinkler fra 10° til 360°' },
  ],
}

const GEOMETRY_FORMATS: Record<GeometryArea, string[]> = {
  'todimensjonale-figurer': ['Korte tekstoppgaver om sider, hjørner, egenskaper og symmetri, med en plan figur appen tegner (feltet figur) som teksten viser til'],
  'tredimensjonale-figurer': ['Korte tekstoppgaver om flater, kanter, hjørner og former på romfigurer'],
  'fra-3d-til-2d': ['Korte tekstoppgaver om avtrykk og nett, der nettet beskrives med ord'],
  vinkler: ['Korte tekstoppgaver om vinkeltyper, gradtall og vinkelberegninger, med en vinkel appen tegner (feltet figur) som teksten viser til'],
}

/** Øktprofil i Geometri. */
const geometryProfile = (
  area: GeometryArea,
  focus: string,
  { secondaryAreas, taskVariant }: { secondaryAreas?: GeometryArea[]; taskVariant?: 'mangekanter' | 'firkanter' | 'klassifisere' } = {},
): TaskProfile => ({
  focus,
  area,
  ...(secondaryAreas && { secondaryAreas }),
  ...(taskVariant && { taskVariant }),
  operations: area === 'vinkler' ? ['+', '-'] : [],
  formats: GEOMETRY_FORMATS[area],
  steps: 'Ett faglig steg på nivå 1. Nivå 2 kan ha sammenligning eller ett regnesteg, og nivå 3 kan be om forklaring eller begrunnelse.',
  avoid: [
    'Areal, omkrets og volum',
    'Henvisninger til figurer eller bilder som ikke vises («se figuren under»)',
    'Oppgaver der eleven skal tegne – elevvisningen har bare et tekstfelt',
    'Sider om flater på romfigurer, eller flater og kanter om plane figurer',
    'Andre regnearter eller tema enn geometri',
  ],
  figures: false,
  levels: Object.fromEntries(
    GEOMETRY_LEVELS[area].map((text, i) => {
      const level = (i + 1) as Level
      return [level, { ...text, support: GEOMETRY_SUPPORT[level] }]
    }),
  ) as Record<Level, LevelProfile>,
})

// ---------------------------------------------------------------------------------------
// Problemløsing: fire fagområder i fire økter over to uker – regnefortellinger og regneuttrykk (økt 1),
// bruke modeller (økt 2), flerstegsoppgaver (økt 3) og flervalgsoppgaver (økt 4). Nivåforskjellen
// handler om støtte og resonnement, ikke bare større tall. Tallområdet følger referansebanken.

const PROBLEM_SOLVING_SUPPORT: Record<Level, string> = {
  1: 'Kort tekst, ett steg eller synlige mellomsteg, ferdig modell eller tydelig tegneinstruksjon.',
  2: 'Eleven velger framgangsmåte selv: to steg uten synlig støtte og en enkel begrunnelse.',
  3: 'Vurdere andres løsninger, finne feil, forklare, eller løse problemer der svaret må tolkes ut fra situasjonen.',
}

const PROBLEM_SOLVING_LEVELS: Record<ProblemSolvingArea, [LevelText, LevelText, LevelText]> = {
  'regnefortelling-regneuttrykk': [
    { title: 'Fra fortelling til uttrykk', subtitle: 'Ett regnesteg.', description: 'Skrive regneuttrykket til en kort fortelling med ett steg og regne ut.', numbers: 'Hele tall opptil 100, ett regnesteg' },
    { title: 'Ett uttrykk for hele fortellingen', subtitle: 'To regnetegn.', description: 'Skrive ett regneuttrykk med to regnetegn som beskriver hele fortellingen.', numbers: 'Hele tall opptil 1000, to regnetegn i ett uttrykk' },
    { title: 'Vurdere uttrykk', subtitle: 'Finne feil og forklare.', description: 'Vurdere om et regneuttrykk passer til fortellingen, finne feilen og forklare.', numbers: 'Hele tall opptil 1000' },
  ],
  'bruke-modeller': [
    { title: 'Bruke en modell', subtitle: 'Ferdig modell eller tegneinstruksjon.', description: 'Lese en ferdig blokkmodell, eller tegne en tallinje eller like grupper etter en tydelig instruksjon.', numbers: 'Hele tall opptil 1000' },
    { title: 'Tegne en modell', subtitle: 'Blokkmodell og tabell.', description: 'Tegne en blokkmodell eller lage en tabell selv og bruke den til å løse problemet.', numbers: 'Hele tall opptil 1000' },
    { title: 'Tolke og vurdere modeller', subtitle: 'Forklare modellen.', description: 'Tolke en modell, vurdere om en modell er riktig og bruke modell til problemer med to ukjente.', numbers: 'Hele tall opptil 1000' },
  ],
  flerstegsoppgaver: [
    { title: 'To steg med støtte', subtitle: 'Stegene står i oppgaven.', description: 'Løse oppgaver med to regnesteg når stegene er synlige.', numbers: 'Hele tall opptil 100' },
    { title: 'To steg', subtitle: 'Finne stegene selv.', description: 'Finne stegene selv og vise hvert steg med et regnestykke.', numbers: 'Hele tall opptil 1000' },
    { title: 'Flere steg – tolke og vurdere', subtitle: 'Svaret må tolkes.', description: 'Tolke svaret ut fra situasjonen, f.eks. runde opp når alle skal være med, og finne steg som mangler.', numbers: 'Hele tall opptil 1000' },
  ],
  'flervalg-begrunnelse': [
    { title: 'Velge riktig svar', subtitle: 'Ett steg.', description: 'Løse et problem med ett steg og velge riktig svar eller regneuttrykk.', numbers: 'Hele tall opptil 100' },
    { title: 'Velge og begrunne', subtitle: 'To steg eller tolke fortellinger.', description: 'Løse et problem med to steg eller velge fortellingen som passer, og forklare valget.', numbers: 'Hele tall opptil 1000' },
    { title: 'Vurdere løsninger og påstander', subtitle: 'Forklare feilene.', description: 'Vurdere andres løsninger og påstander og forklare hva som er feil.', numbers: 'Hele tall opptil 1000' },
  ],
}

const PROBLEM_SOLVING_FORMATS: Record<ProblemSolvingArea, string[]> = {
  'regnefortelling-regneuttrykk': ['Korte tekstoppgaver der eleven skriver regneuttrykket og svaret, lager en fortelling til et uttrykk eller finner feilen i et uttrykk'],
  'bruke-modeller': ['Korte tekstoppgaver med en blokkmodell, tallinje, tabell eller like grupper – modellen står i teksten, eller eleven får en nøyaktig tegneinstruksjon'],
  flerstegsoppgaver: ['Tekstoppgaver med minst to regnesteg der fasiten viser hvert steg (nivå 1 med «Steg 1:» og «Steg 2:» i oppgaven)'],
  'flervalg-begrunnelse': ['Flervalgsoppgaver med alternativene på egne linjer («A) …», «B) …») og nøyaktig ett riktig alternativ, med mindre teksten sier at flere kan være riktige'],
}

const PROBLEM_SOLVING_AVOID: Record<ProblemSolvingArea, string> = {
  'regnefortelling-regneuttrykk': 'Regnearter som ikke passer handlingen i fortellingen',
  'bruke-modeller': 'Oppgaver som bare nevner ordet «modell», eller som viser til en figur eller modell som ikke står i teksten',
  flerstegsoppgaver: 'Oppgaver med bare ett regnesteg, manglende opplysninger eller et mellomsvar som endelig svar',
  'flervalg-begrunnelse': 'Tilfeldige gale svar, like alternativer og flere riktige alternativer uten at teksten sier det',
}

/** Øktprofil i Problemløsing. */
const problemSolvingProfile = (area: ProblemSolvingArea, focus: string): TaskProfile => ({
  focus,
  area,
  operations: ['+', '-', '*', '/'],
  formats: PROBLEM_SOLVING_FORMATS[area],
  steps: 'Nivå 1: ett steg eller synlige mellomsteg. Nivå 2: to steg uten synlig støtte. Nivå 3: vurdere, finne feil eller forklare.',
  avoid: [
    PROBLEM_SOLVING_AVOID[area],
    'Henvisninger til figurer eller bilder som ikke vises («se figuren under»)',
    'Desimaltall, brøk og negative tall',
    'Regnestykker uten situasjon (eleven skal selv finne regneuttrykket)',
  ],
  figures: false,
  levels: Object.fromEntries(
    PROBLEM_SOLVING_LEVELS[area].map((text, i) => {
      const level = (i + 1) as Level
      return [level, { ...text, support: PROBLEM_SOLVING_SUPPORT[level] }]
    }),
  ) as Record<Level, LevelProfile>,
})

// ---------------------------------------------------------------------------------------
// Tall og regning: fire fagområder i seks økter over tre uker – sammenhengen mellom addisjon og subtraksjon
// (økt 1), mellom multiplikasjon og divisjon (økt 2), desimaltall med tideler (økt 3–4) og desimaltall i
// lengdemåling (økt 5–6). Tallområdet følger referansebanken.

const NUMBERS_SUPPORT: Record<Level, string> = {
  1: 'Tydelig støtte og ett faglig steg: bruke et oppgitt regnestykke, skrive tideler eller gjøre om med hjelp.',
  2: 'Eleven bruker sammenhengen selv: ukjent tall, kontroll, sammenligning, omgjøring eller addisjon over én hel.',
  3: 'Vurdere en påstand, finne feil, forklare eller løse på to måter – ikke bare større tall.',
}

const NUMBERS_LEVELS: Record<NumbersAndOperationsArea, [LevelText, LevelText, LevelText]> = {
  'sammenheng-addisjon-subtraksjon': [
    { title: 'Pluss og minus hører sammen', subtitle: 'Bruke et pluss-stykke.', description: 'Bruke et kjent pluss-stykke til å finne et minus-stykke, og skrive tallfamilier.', numbers: 'Hele tall opptil 100' },
    { title: 'Ukjent ledd og kontroll', subtitle: 'Motsatt regneart.', description: 'Finne et ukjent tall med motsatt regneart og kontrollere et minus-stykke med pluss.', numbers: 'Hele tall opptil 1000' },
    { title: 'Forklare sammenhengen', subtitle: 'Vurdere og forklare.', description: 'Vurdere om noen har brukt riktig regneart, og forklare sammenhengen med helhet og deler.', numbers: 'Hele tall opptil 1000' },
  ],
  'sammenheng-multiplikasjon-divisjon': [
    { title: 'Gange og dele hører sammen', subtitle: 'Bruke et gangestykke.', description: 'Bruke et kjent gangestykke til å finne et delestykke.', numbers: 'Gangetabellen, svar opptil 100' },
    { title: 'Tiere og ukjent tall', subtitle: 'Bruke sammenhengen.', description: 'Bruke gangestykker med hele tiere og finne et ukjent tall i et delestykke.', numbers: 'Hele tall opptil 1000, delingen går opp' },
    { title: 'Vurdere og finne feil', subtitle: 'Påstander og forklaringer.', description: 'Vurdere påstander om regnefamilier og finne feil i bruken av et gangestykke.', numbers: 'Hele tall opptil 1000, delingen går opp' },
  ],
  'desimaltall-tideler': [
    { title: 'Tideler', subtitle: 'Skrive tideler.', description: 'Skrive tideler som desimaltall og finne tideler på tallinjen.', numbers: 'Desimaltall med én desimal fra 0,1 til 1' },
    { title: 'Regne og sammenligne', subtitle: 'Ti tideler er én hel.', description: 'Legge sammen tideler over én hel og sammenligne desimaltall.', numbers: 'Desimaltall med én desimal opptil 2' },
    { title: 'Forklare tideler', subtitle: 'Misoppfatninger.', description: 'Vurdere påstander om desimaltall og forklare med tideler.', numbers: 'Desimaltall med én desimal opptil 10' },
  ],
  'desimaltall-lengde': [
    { title: 'Lengder med desimaltall', subtitle: 'Meter, desimeter, centimeter.', description: 'Skrive en lengde med to enheter som desimaltall i én enhet.', numbers: 'Lengder med én desimal, m, dm, cm og mm' },
    { title: 'Gjøre om og sammenligne', subtitle: 'Samme enhet.', description: 'Gjøre om mellom enheter og sammenligne lengder i ulike enheter.', numbers: 'Lengder med én desimal, tall opptil 100' },
    { title: 'Vurdere og forklare', subtitle: 'To måter.', description: 'Vurdere omgjøringer, ordne lengder i ulike enheter og regne på to måter.', numbers: 'Lengder med én desimal' },
  ],
}

const NUMBERS_FORMATS: Record<NumbersAndOperationsArea, string[]> = {
  'sammenheng-addisjon-subtraksjon': ['Hoderegning (regnestykke) der instruksjonen viser til pluss-stykket', 'Korte tekstoppgaver med tallfamilie, ukjent ledd, kontroll eller forklaring'],
  'sammenheng-multiplikasjon-divisjon': ['Hoderegning (regnestykke) der instruksjonen viser til gangestykket', 'Korte tekstoppgaver med tiere, ukjent tall, påstander eller feilfinning'],
  'desimaltall-tideler': ['Korte tekstoppgaver med tideler: skrive, legge sammen, sammenligne, ordne og forklare'],
  'desimaltall-lengde': ['Korte tekstoppgaver med lengder i m, dm, cm og mm, med enhet i både oppgave og fasit'],
}

const NUMBERS_AVOID: Record<NumbersAndOperationsArea, string> = {
  'sammenheng-addisjon-subtraksjon': 'Rene pluss- eller minusstykker uten sammenheng mellom regneartene',
  'sammenheng-multiplikasjon-divisjon': 'Rene gangestykker eller delestykker uten sammenheng, og divisjon med rest',
  'desimaltall-tideler': 'Hundredeler, penger med øre og desimaltall med punktum',
  'desimaltall-lengde': 'Lengder som krever hundredeler (f.eks. 1,25 m) og svar uten enhet',
}

/** Øktprofil i Tall og regning. */
const numbersProfile = (area: NumbersAndOperationsArea, focus: string, { taskVariant }: { taskVariant?: 'tallinje' | 'skrive' } = {}): TaskProfile => ({
  focus,
  area,
  ...(taskVariant && { taskVariant }),
  operations: area === 'sammenheng-multiplikasjon-divisjon' ? ['*', '/'] : ['+', '-'],
  formats: NUMBERS_FORMATS[area],
  steps: 'Ett faglig steg på nivå 1. Nivå 2 kan ha to steg (f.eks. regne og kontrollere), og nivå 3 ber om forklaring eller begrunnelse.',
  avoid: [NUMBERS_AVOID[area], 'Negative tall', 'Henvisninger til figurer eller bilder som ikke vises («se figuren under»)', 'Andre tema enn økta'],
  figures: false,
  levels: Object.fromEntries(
    NUMBERS_LEVELS[area].map((text, i) => {
      const level = (i + 1) as Level
      return [level, { ...text, support: NUMBERS_SUPPORT[level] }]
    }),
  ) as Record<Level, LevelProfile>,
})

/** Hva måleøktene ikke skal ha, per fagområde (i tillegg til det felles). */
const MEASURE_AVOID: Record<MeasurementArea, string> = {
  'volum-liter-desiliter': 'Milliliter, centiliter og desimaltall (desimaltall hører til økta om desimaltall i måling)',
  'desimaltall-maling': 'Hundredeler (f.eks. 1,25 kg), desimaltall i dL eller g, og lengder (hører til Tall og regning)',
  'kilogram-gram': 'Tonn, milligram og vekter som ikke er rimelige for tingen som veies',
  'areal-omkrets': 'Areal i lengdeenheter, omkrets i kvadratenheter og omkrets av sammensatte figurer uten at det står hvordan delene ligger',
  tid: 'Tid regnet som om en time har 100 minutter, klokkeslett med punktum og urskiver som ikke vises',
}

/**
 * Måleøkt. Fagområdet styrer referansene og kontrollene på serveren; enhetene sier hva AI-en kan bruke.
 * Underpunktene i innholdsplanen er samlet i fem fagområder (se MEASUREMENT_AREAS i ai/contract.ts).
 */
const measureProfile = (
  area: MeasurementArea,
  focus: string,
  units: string[],
  operations: Operator[],
  levels: [LevelProfile, LevelProfile, LevelProfile],
  extra: Partial<TaskProfile> = {},
): TaskProfile => ({
  focus,
  area,
  operations,
  units,
  formats: ['Hoderegning', 'Tekstoppgave'],
  steps: 'Nivå 1: ett steg. Nivå 2: ett eller to steg. Nivå 3: to steg, vurdering eller forklaring. Høyst to korte spørsmål i samme oppgave.',
  avoid: [
    MEASURE_AVOID[area],
    'Svar uten enhet',
    'Rene gangestykker der måleenheten ikke betyr noe',
    'Kubeoppgaver som bare er gangestykker',
    'Henvisninger til figurer, klokker eller bilder som ikke vises («se figuren», «se på klokka»)',
  ],
  figures: false,
  levels: { 1: levels[0], 2: levels[1], 3: levels[2] },
  ...extra,
})

/**
 * Økt i Mønster og algoritmer. Fagområdet styrer referansene og kontrollene på serveren (se PATTERN_AREAS i
 * ai/contract.ts). Alle oppgavene er tekstoppgaver: mønstre og pseudokode står som tekst på egne linjer.
 */
const patternProfile = (area: PatternArea, focus: string, levels: [LevelProfile, LevelProfile, LevelProfile], extra: Partial<TaskProfile> = {}): TaskProfile => ({
  focus,
  area,
  operations: [],
  formats: ['Tekstoppgave'],
  steps: 'Nivå 1: ett steg med tydelig støtte. Nivå 2: finne regelen selv eller følge to kommandoer. Nivå 3: forklare, vurdere eller rette. Høyst to korte spørsmål i samme oppgave.',
  avoid: [
    'Regnestykker der utregningen under oppgaven avslører regelen eller programmet',
    'Negative tall, desimaltall, brøk og måleenheter',
    'Ekte programmeringsspråk (Scratch, Python) og kodeblokker – bare pseudokoden i kodeformatet',
    'Henvisninger til figurer eller kode som ikke står i teksten («se figuren», «koden under»)',
  ],
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
      {
        title: 'Uke 1 - todimensjonale figurer',
        sessions: [
          p(
            'Mangekanter – sider og hjørner',
            ['geo.2d'],
            geometryProfile('todimensjonale-figurer', 'Kjenne igjen og beskrive mangekanter: navn, sider og hjørner, sammenligne figurer og trekke slutninger fra egenskaper.', {
              taskVariant: 'mangekanter',
            }),
          ),
          // Tidligere «Omkrets av mangekanter»: omkrets er ikke med i Geometri (det hører til Måling). Samme ID og plass.
          p(
            'Firkanter – egenskaper og symmetri',
            ['geo.2d'],
            geometryProfile('todimensjonale-figurer', 'Egenskapene til kvadrat og rektangel (sider og rette vinkler), symmetrilinjer, og at et kvadrat også er et rektangel.', {
              taskVariant: 'firkanter',
            }),
          ),
        ],
      },
      {
        title: 'Uke 2 - tredimensjonale figurer',
        sessions: [
          p(
            'Kube, prisme, pyramide og sylinder',
            ['geo.3d'],
            geometryProfile('tredimensjonale-figurer', 'Kjenne igjen og beskrive romfigurer: kube, kule, sylinder, prisme og pyramide, med flater, kanter og hjørner.'),
          ),
          p(
            'Fra tredimensjonal til todimensjonal',
            ['geo.3d-til-2d'],
            geometryProfile('fra-3d-til-2d', 'Sammenhengen mellom romfigurer og plane figurer: avtrykk av flater, nett og hvilke figurer et nett består av.', {
              secondaryAreas: ['tredimensjonale-figurer'],
            }),
          ),
        ],
      },
      {
        title: 'Uke 3 - vinkler',
        sessions: [
          p(
            'Rette, spisse og butte vinkler',
            ['geo.vinkler'],
            geometryProfile('vinkler', 'Kjenne igjen, sammenligne og klassifisere vinkler: spiss (under 90°), rett (90°) og stump eller butt (mellom 90° og 180°).', {
              taskVariant: 'klassifisere',
            }),
          ),
          p(
            'Vinkler i trekanter',
            ['geo.vinkler'],
            geometryProfile('vinkler', 'Regne med vinkler: den manglende delen av en rett vinkel (90°) og en rett linje (180°), og vinkelsummen i en trekant (180°).'),
          ),
        ],
      },
    ],
    goals: [
      'Beskrive todimensjonale figurer ut fra sider og hjørner.',
      'Beskrive tredimensjonale figurer ut fra flater, kanter og hjørner.',
      'Se sammenhengen mellom en romfigur og utbrettingen av den.',
      'Kjenne igjen og sammenligne vinkler.',
    ],
    levels: [
      { title: 'Gjenkjenne og beskrive', subtitle: 'Figurer, sider, hjørner og flater.', description: 'Kjenne igjen figurer og telle sider, hjørner, kanter og flater.' },
      { title: 'Sammenligne og bruke egenskaper', subtitle: 'Symmetri, nett og vinkler.', description: 'Sammenligne og sortere figurer, bruke nett og regne enkelt med vinkler.' },
      { title: 'Resonnere og forklare', subtitle: 'Påstander og begrunnelser.', description: 'Vurdere påstander, undersøke nett og begrunne svaret.' },
    ],
  },
  {
    unitId: 'problemlosing',
    title: 'Problemløsing',
    topic: 'Problemløsing',
    area: 'Problemløsing',
    description: 'Elevene lager regneuttrykk til regnefortellinger, bruker modeller, løser oppgaver med flere steg og vurderer svaralternativer.',
    weeks: [
      {
        title: 'Uke 1 - fortellinger og modeller',
        sessions: [
          p(
            'Regnefortellinger og regneuttrykk',
            ['prob.regnefortellinger'],
            problemSolvingProfile('regnefortelling-regneuttrykk', 'Oversette mellom hverdagssituasjoner og regneuttrykk, begge veier: noe kommer til (+), noe tas bort eller sammenlignes (−), like grupper (·).'),
          ),
          p('Bruke modeller', ['prob.modeller'], problemSolvingProfile('bruke-modeller', 'Bruke, tegne og tolke blokkmodell, tallinje, tabell og like grupper for å løse problemer.')),
        ],
      },
      {
        title: 'Uke 2 - flere steg og valg',
        sessions: [
          p('Flerstegsoppgaver', ['prob.flersteg'], problemSolvingProfile('flerstegsoppgaver', 'Løse problemer som krever to eller flere regnesteg, med gradvis mindre støtte, og tolke svaret ut fra situasjonen.')),
          p('Flervalgsoppgaver', ['prob.flervalg'], problemSolvingProfile('flervalg-begrunnelse', 'Velge riktig svaralternativ, vurdere påstander og løsninger og begrunne valget.')),
        ],
      },
    ],
    goals: [
      'Oversette mellom regnefortellinger og regneuttrykk.',
      'Bruke modeller som blokkmodell, tallinje og tabell til å løse problemer.',
      'Løse oppgaver med flere steg, velge riktig svaralternativ og begrunne valget.',
    ],
    levels: [
      { title: 'Med støtte', subtitle: 'Ett steg eller synlige steg.', description: 'Bruke en ferdig modell eller følge stegene i oppgaven.' },
      { title: 'Velge selv', subtitle: 'To steg uten støtte.', description: 'Velge framgangsmåte og begrunne kort.' },
      { title: 'Vurdere og forklare', subtitle: 'Finne feil og tolke svaret.', description: 'Vurdere løsninger, finne feil og forklare.' },
    ],
  },
  {
    unitId: 'tall-og-regning',
    title: 'Tall og regning',
    topic: 'Tall og regning',
    area: 'Tall og algebra',
    description: 'Elevene bruker sammenhengen mellom regneartene, og blir kjent med desimaltall med tideler og i lengdemåling.',
    weeks: [
      {
        title: 'Uke 1 - sammenhenger',
        sessions: [
          p(
            'Sammenhengen mellom addisjon og subtraksjon',
            ['tr.add-sub'],
            numbersProfile('sammenheng-addisjon-subtraksjon', 'Tallfamilier, ukjent ledd og kontroll med motsatt regneart: 25 + 13 = 38, så er 38 − 13 = 25 og 38 − 25 = 13.'),
          ),
          p(
            'Sammenhengen mellom multiplikasjon og divisjon',
            ['tr.mult-div'],
            numbersProfile('sammenheng-multiplikasjon-divisjon', 'Bruke gangestykker til å dele, også med hele tiere (4 · 30 = 120, så 120 : 4 = 30), finne ukjente tall og kontrollere svar.'),
          ),
        ],
      },
      {
        title: 'Uke 2 - tideler',
        sessions: [
          p('Desimaltall med tideler', ['tr.tideler'], numbersProfile('desimaltall-tideler', 'Tideler som deler av en hel, desimaltall med én desimal, sammenligning og addisjon der ti tideler blir én hel.')),
          p('Tideler på tallinjen', ['tr.tideler'], numbersProfile('desimaltall-tideler', 'Tideler på tallinjen: finne, plassere og ordne desimaltall med én desimal mellom 0 og 2.', { taskVariant: 'tallinje' })),
        ],
      },
      {
        title: 'Uke 3 - desimaltall i måling',
        sessions: [
          p('Desimaltall i lengdemåling', ['tr.desimal-lengde'], numbersProfile('desimaltall-lengde', 'Gjøre om mellom meter, desimeter, centimeter og millimeter med én desimal: 1 m = 10 dm = 100 cm, 1 cm = 10 mm.')),
          p(
            'Måle og skrive lengder med desimaltall',
            ['tr.desimal-lengde'],
            numbersProfile('desimaltall-lengde', 'Skrive lengder med desimaltall og sammenligne og ordne lengder gitt i ulike enheter.', { taskVariant: 'skrive' }),
          ),
        ],
      },
    ],
    goals: ['Bruke sammenhengen mellom regneartene til å sjekke svar.', 'Forstå og skrive desimaltall med tideler.', 'Bruke desimaltall i lengdemåling.'],
    levels: [
      { title: 'Med støtte', subtitle: 'Ett faglig steg.', description: 'Bruke et kjent regnestykke, skrive tideler og gjøre om lengder.' },
      { title: 'Bruke sammenhengen', subtitle: 'Ukjent tall og sammenligning.', description: 'Finne ukjente tall, kontrollere og sammenligne.' },
      { title: 'Vurdere og forklare', subtitle: 'Påstander og feil.', description: 'Vurdere påstander, finne feil og forklare.' },
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
    description: 'Elevene måler volum i liter og desiliter, bruker desimaltall i liter og kilogram, gjør om mellom kilogram og gram, finner areal og omkrets og regner med tid.',
    // Hver økt hører til ett av de fem fagområdene i Måling (se measureProfile), så oppgavene og AI-en holder seg
    // til enhetene i overskriften. Økt-ID-ene, rekkefølgen og antallet er de samme som før; økt 3 handlet om lengde
    // (ikke i innholdsplanen – lengde med desimaltall hører til Tall og regning) og er nå desimaltall i måling.
    weeks: [
      {
        title: 'Uke 1 - volum og masse',
        sessions: [
          p(
            'Måle volum – liter og desiliter',
            ['mal.volum', 'mal.liter-dl'],
            measureProfile('volum-liter-desiliter', 'Volum: måle i liter og desiliter, og gjøre om mellom dem (1 L = 10 dL).', ['L', 'dL'], ['+', '-', '*', '/'], [
              { title: 'Liter og dl', subtitle: 'Hele liter og desiliter.', description: 'Legge sammen og trekke fra desiliter.', numbers: 'Desiliter opp til 10, hele liter opp til 3', units: ['L', 'dL'] },
              { title: 'Gjøre om', subtitle: 'Liter til dl og dl til liter.', description: 'Bruke at 1 liter er 10 dl.', numbers: 'Opp til 9 liter og 90 dl', units: ['L', 'dL'] },
              { title: 'Flere steg', subtitle: 'Liter og desiliter.', description: 'Gjøre om og regne i to steg med hele liter og desiliter.', numbers: 'Hele liter opp til 3 og desiliter opp til 30', units: ['L', 'dL'] },
            ]),
          ),
          p(
            'Kilogram og gram',
            ['mal.kg-g'],
            measureProfile('kilogram-gram', 'Masse: kilogram og gram, og gjøre om mellom dem (1 kg = 1000 g).', ['kg', 'g'], ['+', '*', '/'], [
              { title: 'Kilo til gram', subtitle: 'Hele kilo.', description: 'Bruke at 1 kg er 1000 g.', numbers: '1–9 kg', units: ['kg', 'g'] },
              { title: 'Regne med gram', subtitle: 'Hele hundre gram.', description: 'Legge sammen gram.', numbers: '100–900 g', units: ['g'] },
              { title: 'Sammenligne masse', subtitle: 'Kilo og gram.', description: 'Dele opp en kilo og sammenligne kilo og gram.', numbers: 'Opp til 8000 g og 8 kg', units: ['kg', 'g'] },
            ]),
          ),
        ],
      },
      {
        title: 'Uke 2 - desimaltall og areal',
        sessions: [
          p(
            'Desimaltall i måling – liter og kilogram',
            ['mal.desimal'],
            measureProfile('desimaltall-maling', 'Desimaltall med én desimal i liter og kilogram: 0,1 L = 1 dL og 0,1 kg = 100 g.', ['L', 'dL', 'kg', 'g'], ['+', '-'], [
              { title: 'Tideler av liter og kilo', subtitle: '0,1 L = 1 dL og 0,1 kg = 100 g.', description: 'Skrive desiliter som tideler av en liter, og gjøre om tideler av en kilo til gram.', numbers: 'Én desimal: 0,1–0,9 L og 0,1–0,9 kg', units: ['L', 'dL', 'kg', 'g'] },
              { title: 'Gjøre om', subtitle: 'Liter til dl og kilo til gram.', description: 'Gjøre om liter og kilogram med én desimal til desiliter og gram.', numbers: 'Én desimal: opp til 3,9 L og 3,9 kg', units: ['L', 'dL', 'kg', 'g'] },
              { title: 'Sammenligne og forklare', subtitle: 'Samme enhet.', description: 'Sammenligne mengder i ulike enheter, vurdere omgjøringer og løse problemer i flere steg.', numbers: 'Én desimal: opp til 3,9 L og 0,9 kg', units: ['L', 'dL', 'kg', 'g'] },
            ]),
          ),
          p(
            'Måle areal',
            ['mal.areal'],
            measureProfile('areal-omkrets', 'Areal: telle ruter på 1 cm² og regne ut areal av rektangler som rader · ruter.', ['cm²', 'ruter'], ['*'], [
              { title: 'Telle ruter', subtitle: 'Små rektangler.', description: 'Telle ruter på 1 cm².', numbers: '2–5 rader med 3–8 ruter', units: ['cm²', 'ruter'] },
              { title: 'Rader og ruter', subtitle: 'Større rektangler.', description: 'Regne rader · ruter.', numbers: '2–9 rader med 3–8 ruter', units: ['cm²', 'ruter'] },
              { title: 'Areal av større figurer', subtitle: 'Rektangler og sammensatte figurer.', description: 'Finne arealet av større rektangler og figurer satt sammen av ruter.', numbers: '2–9 rader med 3–12 ruter', units: ['cm²', 'ruter'] },
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
            measureProfile('areal-omkrets', 'Areal og omkrets av rektangler og kvadrater: areal = lengde · bredde i cm², omkrets = summen av sidene i cm.', ['cm', 'cm²'], ['+', '*', '/'], [
              { title: 'Areal', subtitle: 'Rektangler.', description: 'Lengde · bredde.', numbers: 'Sider fra 2 til 9 cm', units: ['cm', 'cm²'] },
              { title: 'Areal og omkrets', subtitle: 'Rektangler.', description: 'Skille mellom areal og omkrets.', numbers: 'Sider fra 2 til 12 cm', units: ['cm', 'cm²'] },
              { title: 'Fra omkrets til areal', subtitle: 'Kvadrater.', description: 'Finne siden ut fra omkretsen.', numbers: 'Omkrets opp til 36 cm', units: ['cm', 'cm²'] },
            ]),
          ),
          p(
            'Tid – klokka og hvor lang tid',
            ['mal.tid'],
            measureProfile('tid', 'Tid: lese klokka, minutter, kvarter og timer (1 time = 60 minutter), og regne ut hvor lang tid noe tar. Klokkeslett skrives digitalt med kolon, f.eks. kl. 08:45.', ['minutter', 'kvarter', 'timer'], ['+', '-', '*'], [
              { title: 'Kvarter og halvtimer', subtitle: 'Hel, halv og kvart.', description: 'Lese klokka og regne med kvarter.', numbers: '1–4 kvarter', units: ['minutter', 'kvarter'] },
              { title: 'Hvor lang tid?', subtitle: 'Minutter.', description: 'Regne ut hvor lang tid noe varer.', numbers: 'Opp til 60 minutter', units: ['minutter'] },
              { title: 'Timer og minutter', subtitle: 'Timer.', description: 'Gjøre om mellom timer og minutter.', numbers: 'Opp til 6 timer', units: ['minutter', 'timer'] },
            ], { figures: true }),
          ),
        ],
      },
    ],
    goals: ['Måle volum og gjøre om mellom liter og desiliter.', 'Bruke desimaltall i liter og kilogram.', 'Gjøre om mellom kilogram og gram.', 'Finne og skille mellom areal og omkrets.', 'Lese klokka og regne med tid.'],
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
    // Fire økter og fem fagområder: økt 1 dekker utforske mønster (hovedområde) og figurtall (tilgrensende område),
    // de andre øktene ett fagområde hver. Økt-ID-ene, rekkefølgen og antallet er de samme som før.
    weeks: [
      {
        title: 'Uke 1 - mønster',
        sessions: [
          p(
            'Utforske mønster og figurtall',
            ['mon.utforske', 'mon.figurtall'],
            patternProfile(
              'utforske-monster',
              'Gjentakende mønstre med figurene ●, ■ og ▲ og med farger: finne gjentakelsen, fortsette mønsteret og finne figuren på en plass – og figurtall som vokser med like mange hver gang.',
              [
                { title: 'Fortsette mønsteret', subtitle: 'Korte gjentakelser.', description: 'Finne gjentakelsen, figuren på en plass og neste figur i et figurtall.', numbers: 'Gjentakelser med 2–3 figurer, plasser opp til 12, figur 4' },
                { title: 'Forutsi', subtitle: 'Plasser lenger ut.', description: 'Bruke lengden på gjentakelsen, telle figurer og finne regelen i et figurtall.', numbers: 'Gjentakelser med 3 figurer, plasser opp til 24, figur 6' },
                { title: 'Forklare', subtitle: 'Langt ut i mønsteret.', description: 'Forutsi langt ut i mønsteret og i figurtallet, og forklare uten å skrive alt.', numbers: 'Gjentakelser med 4 figurer, plasser opp til 60, figur 10' },
              ],
              { secondaryAreas: ['figurtall'] },
            ),
          ),
          p(
            'Mønster i tallfølger',
            ['mon.tallfolger'],
            patternProfile('tallfolger', 'Finne og beskrive regelen i en tallfølge, fortsette følgen og finne tall som mangler.', [
              { title: 'Fortsette tallfølgen', subtitle: 'Like store hopp.', description: 'Fortsette tallfølger og tallinjer som øker med like mye.', numbers: 'Tall opp til 100, hopp på 1–10' },
              { title: 'Finne regelen', subtitle: 'Opp og ned.', description: 'Finne regelen selv, også når følgen synker, og finne tall som mangler.', numbers: 'Tall opp til 200' },
              { title: 'Andre regler', subtitle: 'Gange og voksende hopp.', description: 'Følger der tallet dobles, ganges eller hoppene vokser, og forklare regelen.', numbers: 'Tall opp til 1000' },
            ]),
          ),
        ],
      },
      {
        title: 'Uke 2 - algoritmer',
        sessions: [
          p(
            'Koder med løkker',
            ['mon.lokker'],
            patternProfile('koder-lokker', 'Lese, fullføre, skrive og rette korte programmer med «gjenta» i norsk pseudokode (kodeformatet i økta).', [
              { title: 'Følge en løkke', subtitle: 'Én kommando.', description: 'Følge en løkke som gjentar én kommando.', numbers: 'Gjenta 2–5 ganger, tall opp til 30' },
              { title: 'To kommandoer', subtitle: 'Mer i løkka.', description: 'Følge en løkke med to kommandoer og skrive kortere med «gjenta».', numbers: 'Gjenta 2–4 ganger, tall opp til 50' },
              { title: 'Rette og lage', subtitle: 'Hver runde.', description: 'Skrive tallet etter hver runde, finne og rette feil og lage egne løkker.', numbers: 'Gjenta 3–6 ganger, tall opp til 100' },
            ]),
          ),
          p(
            'Koder med vilkår',
            ['mon.vilkar'],
            patternProfile('koder-vilkar', 'Lese, skrive og rette korte programmer med «hvis» og «ellers» i norsk pseudokode, også grensetilfeller og vilkår inne i en løkke.', [
              { title: 'Hvis og ellers', subtitle: 'Partall og oddetall.', description: 'Følge et vilkår og velge riktig gren.', numbers: 'Tall opp til 50' },
              { title: 'Grensetilfeller', subtitle: 'Større enn.', description: 'Følge vilkår med «større enn», også når tallet er lik grensen, og sortere tall.', numbers: 'Tall opp til 30' },
              { title: 'Vilkår i løkke', subtitle: 'Sjekkes hver runde.', description: 'Følge et vilkår inne i en løkke, finne og rette feil i vilkår.', numbers: 'Tall opp til 30, 4 runder' },
            ]),
          ),
        ],
      },
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
