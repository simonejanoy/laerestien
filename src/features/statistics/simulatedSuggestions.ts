import type { Level, StudentStats, TextTask } from '../../types/index.ts'

// «Lag oppgaveforslag med AI» skal aldri stå tom i prototypen. Når eleven har for lite data (eller AI-en ikke svarer),
// vises realistiske eksempelforslag: hvilke temaer eleven bør øve mer på, et foreslått nivå og noen konkrete oppgaver.
// Elevens egne data brukes når de finnes; ellers simulerte data. Ingenting her lagres eller sendes noe sted – det er
// bare det dialogen viser, og påvirker ikke statistikk, framdrift eller resultater.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

export interface SuggestionPlan {
  /** true når forslagene bygger på simulerte data (eleven har for lite egne data). */
  simulated: boolean
  /** Temaene eleven bør øve mer på. */
  focus: string[]
  level: Level
  /** Kort begrunnelse til læreren. */
  reason: string
  tasks: TextTask[]
}

/** Det vi holder på med i høstsemesteret nå (uke 47) – brukes når eleven ikke har egne data. */
const SIMULATED_FOCUS = ['Multiplikasjon', 'Regning']

/** Minst så mange temaer med vurdering (ikke «For lite grunnlag») før elevens egne data brukes. */
const MIN_ASSESSED_TOPICS = 2

/** Om eleven har nok egne data til at forslagene kan bygge på dem. */
export function hasEnoughData(stats: StudentStats | null | undefined): stats is StudentStats {
  if (!stats) return false
  const assessed = stats.mastery.filter((m) => m.status !== 'insufficient').length
  return assessed >= MIN_ASSESSED_TOPICS && stats.support.length > 0
}

type Example = { text: string; solution: string }

/** Eksempeloppgaver per tema og nivå (4. trinn). Fasiten er regnet ut for hånd og sjekket i testene der det går. */
const examples: Record<string, Record<Level, Example[]>> = {
  Multiplikasjon: {
    1: [
      { text: 'Det er 3 poser med 5 epler i hver. Hvor mange epler er det til sammen? Skriv som gangestykke.', solution: '3 · 5 = 15 epler' },
      { text: 'Skriv som gangestykke, og regn ut.\n4 + 4 + 4 = ___', solution: '3 · 4 = 12' },
      { text: 'Regn ut.\n2 · 6 = ___', solution: '12' },
    ],
    2: [
      { text: 'En eske har 6 rader med 4 sjokolader i hver. Hvor mange sjokolader er det?', solution: '6 · 4 = 24 sjokolader' },
      { text: 'Du vet at 5 · 7 = 35. Hva blir 6 · 7? Forklar hvordan du tenker.', solution: '42. 6 · 7 er én sjuer mer enn 5 · 7: 35 + 7 = 42.' },
      { text: 'Regn ut.\n8 · 3 = ___', solution: '24' },
    ],
    3: [
      { text: 'Bruk dobling: Du vet at 4 · 8 = 32. Hva er 8 · 8?', solution: '64. 8 · 8 er det dobbelte av 4 · 8: 32 + 32 = 64.' },
      { text: 'Klassen kjøper 7 pakker med 9 blyanter. Hvor mange blyanter får de?', solution: '7 · 9 = 63 blyanter (for eksempel 7 · 10 − 7 = 63)' },
      { text: 'Regn ut.\n6 · 30 = ___', solution: '180 (6 · 3 = 18, og 18 tiere er 180)' },
    ],
  },
  Regning: {
    1: [
      { text: 'Regn ut. Fyll først opp til nærmeste tier.\n38 + 5 = ___', solution: '43 (38 + 2 = 40, 40 + 3 = 43)' },
      { text: 'Ida har 25 kroner og får 10 kroner til. Hvor mange kroner har hun nå?', solution: '35 kroner' },
      { text: 'Regn ut.\n47 − 5 = ___', solution: '42' },
    ],
    2: [
      { text: 'Regn ut.\n63 − 28 = ___', solution: '35' },
      { text: 'Ola har 85 kroner. Han kjøper en bok til 47 kroner. Hvor mye har han igjen?', solution: '85 − 47 = 38 kroner' },
      { text: 'Regn ut.\n146 + 38 = ___', solution: '184' },
    ],
    3: [
      { text: 'Still opp og regn ut.\n503 − 267 = ___', solution: '236' },
      { text: 'Skolen har 248 elever. 139 går ut på tur. Hvor mange er igjen på skolen?', solution: '248 − 139 = 109 elever' },
      { text: 'Regn ut på en smart måte.\n398 + 245 = ___', solution: '643 (400 + 245 = 645, 645 − 2 = 643)' },
    ],
  },
  Tallforståelse: {
    1: [
      { text: 'Hvor mange tiere og enere er det i 47?', solution: '4 tiere og 7 enere' },
      { text: 'Hvilket tall er størst, 59 eller 62?', solution: '62' },
      { text: 'Hvilket tall kommer rett etter 99?', solution: '100' },
    ],
    2: [
      { text: 'Del opp 352 i hundrere, tiere og enere.', solution: '300 + 50 + 2 (3 hundrere, 5 tiere og 2 enere)' },
      { text: 'Hva er 10 mer enn 296?', solution: '306' },
      { text: 'Skriv tallene i rekkefølge fra minst til størst: 412, 241, 421, 214', solution: '214, 241, 412, 421' },
    ],
    3: [
      { text: 'Hva er sifferet 6 verdt i tallet 3 618?', solution: '600 (6 hundrere)' },
      { text: 'Hva er 100 mindre enn 4 050?', solution: '3 950' },
      { text: 'Lag det største firesifrede tallet med sifrene 2, 7, 0 og 5.', solution: '7 520' },
    ],
  },
  Problemløsning: {
    1: [
      { text: 'Mia har 12 klinkekuler. Hun gir bort 4. Hvor mange har hun igjen?', solution: '12 − 4 = 8 klinkekuler' },
      { text: 'Det står 5 barn i kø. 3 barn til kommer. Hvor mange står i kø nå?', solution: '5 + 3 = 8 barn' },
      { text: 'Jonas har 10 kroner. En is koster 7 kroner. Hvor mye får han igjen?', solution: '10 − 7 = 3 kroner' },
    ],
    2: [
      { text: 'En buss har 48 seter. 29 er opptatt. Hvor mange seter er ledige?', solution: '48 − 29 = 19 seter' },
      { text: 'Sara leser 8 sider hver dag i 5 dager. Hvor mange sider leser hun?', solution: '5 · 8 = 40 sider' },
      { text: 'Lisa har 50 kroner. Hun kjøper to boller til 15 kroner hver. Hvor mye har hun igjen?', solution: '15 + 15 = 30, 50 − 30 = 20 kroner' },
    ],
    3: [
      { text: 'En billett koster 45 kroner. Hvor mye koster billetter til 4 personer?', solution: '4 · 45 = 180 kroner' },
      { text: '24 elever skal sitte ved bord med 4 elever på hvert bord. Hvor mange bord trengs?', solution: '24 : 4 = 6 bord' },
      { text: 'Ali har 120 kroner. Han kjøper 3 bøker til 35 kroner. Hvor mye har han igjen?', solution: '3 · 35 = 105, 120 − 105 = 15 kroner' },
    ],
  },
  Geometri: {
    1: [
      { text: 'Hvor mange hjørner har en trekant?', solution: '3' },
      { text: 'Hvor mange sider har et kvadrat?', solution: '4' },
      { text: 'Nevn en ting i klasserommet som har form som et rektangel.', solution: 'For eksempel en dør, et vindu eller en bok.' },
    ],
    2: [
      { text: 'Et rektangel er 6 cm langt og 3 cm bredt. Hva er omkretsen?', solution: '6 + 3 + 6 + 3 = 18 cm' },
      { text: 'Hvor mange flater har en terning?', solution: '6' },
      { text: 'Er vinkelen i hjørnet av et ark rett, spiss eller stump?', solution: 'Rett' },
    ],
    3: [
      { text: 'Et kvadrat har omkrets 20 cm. Hvor lang er hver side?', solution: '20 : 4 = 5 cm' },
      { text: 'Hvor mange kanter har en terning?', solution: '12' },
      { text: 'Et rektangel er 7 cm langt og 4 cm bredt. Hva er arealet?', solution: '7 · 4 = 28 cm²' },
    ],
  },
  Måling: {
    1: [
      { text: 'Hvor mange minutter er en halv time?', solution: '30 minutter' },
      { text: 'Hva er tyngst, 1 kg eller 500 g?', solution: '1 kg' },
      { text: 'Hvor mange centimeter er 1 meter?', solution: '100 cm' },
    ],
    2: [
      { text: 'Filmen starter 17:30 og varer i 1 time og 20 minutter. Når slutter den?', solution: '18:50' },
      { text: 'Hvor mange gram er 2 kg?', solution: '2000 g' },
      { text: 'En blyant er 14 cm. Hvor mange millimeter er det?', solution: '140 mm' },
    ],
    3: [
      { text: 'Hvor lang tid er det fra 08:45 til 11:20?', solution: '2 timer og 35 minutter' },
      { text: 'Sett inn <, > eller =.\n3 kg ___ 2900 g', solution: '3 kg > 2900 g' },
      { text: 'Tre pakker veier 750 g hver. Hvor mye veier de til sammen i kilogram og gram?', solution: '2250 g = 2 kg og 250 g' },
    ],
  },
  Mønstre: {
    1: [
      { text: 'Fortsett tallfølgen: 2, 4, 6, 8, ___, ___', solution: '10, 12' },
      { text: 'Fortsett tallfølgen: 5, 10, 15, ___, ___', solution: '20, 25' },
      { text: 'Fortsett tallfølgen: 20, 18, 16, ___, ___', solution: '14, 12' },
    ],
    2: [
      { text: 'Fortsett tallfølgen: 3, 7, 11, 15, ___, ___', solution: '19, 23 (pluss 4 hver gang)' },
      { text: 'Fortsett tallfølgen: 50, 45, 40, ___, ___', solution: '35, 30' },
      { text: 'Hva er regelen? 6, 12, 18, 24', solution: 'Pluss 6 hver gang (6-gangen)' },
    ],
    3: [
      { text: 'Finn regelen og neste tall: 3, 6, 12, 24, ___', solution: '48 (dobbelt så stort hver gang)' },
      { text: 'Finn regelen og neste tall: 1, 4, 9, 16, ___', solution: '25 (1 · 1, 2 · 2, 3 · 3, 4 · 4, 5 · 5)' },
      { text: 'Finn regelen og neste tall: 100, 90, 81, 73, ___', solution: '66 (minus 10, 9, 8 og så 7)' },
    ],
  },
}

/** Temaet i statistikken → eksempeloppgavene. Ukjente temaer får regneoppgaver. */
const examplesFor = (topic: string) => examples[topic] ?? examples.Regning

/** Foreslått nivå: nivået eleven står på, ett nivå ned når det går tungt, ett opp når det går svært godt. */
function suggestedLevel(level: Level, stats: StudentStats | null): Level {
  if (!stats) return level
  if (stats.firstTry < 60 && level > 1) return (level - 1) as Level
  if (stats.firstTry >= 85 && level < 3) return (level + 1) as Level
  return level
}

/**
 * Forslagene i dialogen «Oppgaveforslag fra AI». Med nok egne data: temaene eleven trenger støtte i og nivået ut fra
 * resultatene. Ellers: simulerte data ut fra det klassen holder på med nå (multiplikasjon i uke 47).
 */
export function suggestionPlan(student: { id: string; level: Level }, stats: StudentStats | null | undefined, count = 4): SuggestionPlan {
  const enough = hasEnoughData(stats)
  const focus = enough ? stats.support.slice(0, 2) : SIMULATED_FOCUS
  const level = enough ? suggestedLevel(student.level, stats) : student.level
  const reason = enough
    ? `Bygger på resultatene: ${stats.firstTry} % riktig på første forsøk, og trenger støtte i ${focus.join(' og ').toLowerCase()}.`
    : 'Eleven har for lite data ennå. Forslagene er simulerte eksempler ut fra det klassen arbeider med nå (multiplikasjon, uke 47).'
  // Fordel oppgavene på temaene: annenhver fra hvert tema.
  const pools = focus.map((topic) => examplesFor(topic)[level])
  const picked: Example[] = []
  for (let i = 0; picked.length < count && i < 10; i++) {
    const pool = pools[i % pools.length]
    const example = pool[Math.floor(i / pools.length)]
    if (example) picked.push(example)
  }
  const tasks = picked.map(
    (e, i): TextTask => ({
      kind: 'text',
      id: `forslag-eksempel-${student.id}-${i + 1}`,
      level,
      text: e.text,
      solution: e.solution,
      competenceGoal: '',
      adaptation: `Øving i ${focus[i % focus.length].toLowerCase()} på nivå ${level}.`,
      aiGenerated: false,
      reviewed: false,
    }),
  )
  return { simulated: !enough, focus, level, reason, tasks }
}
