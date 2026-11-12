import type { MasteryStatus, Pattern, Student, StudentStats, TopicInsight, TopicMastery } from '../../types/index.ts'

// Testdata for statistikken. Tallene for klassen og Emma er fra Figma;
// de andre elevene får utregnede eksempeltall.

export const months = ['Aug', 'Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun']

export const weekTopic = {
  name: 'Addisjon og subtraksjon',
  period: 'Man. 12. oktober - fre. 23. oktober',
  subtopics: [
    { name: 'Addisjon uten tierovergang', perLevel: [3, 9, 5] },
    { name: 'Addisjon med tierovergang', perLevel: [6, 5, 7] },
    { name: 'Subtraksjon uten tierovergang', perLevel: [4, 5, 9] },
    { name: 'Subtraksjon med tierovergang', perLevel: [5, 7, 6] },
    { name: 'Tekstoppgaver', perLevel: [4, 10, 4] },
  ],
}

export const classPatterns: Pattern[] = [
  {
    text: 'Flere løser regneoppgavene riktig, men strever når samme operasjon presenteres med tekst',
    compare: [
      { label: 'Tekstoppgaver', value: '10 av 22', caption: 'viser forståelse' },
      { label: 'Regneoppgaver', value: '17 av 22', caption: 'viser forståelse' },
    ],
    tip: 'Høytopplesing og forklaring av hva oppgaven spør om før de regner selv kan være lurt.',
  },
  {
    text: 'Mange gjør feil når de skal veksle i subtraksjon, særlig når tallet har null på enerplassen',
    compare: [
      { label: 'Uten veksling', value: '16 av 18', caption: 'riktig' },
      { label: 'Med veksling', value: '9 av 18', caption: 'riktig' },
    ],
    tip: 'Bruk tierstaver eller penger for å vise vekslingen før elevene stiller opp.',
  },
  {
    text: 'Elevene som tegner før de regner, får oftere riktig på første forsøk',
    compare: [
      { label: 'Med tegning', value: '82 %', caption: 'riktig første gang' },
      { label: 'Uten tegning', value: '61 %', caption: 'riktig første gang' },
    ],
    tip: 'Oppmuntre til å tegne en tallinje eller enkle streker på de vanskeligste oppgavene.',
  },
]


/** Elever som er klare for mer utfordring, og i hvilket tema. */
export const readyForChallenge = [
  { studentId: 'ada', topic: 'Tallforståelse' },
  { studentId: 'filip', topic: 'Multiplikasjon' },
  { studentId: 'leo', topic: 'Geometri' },
]

export const topicInsights: TopicInsight[] = [
  {
    topic: 'Regning',
    status: 'needsSupport',
    note: 'Tierovergang',
    tasks: [
      { expression: '23 + 14 =', category: 'Addisjon uten tierovergang', level: 1, attempted: 18, correct: 17 },
      { expression: '56 − 21 =', category: 'Subtraksjon uten tierovergang', level: 1, attempted: 18, correct: 16 },
      { expression: '47 + 38 =', category: 'Tierovergang', level: 2, attempted: 15, correct: 12 },
      { expression: '145 + 37 =', category: 'Tierovergang', level: 2, attempted: 14, correct: 10 },
      { expression: '82 − 47 =', category: 'Tierovergang i subtraksjon', level: 2, attempted: 12, correct: 5 },
      { expression: '268 + 157 =', category: 'Oppstilling', level: 3, attempted: 7, correct: 5 },
      { expression: 'Lise har 120 kr og kjøper …', category: 'Tekstoppgave', level: 3, attempted: 5, correct: 2 },
    ],
    struggles: [
      { expression: '82 − 47 =', text: '5 av 12 riktig · veksling i subtraksjon' },
      { expression: 'Lise har 120 kr …', text: '2 av 5 riktig · tolke tekst' },
    ],
    notTried: { level: 2, students: ['Sofie L.', 'Oskar A.', 'Isak J.'] },
    goingWell: 'Alle har gjort nivå 1-oppgavene, og nesten alle fikk dem riktig.',
  },
]

/** Temaene i Temaoversikt, i fast rekkefølge. */
export const classTopics = ['Tallforståelse', 'Regning', 'Geometri', 'Måling', 'Problemløsning', 'Mønstre']

/**
 * Raden i Temaoversikt for et tema, regnet ut fra det samme datagrunnlaget som detaljvisningen (topicInsights),
 * så de aldri sier noe forskjellig:
 * - uten besvarte oppgaver i temaet: «For lite grunnlag» og ingen fylte felt – ingen faglig vurdering
 * - ellers: statusen fra datagrunnlaget, og de åtte feltene viser andelen riktige svar i temaets oppgaver
 *   (riktige / besvarte, avrundet til nærmeste åttendedel)
 */
export function masteryOf(topic: string, insight: TopicInsight | undefined): TopicMastery {
  const attempted = insight?.tasks.reduce((n, t) => n + t.attempted, 0) ?? 0
  if (!insight || attempted === 0) return { topic, status: 'insufficient', filled: 0, note: 'Ingen oppgaver gjort ennå' }
  const correct = insight.tasks.reduce((n, t) => n + t.correct, 0)
  return { topic, status: insight.status, filled: Math.round((correct / attempted) * 8), note: insight.note }
}

export const classMastery: TopicMastery[] = classTopics.map((topic) => masteryOf(topic, topicInsights.find((t) => t.topic === topic)))

const emmaStats: StudentStats = {
  firstTry: 72,
  firstTryTrend: 5,
  strong: ['Tallforståelse', 'Geometri'],
  support: ['Problemløsning', 'Regning'],
  tasksDone: 34,
  tasksTotal: 40,
  tasksTrend: -3,
  progress: [2, 12, 20, 28, 35, 44, 52, 58, 66, 76, 88],
  mastery: [
    { topic: 'Tallforståelse', status: 'understanding', filled: 6, note: 'Klar for nivå 3' },
    { topic: 'Regning', status: 'needsSupport', filled: 6, note: 'Øv på tierovergang' },
    { topic: 'Geometri', status: 'understanding', filled: 4, note: 'Klar for nivå 3' },
    { topic: 'Måling', status: 'insufficient', filled: 2, note: '4 oppgaver til for å vurdere' },
    { topic: 'Problemløsning', status: 'needsSupport', filled: 4, note: 'Tolke tekstoppgaver' },
    { topic: 'Mønstre', status: 'insufficient', filled: 1, note: '6 oppgaver til for å vurdere' },
  ],
  pattern: {
    text: 'Emma regner riktig, men strever når oppgaven står som tekst.',
    compare: [
      { label: 'Tekstoppgaver', value: '3 av 9', caption: 'riktig' },
      { label: 'Regneoppgaver', value: '14 av 16', caption: 'riktig' },
    ],
    tip: 'Tips: Les oppgaven høyt sammen med Emma, og la henne fortelle hva den spør om før hun regner.',
  },
}

const topics = ['Tallforståelse', 'Regning', 'Geometri', 'Måling', 'Problemløsning', 'Mønstre']
const statuses: MasteryStatus[] = ['understanding', 'needsSupport', 'understanding', 'insufficient', 'needsSupport', 'insufficient']
const notes: Record<MasteryStatus, string> = {
  understanding: 'Klar for neste nivå',
  needsSupport: 'Øv mer på dette',
  insufficient: 'Trenger flere oppgaver',
}

/** Eksempeltall for elever uten egne testdata – samme elev gir alltid samme tall. */
function exampleStats(student: Student, index: number): StudentStats {
  const firstName = student.name.split(' ')[0]
  const shift = index % topics.length
  const mastery = topics.map((topic, i) => {
    const status = statuses[(i + shift) % statuses.length]
    const filled = status === 'insufficient' ? 1 + ((i + index) % 2) : 3 + ((i * 3 + index) % 5)
    return { topic, status, filled, note: notes[status] }
  })
  const strong = mastery.filter((m) => m.status === 'understanding').map((m) => m.topic)
  const support = mastery.filter((m) => m.status === 'needsSupport').map((m) => m.topic)
  const firstTry = 55 + ((index * 7) % 40)
  return {
    firstTry,
    firstTryTrend: ((index * 3) % 9) - 4,
    strong,
    support,
    tasksDone: 24 + ((index * 5) % 17),
    tasksTotal: 40,
    tasksTrend: ((index * 2) % 7) - 3,
    progress: months.map((_, m) => Math.min(100, Math.round(m * (5 + (index % 4)) + (index % 5)))),
    mastery,
    pattern: {
      text: `${firstName} får best resultat i ${strong[0]?.toLowerCase() ?? 'regning'}, og bruker lengst tid på ${support[0]?.toLowerCase() ?? 'tekstoppgaver'}.`,
      compare: [
        { label: strong[0] ?? 'Regning', value: `${12 + (index % 4)} av 16`, caption: 'riktig' },
        { label: support[0] ?? 'Tekst', value: `${5 + (index % 4)} av 12`, caption: 'riktig' },
      ],
      tip: `Tips: Gi ${firstName} et par oppgaver ekstra i ${support[0]?.toLowerCase() ?? 'tekstoppgaver'} neste uke.`,
    },
  }
}

export function statsFor(student: Student, index: number): StudentStats {
  return student.id === 'emma' ? emmaStats : exampleStats(student, index)
}
