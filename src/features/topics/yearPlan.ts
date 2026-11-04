import type { Level, Operator, PlanWeek, TaskType } from '../../types'

// Innholdet i årsplanen fra uke 45 og ut skoleåret: økttitler, mål, nivåer og
// oppgaver for hvert tema. Testdata frem til Firestore er på plass.
// Oppgavene lages av enkle regler, så hver økt får nye tall.

/** [type, tall 1, regneart, tall 2, instruksjon] */
export type TaskSpec = [TaskType, number, Operator, number, string]

export interface LevelSpec {
  title: string
  subtitle: string
  description: string
}

export interface TopicSpec {
  topicId: string
  /** Kortnavn i overskriften, f.eks. «Multiplikasjon». */
  title: string
  /** Navnet på lappen i kalenderen. */
  topic: string
  area: string
  description: string
  weeks: PlanWeek[]
  goals: string[]
  levels: [LevelSpec, LevelSpec, LevelSpec]
  /** Fem oppgaver på nivået for økt nummer `n` (0, 1, 2 …) i temaet. */
  tasks: (level: Level, n: number) => TaskSpec[]
}

const H = 'Hoderegning'
const O = 'Oppstilling'

/** Et tall mellom min og max som varierer med økt (n) og oppgave (i). */
const vary = (n: number, i: number, min: number, max: number) => min + ((n * 7 + i * 3 + n * i) % (max - min + 1))

const five = (make: (i: number) => TaskSpec) => [0, 1, 2, 3, 4].map(make)

function pick<T>(list: T[], i: number) {
  return list[i % list.length]
}

/** Gangestykker: `a` grupper med `factor` i hver. */
const times = (factors: number[], n: number, instruction: string, maxGroups = 10) =>
  five((i): TaskSpec => [H, vary(n, i, 2, maxGroups), '*', pick(factors, i + n), instruction])

/** Delestykker som alltid går opp. */
const divide = (divisors: number[], n: number, instruction: string, minQ = 2, maxQ = 10, type: TaskType = H) =>
  five((i): TaskSpec => {
    const d = pick(divisors, i + n)
    return [type, d * vary(n, i, minQ, maxQ), '/', d, instruction]
  })

/** Repetisjon: én oppgave fra hvert av temaene etter tur. */
const mix =
  (...specs: (() => TopicSpec)[]) =>
  (level: Level, n: number) =>
    five((i) => specs[i % specs.length]().tasks(level, n + i)[i])

const repetitionLevels: TopicSpec['levels'] = [
  { title: 'Grunnleggende', subtitle: 'Tall opptil 100.', description: 'Øve på det vi har lært.' },
  { title: 'Øve videre', subtitle: 'Større tall.', description: 'Velge en god strategi.' },
  { title: 'Utfordring', subtitle: 'Store tall og tekstoppgaver.', description: 'Forklare hvordan jeg tenker.' },
]

/** Økt 5–8 i Addisjon og subtraksjon (økt 1–4 ligger i uke 44). Titlene står i temaplanen. */
export const additionRest: Pick<TopicSpec, 'levels' | 'tasks' | 'description'> = {
  description:
    'Elevene trekker fra med veksling og velger om en oppgave handler om addisjon eller subtraksjon. De forklarer strategien sin og kontrollerer svaret.',
  levels: [
    { title: 'Ta bort og telle', subtitle: 'Subtraksjon med tall opptil 100.', description: 'Trekke fra med og uten veksling.' },
    { title: 'Veksle en tier', subtitle: 'Subtraksjon med veksling.', description: 'Veksle en tier til ti enere.' },
    { title: 'Velge regneart', subtitle: 'Tresifrede tall og tekstoppgaver.', description: 'Velge addisjon eller subtraksjon.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) return [H, vary(n, i, 30, 99), '-', vary(n, i, 2, 9), 'Regn ut. Tell bakover hvis du trenger det.']
      if (level === 2) return [i < 3 ? H : O, vary(n, i, 41, 92), '-', vary(n, i, 14, 39), 'Regn ut. Husk å veksle.']
      const a = vary(n, i, 210, 890)
      return i % 2 === 0
        ? [O, a, '+', vary(n, i, 105, 480), 'Still opp og regn ut.']
        : [O, a, '-', vary(n, i, 105, 199), 'Still opp og regn ut. Husk å veksle.']
    }),
}

const multiplication = (): TopicSpec => ({
  topicId: 'multiplikasjon',
  title: 'Multiplikasjon',
  topic: 'Multiplikasjon',
  area: 'De fire regneartene',
  description:
    'Elevene utforsker gange som like grupper og gjentatt addisjon. De øver på gangetabellen og bruker dobling og kjente fakta til å finne nye.',
  weeks: [
    { title: 'Uke 1 - gange som gjentatt addisjon', sessions: ['Like grupper og gjentatt addisjon', 'Gangetegnet og rekker med like mange'] },
    { title: 'Uke 2 - 2-, 5- og 10-gangen', sessions: ['Hopp-telling med 2, 5 og 10', '2-, 5- og 10-gangen – øve og bruke'] },
    { title: 'Uke 3 - 3-, 4- og 6-gangen', sessions: ['Dobling: fra 2-gangen til 4-gangen', '3- og 6-gangen – finne sammenhenger'] },
    { title: 'Uke 4 - gangetabellen i bruk', sessions: ['7-, 8- og 9-gangen med smarte strategier', 'Tekstoppgaver med gange'] },
  ],
  goals: [
    'Forstå multiplikasjon som like grupper og gjentatt addisjon.',
    'Kunne gangetabellen for 2, 3, 4, 5, 6 og 10.',
    'Bruke dobling og kjente fakta til å finne nye.',
    'Løse tekstoppgaver med multiplikasjon.',
  ],
  levels: [
    { title: 'Like grupper', subtitle: 'Gange med 2, 5 og 10.', description: 'Telle grupper med like mange.' },
    { title: 'Gangetabellen', subtitle: 'Gange med 3, 4 og 6.', description: 'Bruke dobling for å finne svaret.' },
    { title: 'Store gangestykker', subtitle: 'Gange med 7, 8, 9 og tosifrede tall.', description: 'Dele opp tall for å gange.' },
  ],
  tasks: (level, n) => {
    if (level === 1) return times([2, 5, 10], n, 'Regn ut. Tenk like grupper.')
    if (level === 2) return times([3, 4, 6], n, 'Regn ut. Doble hvis du kan.')
    return five((i): TaskSpec =>
      i < 3
        ? [H, vary(n, i, 3, 10), '*', pick([7, 8, 9], i + n), 'Regn ut.']
        : [O, vary(n, i, 12, 48), '*', vary(n, i, 2, 5), 'Still opp og regn ut.'],
    )
  },
})

const sharing = (): TopicSpec => ({
  topicId: 'deling',
  title: 'Deling',
  topic: 'Deling',
  area: 'De fire regneartene',
  description:
    'Elevene deler likt og lager grupper, og ser at deling er gange baklengs. De bruker gangetabellen til å finne svaret og løser tekstoppgaver.',
  weeks: [
    { title: 'Uke 1 - dele likt', sessions: ['Dele likt mellom flere', 'Hvor mange grupper blir det?'] },
    { title: 'Uke 2 - deling og gange henger sammen', sessions: ['Deling som omvendt gange', 'Dele med 2, 5 og 10'] },
    { title: 'Uke 3 - dele med 3, 4 og 6', sessions: ['Dele med 3 og 6', 'Dele med 4 – halvere to ganger'] },
    { title: 'Uke 4 - deling i hverdagen', sessions: ['Tekstoppgaver med deling', 'Dette mestrer jeg – gange og dele'] },
  ],
  goals: [
    'Forstå deling som å dele likt og å lage grupper.',
    'Bruke gangetabellen til å dele.',
    'Dele med 2, 3, 4, 5, 6 og 10.',
    'Løse tekstoppgaver med deling.',
  ],
  levels: [
    { title: 'Dele likt', subtitle: 'Dele med 2, 5 og 10.', description: 'Dele likt med konkreter.' },
    { title: 'Dele med tabellen', subtitle: 'Dele med 3, 4 og 6.', description: 'Bruke gangetabellen baklengs.' },
    { title: 'Dele større tall', subtitle: 'Dele med 7, 8 og 9.', description: 'Dele og sjekke svaret med gange.' },
  ],
  tasks: (level, n) => {
    if (level === 1) return divide([2, 5, 10], n, 'Del likt. Hvor mange får hver?')
    if (level === 2) return divide([3, 4, 6], n, 'Regn ut. Hvilket gangestykke hjelper deg?')
    return divide([7, 8, 9], n, 'Regn ut, og sjekk svaret med gange.')
  },
})

const autumnReview = (): TopicSpec => ({
  topicId: 'repetisjon-host',
  title: 'Repetisjon',
  topic: 'Repetisjon',
  area: 'Repetisjon',
  description: 'Elevene repeterer høstens tema og velger selv strategi og regneart. Økta avsluttes med en felles samtale om hva de mestrer.',
  weeks: [
    { title: 'Uke 1 - addisjon og subtraksjon', sessions: ['Repetisjon: addisjon med tierovergang', 'Repetisjon: subtraksjon med veksling'] },
    { title: 'Uke 2 - gange og dele', sessions: ['Repetisjon: gangetabellen', 'Repetisjon: deling'] },
    { title: 'Uke 3 - alt sammen', sessions: ['Velg riktig regneart', 'Dette mestrer jeg – høsten oppsummert'] },
  ],
  goals: [
    'Bruke strategier for addisjon og subtraksjon.',
    'Huske gangetabellen og bruke den til å dele.',
    'Velge regneart i tekstoppgaver.',
  ],
  levels: repetitionLevels,
  tasks: (level, n) =>
    five((i) => {
      const from = [additionRest.tasks, multiplication().tasks, sharing().tasks]
      return pick(from, i + n)(level, n + i)[i]
    }),
})

const division = (): TopicSpec => ({
  topicId: 'divisjon',
  title: 'Divisjon',
  topic: 'Divisjon',
  area: 'De fire regneartene',
  description:
    'Elevene deler tosifrede og tresifrede tall ved å dele tiere og enere hver for seg, halvere og hoppe på tallinjen. De sjekker svaret med gange.',
  weeks: [
    { title: 'Uke 1 - dele tosifrede tall', sessions: ['Dele tiere og enere hver for seg', 'Dele med tallinje og hopp'] },
    { title: 'Uke 2 - smarte strategier', sessions: ['Dele med 4 og 8 – halvere flere ganger', 'Dele store tall med oppstilling'] },
    { title: 'Uke 3 - divisjon i bruk', sessions: ['Tekstoppgaver med divisjon', 'Dette mestrer jeg – divisjon'] },
  ],
  goals: [
    'Dele tosifrede tall med ensifrede tall.',
    'Bruke gange til å kontrollere divisjon.',
    'Velge strategi: dele opp, halvere eller hoppe på tallinjen.',
  ],
  levels: [
    { title: 'Dele med tabellen', subtitle: 'Divisjon innenfor gangetabellen.', description: 'Bruke gangetabellen baklengs.' },
    { title: 'Tosifrede tall', subtitle: 'Dele tiere og enere hver for seg.', description: 'Dele f.eks. 48 : 4.' },
    { title: 'Tresifrede tall', subtitle: 'Divisjon med oppstilling.', description: 'Dele og sjekke med gange.' },
  ],
  tasks: (level, n) => {
    if (level === 1) return divide([3, 4, 5, 6, 7, 8, 9], n, 'Regn ut.')
    if (level === 2) return divide([2, 3, 4], n, 'Del tierne og enerne hver for seg.', 11, 24)
    return divide([3, 4, 5, 6, 7, 8], n, 'Still opp og regn ut.', 12, 60, O)
  },
})

const shapes = (): TopicSpec => ({
  topicId: 'figurer-og-vinkler',
  title: 'Geometri',
  topic: 'Figurer og vinkler',
  area: 'Geometri',
  description:
    'Elevene beskriver og sorterer mangekanter, kjenner igjen ulike vinkler og finner omkretsen av figurer ved å legge sammen eller gange sidene.',
  weeks: [
    { title: 'Uke 1 - mangekanter', sessions: ['Trekanter, firkanter og mangekanter', 'Sider og hjørner'] },
    { title: 'Uke 2 - vinkler', sessions: ['Rette, spisse og butte vinkler', 'Vinklene i en trekant'] },
    { title: 'Uke 3 - omkrets', sessions: ['Omkrets av mangekanter', 'Dette mestrer jeg – figurer og vinkler'] },
  ],
  goals: [
    'Beskrive og sortere mangekanter etter sider og hjørner.',
    'Kjenne igjen rette, spisse og butte vinkler.',
    'Finne omkretsen av mangekanter.',
  ],
  levels: [
    { title: 'Sider og hjørner', subtitle: 'Trekanter og firkanter.', description: 'Telle sider og hjørner.' },
    { title: 'Omkrets', subtitle: 'Kvadrater og sekskanter.', description: 'Regne ut omkretsen.' },
    { title: 'Vinkler', subtitle: 'Vinkelsummen i en trekant.', description: 'Bruke at vinklene er 180° til sammen.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) {
        const k = vary(n, i, 2, 9)
        return i % 2 === 0
          ? [H, k, '*', 3, `En trekant har 3 hjørner. Hvor mange hjørner har ${k} trekanter?`]
          : [H, k, '*', 4, `En firkant har 4 sider. Hvor mange sider har ${k} firkanter?`]
      }
      if (level === 2) {
        const s = vary(n, i, 3, 12)
        return i % 2 === 0
          ? [H, 4, '*', s, `Et kvadrat har sider på ${s} cm. Hva er omkretsen?`]
          : [H, 6, '*', s, `En sekskant har seks like lange sider på ${s} cm. Hva er omkretsen?`]
      }
      const two = 10 * vary(n, i, 9, 15)
      return [H, 180, '-', two, `Vinklene i en trekant er 180° til sammen. To av vinklene er ${two}° til sammen. Hvor stor er den tredje?`]
    }),
})

const solids = (): TopicSpec => ({
  topicId: 'romfigurer',
  title: 'Romfigurer',
  topic: 'Romfigurer',
  area: 'Geometri',
  description:
    'Elevene kjenner igjen romfigurer, finner areal ved å telle ruter i rader og kolonner, og finner volum ved å bygge med kuber lag for lag.',
  weeks: [
    { title: 'Uke 1 - romfigurer og areal', sessions: ['Kube, prisme og sylinder', 'Areal – rader og kolonner'] },
    { title: 'Uke 2 - volum', sessions: ['Volum – bygge med kuber', 'Dette mestrer jeg – areal og volum'] },
  ],
  goals: [
    'Kjenne igjen og beskrive romfigurer.',
    'Finne areal ved å regne rader · ruter.',
    'Finne volum ved å telle kuber i lag.',
  ],
  levels: [
    { title: 'Telle', subtitle: 'Sideflater og ruter.', description: 'Telle sideflater på romfigurer.' },
    { title: 'Areal', subtitle: 'Rader og kolonner.', description: 'Regne ut arealet av rektangler.' },
    { title: 'Volum', subtitle: 'Kuber i lag.', description: 'Regne ut volumet av en boks.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) {
        const k = vary(n, i, 2, 8)
        return [H, k, '*', 6, `En kube har 6 sideflater. Hvor mange sideflater har ${k} kuber til sammen?`]
      }
      if (level === 2) {
        const rows = vary(n, i, 2, 9)
        const cols = vary(n + 1, i, 3, 10)
        return [H, rows, '*', cols, `Et rektangel har ${rows} rader med ${cols} ruter i hver. Hvor mange ruter er det?`]
      }
      const layer = vary(n, i, 6, 20)
      const layers = vary(n + 2, i, 2, 5)
      return [H, layers, '*', layer, `Hvert lag i en boks har ${layer} kuber. Hvor mange kuber er det i ${layers} lag?`]
    }),
})

const fractions = (): TopicSpec => ({
  topicId: 'brok',
  title: 'Brøk',
  topic: 'Brøk',
  area: 'Tall og algebra',
  description:
    'Elevene deler en hel i like store deler, plasserer enkle brøker på tallinjen og finner en brøkdel av et antall ved å dele.',
  weeks: [
    { title: 'Uke 1 - deler av en hel', sessions: ['Halvdeler, tredjedeler og fjerdedeler', 'Brøk på tallinjen'] },
    { title: 'Uke 2 - brøkdel av en mengde', sessions: ['Finne en brøkdel av et antall', 'Dette mestrer jeg – brøk'] },
  ],
  goals: [
    'Forstå brøk som like store deler av en hel.',
    'Plassere enkle brøker på tallinjen.',
    'Finne en brøkdel av et antall.',
  ],
  levels: [
    { title: 'Halvparten', subtitle: 'Halvdeler og fjerdedeler.', description: 'Finne halvparten av et antall.' },
    { title: 'Brøkdel av en mengde', subtitle: 'Tredjedeler, fjerdedeler og femtedeler.', description: 'Dele et antall i like deler.' },
    { title: 'Større mengder', subtitle: 'Åttedeler og tideler.', description: 'Finne en brøkdel av store tall.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      const d = pick(level === 1 ? [2, 4] : level === 2 ? [3, 4, 5] : [5, 8, 10], i + n)
      const a = d * vary(n, i, level === 3 ? 5 : 2, level === 3 ? 20 : 10)
      return [H, a, '/', d, `Hva er 1/${d} av ${a}?`]
    }),
})

const winterReview = (): TopicSpec => ({
  topicId: 'repetisjon-vinter',
  title: 'Repetisjon',
  topic: 'Repetisjon',
  area: 'Repetisjon',
  description: 'Elevene repeterer divisjon, brøk og geometri fra vinteren. Økta avsluttes med en felles samtale om hva de mestrer.',
  weeks: [
    { title: 'Uke 1 - divisjon og brøk', sessions: ['Repetisjon: divisjon', 'Repetisjon: brøkdel av en mengde'] },
    { title: 'Uke 2 - geometri', sessions: ['Repetisjon: omkrets, areal og volum', 'Dette mestrer jeg – vinteren oppsummert'] },
  ],
  goals: ['Dele med og uten oppstilling.', 'Finne en brøkdel av et antall.', 'Regne ut omkrets, areal og volum.'],
  levels: repetitionLevels,
  tasks: mix(division, fractions, shapes, solids),
})

const time = (): TopicSpec => ({
  topicId: 'klokke-og-tid',
  title: 'Klokka',
  topic: 'Klokke og tid',
  area: 'Måling',
  description: 'Elevene leser analog og digital klokke, regner om mellom timer og minutter og finner ut hvor lang tid noe tar.',
  weeks: [
    { title: 'Uke 1 - lese klokka', sessions: ['Hel, halv og kvart', 'Analog og digital klokke'] },
    { title: 'Uke 2 - regne med tid', sessions: ['Hvor lang tid tar det?', 'Dette mestrer jeg – klokke og tid'] },
  ],
  goals: ['Lese analog og digital klokke.', 'Regne om mellom timer og minutter.', 'Finne hvor lang tid som har gått.'],
  levels: [
    { title: 'Minutter', subtitle: 'Kvarter og halvtimer.', description: 'Regne med kvarter og halvtimer.' },
    { title: 'Hvor lang tid?', subtitle: 'Tid mellom to klokkeslett.', description: 'Finne hvor mange minutter som har gått.' },
    { title: 'Timer og minutter', subtitle: 'Regne om timer til minutter.', description: 'Gange med 60.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) {
        const k = vary(n, i, 2, 4)
        return [H, k, '*', 15, `Et kvarter er 15 minutter. Hvor mange minutter er ${k} kvarter?`]
      }
      if (level === 2) {
        const start = 5 * vary(n, i, 1, 5)
        const end = start + 5 * vary(n + 3, i, 3, 6)
        const pad = (m: number) => String(m).padStart(2, '0')
        return [H, end, '-', start, `Filmen begynner kl. 18.${pad(start)} og slutter kl. 18.${pad(end)}. Hvor mange minutter varer den?`]
      }
      const hours = vary(n, i, 2, 6)
      return [H, hours, '*', 60, `En time er 60 minutter. Hvor mange minutter er ${hours} timer?`]
    }),
})

const money = (): TopicSpec => ({
  topicId: 'penger-og-handel',
  title: 'Penger',
  topic: 'Penger og handel',
  area: 'Måling',
  description: 'Elevene blir kjent med mynter og sedler, legger sammen priser og finner ut hvor mye de får igjen når de handler.',
  weeks: [
    { title: 'Uke 1 - mynter og sedler', sessions: ['Kroner, mynter og sedler', 'Betale med ulike mynter'] },
    { title: 'Uke 2 - handle og få igjen', sessions: ['Hvor mye får jeg igjen?', 'Dette mestrer jeg – i butikken'] },
  ],
  goals: ['Kjenne verdien av mynter og sedler.', 'Legge sammen priser.', 'Finne ut hvor mye man får igjen.'],
  levels: [
    { title: 'Legge sammen priser', subtitle: 'Priser under 100 kr.', description: 'Finne hva to varer koster til sammen.' },
    { title: 'Få igjen', subtitle: 'Betale med 100-lapp.', description: 'Finne vekslepenger.' },
    { title: 'Mange like varer', subtitle: 'Gange med priser.', description: 'Finne prisen for flere like varer.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) {
        const p = vary(n, i, 12, 45)
        const q = vary(n + 1, i, 10, 35)
        return [H, p, '+', q, `En is koster ${p} kr og en brus koster ${q} kr. Hva koster de til sammen?`]
      }
      if (level === 2) {
        const p = vary(n, i, 23, 89)
        return [H, 100, '-', p, `Du betaler med en 100-lapp for en vare som koster ${p} kr. Hvor mye får du igjen?`]
      }
      const p = vary(n, i, 12, 49)
      const k = vary(n + 2, i, 3, 8)
      return [H, k, '*', p, `Én bok koster ${p} kr. Hva koster ${k} bøker?`]
    }),
})

const statistics = (): TopicSpec => ({
  topicId: 'statistikk',
  title: 'Statistikk',
  topic: 'Statistikk',
  area: 'Statistikk',
  description: 'Elevene samler inn data med tellestreker, lager søylediagram og piktogram, og sammenligner det de finner.',
  weeks: [
    { title: 'Uke 1 - samle inn data', sessions: ['Tellestreker og tabeller', 'Lage en spørreundersøkelse'] },
    { title: 'Uke 2 - diagrammer', sessions: ['Søylediagram', 'Piktogram'] },
    { title: 'Uke 3 - lese og tolke', sessions: ['Sammenligne i diagrammer', 'Dette mestrer jeg – statistikk'] },
  ],
  goals: ['Samle inn data med tellestreker og tabeller.', 'Lage og lese søylediagram og piktogram.', 'Sammenligne og tolke data.'],
  levels: [
    { title: 'Telle og sortere', subtitle: 'Tellestreker og tabeller.', description: 'Finne hvor mange til sammen.' },
    { title: 'Søylediagram', subtitle: 'Lese av søyler.', description: 'Finne forskjellen mellom søyler.' },
    { title: 'Piktogram', subtitle: 'Én figur er flere svar.', description: 'Gange for å finne antallet.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      if (level === 1) {
        const a = vary(n, i, 4, 12)
        const b = vary(n + 1, i, 3, 11)
        return [H, a, '+', b, `${a} elever liker hund best og ${b} liker katt best. Hvor mange har svart?`]
      }
      if (level === 2) {
        const b = vary(n, i, 3, 9)
        const a = b + vary(n + 2, i, 2, 8)
        return [H, a, '-', b, `Søylen for fotball viser ${a} og søylen for håndball viser ${b}. Hvor mange flere liker fotball?`]
      }
      const f = pick([2, 5, 10], i + n)
      const k = vary(n, i, 3, 9)
      return [H, k, '*', f, `I et piktogram betyr hver figur ${f} elever. Hvor mange elever er ${k} figurer?`]
    }),
})

const patterns = (): TopicSpec => ({
  topicId: 'monstre-og-logikk',
  title: 'Mønstre',
  topic: 'Mønstre og logikk',
  area: 'Tall og algebra',
  description: 'Elevene beskriver og fortsetter figurmønstre og tallfølger, finner regelen og forklarer hvordan mønsteret fortsetter.',
  weeks: [
    { title: 'Uke 1 - mønstre med figurer', sessions: ['Gjentakende mønstre', 'Voksende figurmønstre'] },
    { title: 'Uke 2 - tallmønstre', sessions: ['Tallfølger som øker', 'Tallfølger som minker'] },
    { title: 'Uke 3 - logikk', sessions: ['Finne regelen', 'Dette mestrer jeg – mønstre og logikk'] },
  ],
  goals: ['Beskrive og fortsette gjentakende og voksende mønstre.', 'Finne regelen i en tallfølge.', 'Forklare hvordan et mønster fortsetter.'],
  levels: [
    { title: 'Fortsette mønsteret', subtitle: 'Tallfølger som øker.', description: 'Finne neste tall.' },
    { title: 'Hoppe i tabellen', subtitle: 'Mønstre i gangetabellen.', description: 'Finne et tall langt ut i følgen.' },
    { title: 'Minkende følger', subtitle: 'Tallfølger som minker.', description: 'Finne regelen og neste tall.' },
  ],
  tasks: (level, n) =>
    five((i): TaskSpec => {
      const d = vary(n, i, 2, 9)
      if (level === 1) {
        const s = vary(n + 1, i, 1, 20)
        const seq = [s, s + d, s + 2 * d, s + 3 * d]
        return [H, seq[3], '+', d, `Tallfølgen er ${seq.join(', ')}. Hva er neste tall?`]
      }
      if (level === 2) {
        const k = vary(n + 2, i, 6, 10)
        return [H, k, '*', d, `Tallfølgen er ${d}, ${2 * d}, ${3 * d} … Hva er tall nummer ${k}?`]
      }
      const s = vary(n, i, 60, 100)
      const seq = [s, s - d, s - 2 * d]
      return [H, seq[2], '-', d, `Tallfølgen er ${seq.join(', ')}. Hva er neste tall?`]
    }),
})

const springReview = (): TopicSpec => ({
  topicId: 'repetisjon-var',
  title: 'Repetisjon',
  topic: 'Repetisjon',
  area: 'Repetisjon',
  description: 'Elevene repeterer skoleårets tema og viser hva de har lært. Økta avsluttes med en felles samtale om hva de mestrer.',
  weeks: [
    { title: 'Uke 1 - måling og statistikk', sessions: ['Repetisjon: klokke og penger', 'Repetisjon: diagrammer'] },
    { title: 'Uke 2 - skoleåret oppsummert', sessions: ['Repetisjon: de fire regneartene', 'Dette mestrer jeg – skoleåret oppsummert'] },
  ],
  goals: ['Regne med tid og penger.', 'Lese og tolke diagrammer.', 'Velge regneart og strategi selv.'],
  levels: repetitionLevels,
  tasks: mix(time, money, statistics, multiplication, division),
})

/** Temaene i den rekkefølgen de kommer i årsplanen. */
export const yearPlan: TopicSpec[] = [
  multiplication(),
  sharing(),
  autumnReview(),
  division(),
  shapes(),
  solids(),
  fractions(),
  winterReview(),
  time(),
  money(),
  statistics(),
  patterns(),
  springReview(),
]
