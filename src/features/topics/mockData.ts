import type { Term, TopicDetails } from '../../types'
import { yearPlan } from './yearPlan'

// Årsplanen for 4. trinn, hentet fra Figma. Testdata frem til Firestore er på plass.

export const terms: Term[] = [
  {
    id: 'host',
    name: 'Høst',
    period: 'August - Desember',
    topics: [
      { id: 'tall-og-plassverdi', name: 'Tall og plassverdi', weeks: 3 },
      { id: 'addisjon-og-subtraksjon', name: 'Addisjon og subtraksjon', weeks: 4 },
      { id: 'multiplikasjon', name: 'Multiplikasjon og gangetabellen', weeks: 4 },
      { id: 'deling', name: 'Deling', weeks: 4 },
      { id: 'repetisjon-host', name: 'Repetisjon', weeks: 3 },
    ],
  },
  {
    id: 'vinter',
    name: 'Vinter',
    period: 'Januar - Mars',
    topics: [
      { id: 'divisjon', name: 'Divisjon og regnestrategier', weeks: 3 },
      { id: 'figurer-og-vinkler', name: 'Figurer og vinkler', weeks: 3 },
      { id: 'romfigurer', name: 'Romfigurer, areal og volum', weeks: 2 },
      { id: 'brok', name: 'Brøk', weeks: 2 },
      { id: 'repetisjon-vinter', name: 'Repetisjon', weeks: 2 },
    ],
  },
  {
    id: 'var',
    name: 'Vår',
    period: 'April - Juni',
    topics: [
      { id: 'klokke-og-tid', name: 'Klokke og tid', weeks: 2 },
      { id: 'penger-og-handel', name: 'Penger og handel', weeks: 2 },
      { id: 'statistikk', name: 'Statistikk og diagrammer', weeks: 3 },
      { id: 'monstre-og-logikk', name: 'Mønstre og logikk', weeks: 3 },
      { id: 'repetisjon-var', name: 'Repetisjon', weeks: 2 },
    ],
  },
]

export const topicDetails: TopicDetails[] = [
  {
    topicId: 'addisjon-og-subtraksjon',
    weeks: [
      {
        title: 'Uke 1 - tallforståelse og addisjon',
        sessions: ['Tiere, enere og smarte regnestrategier', 'Addisjon med tierovergang – forstå og utforske'],
      },
      {
        title: 'Uke 2 - addisjon og oppdage subtraksjon',
        sessions: ['Addisjon med tierovergang – øve og bruke', 'Subtraksjon – ta bort og finne forskjellen'],
      },
      {
        title: 'Uke 3 - subtraksjon med veksling',
        sessions: ['Veksle en tier – forstå og utforske', 'Subtraksjon med veksling – øve og bruke'],
      },
      {
        title: 'Uke 4 - strategi og viseforståelse',
        sessions: ['Addisjon eller subtraksjon?', 'Dette mestrer jeg – repetisjon og utforsking'],
      },
    ],
    goals: [
      'Bruke plassverdi og dele tall i enere, tiere og hundrere.',
      'Legge sammen og trekke fra tall, med og uten tierovergang og veksling.',
      'Velge og bruke hensiktsmessige regnestrategier.',
      'Løse tekstoppgaver og vurdere om addisjon eller subtraksjon passer.',
      'Forklare fremgangsmåten med ord, tegninger eller regneuttrykk.',
      'Bruke sammenhengen mellom addisjon og subtraksjon til å kontrollere svar.',
    ],
  },
  ...yearPlan.map(({ topicId, weeks, goals }) => ({ topicId, weeks, goals })),
]
