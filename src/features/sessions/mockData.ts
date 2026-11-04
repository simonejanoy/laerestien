import type { Level, Operator, PlanItem, Session, Task, TaskType } from '../../types'

// Testdata frem til Firestore er på plass. Tekstene er hentet fra Figma.

export const standardPlan: PlanItem[] = [
  { title: 'Tavleundervisning', minutes: 30, description: 'introduksjon av dagens tema' },
  { title: 'Oppgaver', minutes: 20, description: 'elevene jobber med oppgaver på sitt nivå' },
  { title: 'Felles oppsummering', minutes: 10, description: 'felles gjennomgang og oppsummering av dagens tema' },
]

/** Standardinnhold for nye økter i temaet. */
export const sessionBase = {
  topicId: 'addisjon-og-subtraksjon',
  title: 'Addisjon',
  topic: 'Addisjon & subtraksjon',
  area: 'De fire regneartene',
  className: '4A',
  totalSessions: 8,
  plan: standardPlan,
}

export const sessions: Session[] = [
  {
    ...sessionBase,
    id: 'okt-1-2',
    numbers: [1, 2],
    year: 2026,
    week: 44,
    slots: [
      { day: 'Mandag', time: '08.30' },
      { day: 'Mandag', time: '09.30' },
    ],
    date: 'Mandag 26. oktober',
    time: '8.30 - 10.30',
    heading: 'Tiere, enere og smarte regnestrategier',
    description:
      'Elevene utforsker hvordan tall er bygget opp, og deler dem i enere, tiere og hundrere. De øver på å legge sammen tall uten tierovergang ved hjelp av konkreter, tegninger og tallinje.',
    levels: [
      { level: 1, title: 'Lage en hel tier', subtitle: 'Addisjon med tiervenner og konkreter.', description: 'Fylle opp en tier før jeg regner videre.', taskCount: 2, studentCount: 12 },
      { level: 2, title: 'Regne via en tier', subtitle: 'Addisjon med tallinje og oppdeling.', description: 'Dele opp tall for å passere en tier.', taskCount: 2, studentCount: 12 },
      { level: 3, title: 'Beholde summen', subtitle: 'Flytte mellom de to leddene.', description: 'Forklare hvorfor summen er den samme.', taskCount: 2, studentCount: 12 },
    ],
    goals: [
      'Løse tekstoppgaver med addisjon av tosifrede tall med tierovergang.',
      'Dele tall i tiere og enere og bruke dette til å finne svaret.',
      'Forklare løsningen og sjekke svaret med en annen strategi.',
    ],
  },
  {
    ...sessionBase,
    id: 'okt-3',
    numbers: [3],
    year: 2026,
    week: 44,
    slots: [{ day: 'Onsdag', time: '10.30' }],
    date: 'Onsdag 28. oktober',
    time: '10.30 - 11.30',
    heading: 'Addisjon med tierovergang – øve og bruke',
    description:
      'Elevene øver på å legge sammen tall med tierovergang og bruker strategier som å fylle opp en tier og dele opp tall. De forklarer hvordan de tenker, og undersøker om svaret er rimelig.',
    levels: [
      { level: 1, title: 'Tall opptil 100', subtitle: 'Hoderegning uten tierovergang.', description: 'Mestre å dele tall i tiere og enere.', taskCount: 2, studentCount: 12 },
      { level: 2, title: 'Tall opptil 1000', subtitle: 'Hoderegning uten tierovergang.', description: 'Mestre å dele tall i tiere og enere.', taskCount: 2, studentCount: 12 },
      { level: 3, title: 'Tall opptil 10 000', subtitle: 'Hoderegning uten tierovergang.', description: 'Mestre å dele tall i tiere og enere.', taskCount: 2, studentCount: 12 },
    ],
    goals: [
      'Legge sammen tosifrede tall med tierovergang.',
      'Bruke en strategi, som å dele tall med tierovergang.',
      'Forklare hvordan de fant svaret.',
    ],
  },
  {
    ...sessionBase,
    id: 'okt-4',
    numbers: [4],
    year: 2026,
    week: 44,
    slots: [{ day: 'Fredag', time: '09.30' }],
    date: 'Fredag 30. oktober',
    time: '9.30 - 10.30',
    heading: 'Subtraksjon – ta bort og finne forskjellen',
    description:
      'Elevene trekker fra ved å ta bort og ved å finne forskjellen mellom to tall. De bruker konkreter og tallinje, og sammenligner hvilke strategier som passer best.',
    levels: [
      { level: 1, title: 'Ta bort og telle', subtitle: 'Subtraksjon med konkreter og tegninger.', description: 'Trekke fra uten veksling.', taskCount: 2, studentCount: 12 },
      { level: 2, title: 'Finne forskjellen', subtitle: 'Subtraksjon med oppdeling og tallinje.', description: 'Finne forskjellen mellom to tall.', taskCount: 2, studentCount: 12 },
      { level: 3, title: 'Velge en smart strategi', subtitle: 'Sammenligne ulike måter å trekke fra.', description: 'Velge strategi ut fra tallene.', taskCount: 2, studentCount: 12 },
    ],
    goals: [
      'Løse enkle tekstoppgaver med addisjon av tosifrede tall.',
      'Velge en regnestrategi og vise løsningen med tall eller tegning.',
      'Forklare fremgangsmåten og vurdere om svaret er rimelig.',
    ],
  },
]

/** Økter som allerede er gjennomført eller hoppet over. */
export const initialProgress: Record<string, 'completed' | 'skipped'> = {
  'okt-1-2': 'completed',
}

const mentalMath = 'Regn ut. Del gjerne tallene i tiere og enere.'
const columnMath = 'Still opp og regn ut.'
const keepSum = 'Flytt fra det ene tallet til det andre, slik at det blir en hel tier.'

function task(
  id: string,
  level: Level,
  type: TaskType,
  a: number,
  operator: Operator,
  b: number,
  instruction = type === 'Oppstilling' ? columnMath : mentalMath,
): Task {
  return { id, level, type, instruction, a, operator, b }
}

const H = 'Hoderegning'
const O = 'Oppstilling'

/**
 * Oppgaver per økt, sortert fra lettere til vanskeligere innen hvert nivå.
 * Nivå 2 i økt 3 er fra Figma; resten er eksempler.
 */
export const initialTasks: Record<string, Task[]> = {
  'okt-1-2': [
    // Nivå 1 – lage en hel tier
    task('a1-1', 1, H, 7, '+', 3, 'Hvor mye mangler for å få en hel tier?'),
    task('a1-2', 1, H, 6, '+', 4),
    task('a1-3', 1, H, 28, '+', 2),
    task('a1-4', 1, H, 45, '+', 5),
    task('a1-5', 1, H, 36, '+', 7, 'Fyll opp til neste tier først, og regn videre.'),
    // Nivå 2 – regne via en tier
    task('a2-1', 2, H, 8, '+', 5),
    task('a2-2', 2, H, 27, '+', 6),
    task('a2-3', 2, H, 46, '+', 8),
    task('a2-4', 2, H, 58, '+', 17),
    task('a2-5', 2, H, 67, '+', 25),
    // Nivå 3 – beholde summen: flytt fra det ene leddet til det andre
    task('a3-1', 3, H, 19, '+', 6, keepSum),
    task('a3-2', 3, H, 29, '+', 46, keepSum),
    task('a3-3', 3, H, 38, '+', 57, keepSum),
    task('a3-4', 3, H, 98, '+', 67, keepSum),
    task('a3-5', 3, H, 199, '+', 145, keepSum),
  ],
  'okt-3': [
    // Nivå 1 – tall opptil 100
    task('t1-1', 1, H, 12, '+', 5),
    task('t1-2', 1, H, 23, '+', 14),
    task('t1-3', 1, H, 45, '+', 32),
    task('t1-4', 1, O, 36, '+', 21),
    task('t1-5', 1, H, 64, '+', 35),
    // Nivå 2 – fra Figma
    task('t2-1', 2, H, 47, '+', 38),
    task('t2-2', 2, O, 268, '+', 157, 'Still opp og regn ut. Husk å veksle.'),
    task('t2-3', 2, O, 648, '+', 126),
    task('t2-4', 2, H, 219, '+', 74),
    task('t2-5', 2, H, 145, '+', 37),
    task('t2-6', 2, O, 248, '+', 19),
    task('t2-7', 2, H, 356, '+', 28),
    task('t2-8', 2, O, 467, '+', 158),
    // Nivå 3 – tall opptil 10 000
    task('t3-1', 3, H, 2000, '+', 3000),
    task('t3-2', 3, H, 3200, '+', 1500),
    task('t3-3', 3, O, 2345, '+', 1432),
    task('t3-4', 3, O, 4508, '+', 2391),
    task('t3-5', 3, O, 6127, '+', 2864, 'Still opp og regn ut. Husk å veksle.'),
  ],
  'okt-4': [
    // Nivå 1 – ta bort og telle (uten veksling)
    task('s1-1', 1, H, 9, '-', 4, 'Ta bort og tell hvor mange som er igjen.'),
    task('s1-2', 1, H, 15, '-', 3),
    task('s1-3', 1, H, 28, '-', 5),
    task('s1-4', 1, H, 47, '-', 23),
    task('s1-5', 1, O, 86, '-', 54),
    // Nivå 2 – finne forskjellen
    task('s2-1', 2, H, 12, '-', 9, 'Hvor stor er forskjellen? Tell opp fra det minste tallet.'),
    task('s2-2', 2, H, 32, '-', 28),
    task('s2-3', 2, H, 50, '-', 46),
    task('s2-4', 2, H, 73, '-', 68),
    task('s2-5', 2, O, 91, '-', 57, 'Still opp og regn ut. Husk å veksle.'),
    // Nivå 3 – velge en smart strategi
    task('s3-1', 3, H, 100, '-', 98, 'Velg en smart måte å regne på.'),
    task('s3-2', 3, H, 502, '-', 497, 'Velg en smart måte å regne på.'),
    task('s3-3', 3, H, 834, '-', 299, 'Tips: trekk fra 300 og legg til 1.'),
    task('s3-4', 3, O, 1000, '-', 365, 'Still opp og regn ut. Husk å veksle.'),
    task('s3-5', 3, O, 4003, '-', 1786, 'Still opp og regn ut. Husk å veksle.'),
  ],
}
