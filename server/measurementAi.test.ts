// Tester for referansebanken og AI-genereringen i Måling: banken, koblingen mellom øktene og de fem fagområdene,
// utvalget (også overlappet med Tall og regning og Geometri), kontrollene (L og dL, kg og g, desimaltall, areal og
// omkrets, tid, enheter og fasit), grunnoppgavene, utfyllingen, «Andre ønsker» og at andre temaer er uendret.
// Ingen ekte Gemini-kall, og ingen tester som avhenger av en bestemt formulering fra Gemini. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { AREA_TITLES, MEASUREMENT_AREAS, topicOfArea, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { toSessionTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { measurementProblem, unitEquationProblem } from './measurementChecks.ts'
import { numbersProblem } from './numbersAndOperationsChecks.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { geometryReferences } from './references/geometry.ts'
import { MEASUREMENT_REFERENCE_COUNT, measurementBankFile, measurementReferences } from './references/measurement.ts'
import { numbersAndOperationsReferences } from './references/numbersAndOperations.ts'
import { isAreaOrPerimeterReference, selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { MEASUREMENT_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(measurementBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

const sessions = planned('maling')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [VOLUME, MASS, DECIMAL, AREA, PERIMETER, TIME] = [1, 2, 3, 4, 5, 6].map((n) => `maling-${n}`)

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Måling', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(s, 5, 6), [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)], s.profile),
    profile: toAiProfile(s.profile!),
  }
}

/** Bestillingen slik serveren har den etter at referansene er valgt (for kontrollene direkte). */
function serverRequest(s: Planned, wishes = '') {
  const request = appRequest(s, wishes)
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
const math = (level: AiLevel, a: number, operator: '+' | '-' | '*' | '/', b: number, instruction: string): AiTaskDraft => ({
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction,
  a,
  operator,
  b,
  competenceGoal: '',
  adaptation: '',
})
/** Årsaken hele kandidatkontrollen gir (med referanser og oppgavesett), eller null når oppgaven godtas. */
const reason = (id: string, task: AiTaskDraft, wishes = '') => checkCandidates([task], serverRequest(session(id), wishes)).rejected[0]?.reason ?? null
/** Hele kandidatkontrollen uten oppgavesettet. */
function reasonAlone(s: Planned, task: AiTaskDraft) {
  const request = serverRequest(s)
  request.levels = request.levels!.map((l) => ({ ...l, existing: [] }))
  return checkCandidates([task], request).rejected[0]?.reason ?? null
}
const draftOf = (t: ReturnType<typeof buildTasks>[number]): AiTaskDraft =>
  t.kind === 'text' ? text(t.level, t.text, t.solution) : math(t.level, t.a, t.operator, t.b, t.instruction)

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit, kompetansemaal: '', tilpasning: 'Nivå i økta.' })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const generate = async (): Promise<GenerateResult> => {
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-ma', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('1. referansebanken for Måling', () => {
  it('inneholder 45 unike referanser, godkjent av valideringen, med feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(MEASUREMENT_REFERENCE_COUNT, 45)
    assert.equal(raw.referenceCount, 45)
    assert.equal(measurementReferences.length, 45)
    assert.equal(new Set(measurementReferences.map((r) => r.id)).size, 45)
    assert.equal(new Set(measurementReferences.map((r) => r.studentText)).size, 45)
    assert.deepEqual(validateReferenceBank(raw, 45, MEASUREMENT_BANK).errors, [])
    assert.deepEqual(measurementReferences, raw.references)
    for (const ref of measurementReferences) {
      assert.match(ref.id, /^MA[1-5]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'maling')
      assert.ok(ref.purpose && ref.format && ref.studentText && ref.solution && ref.workedSolution && ref.teacherNote, ref.id)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.equal(ref.source.document, 'maling_referanser.json')
    }
  })

  it('feltnavnene er tilpasset koden, og innholdet er uendret', () => {
    const ref = measurementReferences.find((r) => r.id === 'MA2-N3-02')!
    assert.equal(ref.area, 'desimaltall-maling')
    assert.equal(ref.areaTitle, 'Desimaltall i måling')
    assert.equal(ref.level, 3)
    assert.equal(ref.format, 'flersteg')
    assert.equal(ref.purpose, 'Eleven løser et volumproblem med desimaltall og flere steg.')
    assert.equal(ref.solution, '9 dL, som er 0,9 L.')
    assert.equal(ref.workedSolution, '1,5 L = 15 dL. 3 · 2 dL = 6 dL. 15 dL − 6 dL = 9 dL = 0,9 L.')
    assert.equal(ref.teacherNote, 'Eleven må gjøre om før de trekker fra.')
    assert.equal(ref.answerForm, 'forklaring')
    assert.equal(ref.representationHint, null)
    assert.equal(measurementReferences.find((r) => r.id === 'MA5-N2-01')!.representationHint, '08:45 ---15 min--- 09:00 ---20 min--- 09:20')
    assert.equal(measurementReferences.find((r) => r.id === 'MA3-N3-03')!.studentText.split('\n').length, 4)
  })

  it('ID-ene kolliderer ikke med de andre bankene, og ingen annen bank har prefikset MA', () => {
    assert.equal(new Set(referenceBanks.map((r) => r.id)).size, referenceBanks.length)
    assert.equal(referenceBanks.filter((r) => r.topic === 'maling').length, 45)
    assert.ok(!referenceBanks.some((r) => r.topic !== 'maling' && r.id.startsWith('MA')))
    // ID-ene er interne og avvises i synlige felt.
    assert.ok(containsInternalText('Se MA4-N2-01.'))
  })

  it('2. hvert av de fem områdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...MEASUREMENT_AREAS], ['volum-liter-desiliter', 'desimaltall-maling', 'kilogram-gram', 'areal-omkrets', 'tid'])
    assert.deepEqual([...new Set(measurementReferences.map((r) => r.area))], [...MEASUREMENT_AREAS])
    for (const area of MEASUREMENT_AREAS) {
      assert.equal(topicOfArea(area), 'maling')
      assert.ok(AREA_TITLES[area])
      for (const level of [1, 2, 3]) assert.equal(measurementReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 45 referansene består de faglige kontrollene for sitt område og nivå, også løsningsforslagene', () => {
    for (const ref of measurementReferences) {
      assert.equal(measurementProblem(text(ref.level, ref.studentText, ref.solution), { area: ref.area as never }), null, ref.id)
      assert.equal(unitEquationProblem(ref.workedSolution ?? '', ref.area === 'tid'), null, ref.id)
    }
  })

  it('valideringen finner en feil fasit, og enhetskontrollen en feil omgjøring i et løsningsforslag', () => {
    const broken = bankJson()
    broken.references = broken.references.map((r) => (r.id === 'MA1-N3-02' ? { ...r, solution: '4 bøtter. 12 : 3 = 5. Akvariet rommer 120 dL.' } : r))
    assert.ok(validateReferenceBank(broken, 45, MEASUREMENT_BANK).errors.some((e) => e.includes('MA1-N3-02')))
    assert.equal(unitEquationProblem('3 kg = 3000 g. 3000 g + 250 g = 3500 g.'), 'math')
    assert.equal(unitEquationProblem('1,5 L = 150 dL.'), 'conversion')
  })
})

describe('3. måleøktene og de fem fagområdene', () => {
  it('beholder seks økter med samme ID-er og rekkefølge, og kobler hver økt til ett fagområde', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.profile?.area]),
      [
        ['maling-1', 'Måle volum – liter og desiliter', 'volum-liter-desiliter'],
        ['maling-2', 'Kilogram og gram', 'kilogram-gram'],
        ['maling-3', 'Desimaltall i måling – liter og kilogram', 'desimaltall-maling'],
        ['maling-4', 'Måle areal', 'areal-omkrets'],
        ['maling-5', 'Areal og omkrets', 'areal-omkrets'],
        ['maling-6', 'Tid – klokka og hvor lang tid', 'tid'],
      ],
    )
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'maling')!.weeks.map((w) => w.sessions.length), [2, 2, 2])
  })

  it('velger bare referanser fra Måling, øktas fagområde og nivå', () => {
    for (const s of sessions) {
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'maling' && r.area === s.profile!.area && r.level === level && r.id.startsWith('MA')), `${s.id} nivå ${level}`)
        }
      }
    }
  })

  it('overlappet med Tall og regning og Geometri: Måling henter bare fra sin egen bank', () => {
    // Geometribanken har ingen referanser om areal eller omkrets – de hører til Måling.
    assert.equal(geometryReferences.filter(isAreaOrPerimeterReference).length, 0)
    for (const level of [1, 2, 3] as const) {
      assert.ok(selectReferences(referenceBanks, { area: 'areal-omkrets', level, seed: 4 }).every((r) => r.topic === 'maling'))
      assert.ok(selectReferences(referenceBanks, { area: 'desimaltall-maling', level, seed: 4 }).every((r) => r.topic === 'maling'))
      assert.ok(selectReferences(referenceBanks, { area: 'desimaltall-lengde', level, seed: 4 }).every((r) => r.topic === 'tall-og-regning'))
    }
  })

  it('serveren sender referansene fra området, med visuell støtte som tekst, og sporer tema og område', async () => {
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const body = JSON.stringify({ melding: '', oppgaver: [] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    await assert.rejects(handler(appRequest(session(TIME)), { uid: 'l', classId: '4A' }))
    assert.ok(prompt.includes('Hovedtema: Måling'))
    assert.ok(prompt.includes('Fagområde: Tid'))
    assert.ok(prompt.includes('1 time = 60 minutter (ikke 100)'))
    const ids = [...prompt.matchAll(/ID: (MA\d-N\d-\d{2})/g)].map((m) => m[1])
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id.startsWith('MA5-')), ids.join(','))
    const ref = toAiReference(measurementReferences.find((r) => r.id === 'MA5-N2-01')!)
    assert.equal(ref.representation, undefined)
    assert.equal(ref.support, '08:45 ---15 min--- 09:00 ---20 min--- 09:20')
  })

  it('profilen sender fagområde og enhetene i økta, og nivåene har egne beskrivelser', () => {
    assert.deepEqual(toAiProfile(session(VOLUME).profile!).units, ['L', 'dL'])
    assert.deepEqual(toAiProfile(session(DECIMAL).profile!).units, ['L', 'dL', 'kg', 'g'])
    assert.deepEqual(levelsFor(session(DECIMAL), 5, 6).map((l) => l.title), ['Tideler av liter og kilo', 'Gjøre om', 'Sammenligne og forklare'])
    const prompt = taskPrompt(serverRequest(session(VOLUME)))
    assert.ok(prompt.includes('Måleenheter på nivået: L, dL'))
    assert.ok(prompt.includes('rader · terninger i hver rad · antall lag'))
  })
})

describe('grunnoppgavene i Måling', () => {
  it('alle grunnoppgavene uten figur passer hele kontrollen i sin egen økt', () => {
    // Oppgaver med rutefigur eller klokke viser figuren i appen; AI-oppgaver kan ikke ha figur, så de kontrolleres ikke her.
    let checked = 0
    for (const s of sessions) {
      for (const t of [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]) {
        if (t.kind === 'text' && t.figure) continue
        checked++
        assert.equal(reasonAlone(s, draftOf(t)), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
      }
    }
    assert.ok(checked >= 80, String(checked))
  })

  it('ingen grunnoppgaver har milliliter, lengder, klokkeslett med punktum eller omgjøring mellom cm² og m²', () => {
    for (const s of sessions) {
      for (const t of [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]) {
        const all = t.kind === 'text' ? `${t.text} ${t.solution}` : t.instruction
        assert.ok(!/\bml\b|milliliter|\bmm\b|\bkm\b|\btonn\b|\bmg\b/.test(all), `${t.id}: ${all}`)
        assert.ok(!/\d{1,2}\.\d{2}/.test(all), `${t.id}: ${all}`)
        assert.ok(!(/(?<!c)m²/.test(all) && /cm²/.test(all)), `${t.id}: ${all}`)
      }
    }
    // Tidsøkta skriver klokkeslett med kolon, som resten av appen.
    assert.ok(buildTasks(session(TIME)).some((t) => t.kind !== 'text' && /kl\. 18:\d{2}/.test(t.instruction)))
  })

  it('repetisjonsøkta med undertema fra Måling har samme overskrift, undertema og antall oppgaver', () => {
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).filter((s) => s.spec.unitId !== 'maling' && s.skills.some((k) => k.startsWith('mal.')))
    assert.deepEqual(repetition.map((s) => [s.id, s.heading, s.skills]), [['repetisjon-var-2', 'Repetisjon: måling, areal og omkrets', ['mal.areal', 'mal.areal-omkrets', 'mal.tid']]])
    assert.equal(buildTasks(repetition[0]).length, 15)
  })
})

describe('4. referanser kopieres ikke – heller ikke fra Tall og regning', () => {
  it('ordrett eller nesten ordrett fra banken for Måling avvises', () => {
    const ref = measurementReferences.find((r) => r.id === 'MA2-N2-02')!
    assert.equal(reason(DECIMAL, text(2, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(DECIMAL, text(2, 'En pose mel veier 2,5 kg. Hvor mange gram er det?', '2500 g.')), 'copiedReference')
  })

  it('en nesten ordrett kopi av en referanse i Tall og regning avvises i økta om desimaltall i måling', () => {
    const ref = numbersAndOperationsReferences.find((r) => r.id === 'TR3-N2-02')!
    assert.equal(ref.studentText, 'Regn ut 0,6 + 0,7. Skriv svaret som desimaltall og forklar med tideler.')
    assert.equal(reason(DECIMAL, text(2, 'Regn ut 0,8 + 0,5. Skriv svaret som desimaltall og forklar med tideler.', '1,3. 8 tideler + 5 tideler = 13 tideler.')), 'copiedReference')
  })

  it('en ny oppgave med egen formulering godtas', () => {
    assert.equal(reason(DECIMAL, text(2, 'Ina heller 2,3 L vann i en balje. Hvor mange desiliter vann er det i baljen?', '23 dL. 2 L er 20 dL, og 0,3 L er 3 dL.')), null)
  })
})

describe('5. omgjøring mellom L og dL', () => {
  it('riktig omgjøring godtas', () => {
    assert.equal(reason(VOLUME, text(2, 'En bøtte rommer 7 L. Hvor mange desiliter er det?', '70 dL. 7 · 10 = 70.')), null)
    assert.equal(reason(VOLUME, text(3, 'En kanne rommer 2 L. Du heller ut 4 glass med 3 dL i hvert. Hvor mange dL er igjen?', '8 dL. 2 L = 20 dL. 4 · 3 dL = 12 dL. 20 dL − 12 dL = 8 dL.')), null)
  })

  it('feil omgjøring avvises – i svaret, i en regnerekke og i en setning', () => {
    assert.equal(reason(VOLUME, text(2, 'En bøtte rommer 7 L. Hvor mange desiliter er det?', '7 dL.')), 'wrongConversion')
    assert.equal(reason(VOLUME, text(2, 'En bøtte rommer 7 L. Hvor mange desiliter er det?', '70 L.')), 'wrongConversion')
    assert.equal(reason(VOLUME, text(3, 'En kanne rommer 2 L. Du heller ut 4 glass med 3 dL i hvert. Hvor mange dL er igjen?', '8 dL. 2 L = 200 dL. 4 · 3 dL = 12 dL.')), 'wrongConversion')
    assert.equal(reason(VOLUME, text(2, 'Du blander 3 dL saft og 7 dL vann. Hvor mye blir det? Svar i dL og i L.', '10 dL, som er 10 L.')), 'wrongConversion')
  })

  it('volum i terninger er rader · terninger i raden · lag, og alle målene må stå i teksten', () => {
    const box = 'Sara bygger en kasse av like terninger. Kassen er 3 lag høy, og i hvert lag ligger 2 rader med 4 terninger. Hvor mange terninger bruker hun?'
    assert.equal(reason(VOLUME, text(2, box, '24 terninger. 2 · 4 = 8. 3 · 8 = 24.')), null)
    assert.equal(reason(VOLUME, text(2, box, '8 terninger. 2 · 4 = 8.')), 'wrongSolution')
    assert.equal(reason(VOLUME, text(2, 'Sara bygger en kasse av like terninger. I bunnen ligger 2 rader med 4 terninger. Hvor mange terninger bruker hun?', '8 terninger.')), 'missingInfo')
  })

  it('sammenlignes volum i ulike enheter, må fasiten gjøre dem om til samme enhet', () => {
    const compare = 'Hvilken mugge rommer mest: en på 3 L eller en på 25 dL? Forklar.'
    assert.equal(reason(VOLUME, text(2, compare, 'Muggen på 3 L rommer mest. 3 L = 30 dL, og 30 dL er mer enn 25 dL.')), null)
    assert.equal(reason(VOLUME, text(2, compare, 'Muggen på 25 dL rommer mest, fordi 25 er mer enn 3.')), 'wrongSolution')
    assert.equal(reason(VOLUME, text(2, compare, 'Muggen på 3 L rommer mest.')), 'wrongConversion')
  })
})

describe('6. omgjøring mellom kg og g – også med blandede enheter', () => {
  it('riktig omgjøring godtas', () => {
    assert.equal(reason(MASS, text(3, 'Skriv 4 kg og 75 g i gram.', '4075 g. 4 kg = 4000 g. 4000 g + 75 g = 4075 g.')), null)
    assert.equal(reason(MASS, text(3, 'En sekk med jord veier 3 kg. Hvor mange gram er det?', '3000 g. 3 · 1000 g = 3000 g.')), null)
  })

  it('feil omgjøring og feil blandede enheter avvises', () => {
    assert.equal(reason(MASS, text(3, 'Skriv 4 kg og 75 g i gram.', '4750 g.')), 'wrongConversion')
    assert.equal(reason(MASS, text(3, 'Skriv 4 kg og 75 g i gram.', '475 g.')), 'wrongConversion')
    assert.equal(reason(MASS, text(3, 'Skriv 4 kg og 75 g i gram.', '4075 kg.')), 'wrongConversion')
    assert.equal(reason(MASS, text(3, 'En sekk med jord veier 3 kg. Hvor mange gram er det?', '300 g. 3 kg = 300 g.')), 'wrongConversion')
    assert.equal(reason(MASS, text(3, 'Lise har 2 kg mel. Hun bruker 350 g. Hvor mye mel har hun igjen?', '1650 g. 2 kg = 2000 g. 2000 g − 350 g = 1750 g.')), 'wrongSolution')
  })

  it('påstander om blandede enheter må ha riktig konklusjon', () => {
    const claim = 'Per regner ut at 3 kg og 40 g = 3400 g. Stemmer det? Forklar.'
    assert.equal(reason(MASS, text(3, claim, 'Nei. 3 kg og 40 g er 3040 g.')), null)
    assert.equal(reason(MASS, text(3, claim, 'Ja. Per har rett.')), 'wrongConclusion')
  })

  it('vekten må være rimelig for tingen som veies', () => {
    assert.equal(reason(MASS, text(3, 'Et eple veier 2 kg. En banan veier 150 g. Hvor mye veier de til sammen?', '2150 g.')), 'unreasonableValue')
    assert.equal(reason(MASS, text(3, 'Velg den rimelige vekten for en hund, og forklar: 20 g eller 20 kg?', 'En hund: 20 g. Hunder er små.')), 'unreasonableValue')
    assert.equal(reason(MASS, text(3, 'Velg den rimelige vekten for en hund, og forklar: 20 g eller 20 kg?', 'En hund: 20 kg. En hund er mye tyngre enn en pakke smør.')), null)
  })
})

describe('7. desimaltall med hundredeler eller feil plassert desimaltegn avvises', () => {
  it('hundredeler og flere desimaler', () => {
    assert.equal(reason(DECIMAL, text(2, 'En pose rosiner veier 1,25 kg. Hvor mange gram er det?', '1250 g.')), 'tooManyDecimals')
    assert.equal(reason(DECIMAL, text(2, 'Ina har 13 dL saft. Skriv mengden i liter.', '0,13 L.')), 'tooManyDecimals')
    // Desimaltall i dL og g er hundredeler av en liter og tusendeler av et kilo.
    assert.equal(reason(DECIMAL, text(2, 'Ina har 2,5 dL saft. Hvor mye er det i liter?', 'Det er en kvart liter.')), 'tooManyDecimals')
  })

  it('feil plassert desimaltegn: 1,3 L er ikke 0,13 L eller 130 dL, og 1,5 kg er ikke 150 g', () => {
    assert.equal(reason(DECIMAL, text(2, 'Ina har 13 dL saft. Skriv mengden i liter.', '1,3 L.')), null)
    assert.equal(reason(DECIMAL, text(2, 'Ina har 13 dL saft. Skriv mengden i liter.', '13 L.')), 'wrongConversion')
    const crate = 'Leo bærer en kasse epler på 1,5 kg. Skriv vekten av kassen i gram.'
    assert.equal(reason(DECIMAL, text(2, crate, '1500 g. 1 kg er 1000 g, og 0,5 kg er 500 g.')), null)
    assert.equal(reason(DECIMAL, text(2, crate, '150 g.')), 'wrongConversion')
    assert.equal(reason(DECIMAL, text(2, 'Gjør om 2,6 L til desiliter.', '2,6 dL.')), 'wrongConversion')
  })

  it('punktum i stedet for komma', () => {
    assert.equal(reason(DECIMAL, text(1, 'Ina heller 4 dL vann i en bøtte. Skriv mengden i liter som desimaltall.', '0.4 L.')), 'decimalFormat')
  })
})

describe('8 og 9. areal og omkrets', () => {
  it('areal i lengdeenhet og omkrets i kvadratenhet avvises', () => {
    const both = 'Et bord er 8 cm langt og 3 cm bredt på tegningen til Mia. Regn ut både areal og omkrets for bordplaten.'
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 24 cm². Omkrets: 22 cm.')), null)
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 24 cm. Omkrets: 22 cm.')), 'wrongAreaUnit')
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 24 cm². Omkrets: 22 cm².')), 'wrongAreaUnit')
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 24 cm2. Omkrets: 22 cm.')), 'wrongAreaUnit')
    assert.equal(reason(PERIMETER, text(2, 'En hage er 9 m lang og 4 m bred. Hvor mange meter gjerde trengs rundt hagen?', '26 m². 9 + 4 + 9 + 4 = 26.')), 'wrongAreaUnit')
  })

  it('feil areal eller omkrets av rektangel avvises', () => {
    const both = 'Et bord er 8 cm langt og 3 cm bredt på tegningen til Mia. Regn ut både areal og omkrets for bordplaten.'
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 22 cm². Omkrets: 24 cm.')), 'wrongSolution')
    assert.equal(reason(PERIMETER, text(2, both, 'Areal: 24 cm². Omkrets: 11 cm.')), 'wrongSolution')
    const square = 'Skolegården har form som et kvadrat med sider på 6 m. Hvor langt er det rundt skolegården? Svar med omkrets.'
    assert.equal(reason(PERIMETER, text(2, square, '36 m.')), 'wrongSolution')
    assert.equal(reason(PERIMETER, text(2, square, '24 m. 4 · 6 = 24.')), null)
  })

  it('påstanden om omkrets regnes ut – arealet er ikke omkretsen', () => {
    const claim = 'Kim sier at et rektangel som er 6 cm langt og 2 cm bredt, har omkretsen 12 cm. Har Kim rett? Forklar.'
    assert.equal(reason(PERIMETER, text(3, claim, 'Nei. 12 cm² er arealet. Omkretsen er 6 + 2 + 6 + 2 = 16 cm.')), null)
    assert.equal(reason(PERIMETER, text(3, claim, 'Ja. Omkretsen er 12 cm, fordi 6 · 2 = 12.')), 'wrongConclusion')
  })

  it('figurer som ikke vises, må være beskrevet med mål, og omkrets av sammensatte figurer krever at det står hvordan delene ligger', () => {
    assert.equal(reason(AREA, text(2, 'Se på rektangelet under. Hva er arealet?', '12 ruter.')), 'missingFigure')
    assert.equal(reason(PERIMETER, text(2, 'Et rektangel er tegnet på tavla. Hva er arealet?', 'Det kommer an på målene.')), 'missingInfo')
    assert.equal(
      reason(PERIMETER, text(3, 'En figur består av to rektangler. Det ene er 5 cm langt og 2 cm bredt. Det andre er 3 cm langt og 2 cm bredt. Hva er omkretsen? Forklar.', '20 cm.')),
      'missingInfo',
    )
    const bed = 'Et bed i hagen er satt sammen av to rektangler som ikke overlapper. Den ene delen er 5 m lang og 2 m bred, og den andre 3 m lang og 2 m bred. Hvor stort areal har hele bedet? Forklar.'
    assert.equal(reason(PERIMETER, text(3, bed, '16 m². 5 · 2 = 10 og 3 · 2 = 6. 10 + 6 = 16.')), null)
    assert.equal(reason(PERIMETER, text(3, bed, '14 m². Delene er 10 m² og 4 m².')), 'wrongSolution')
  })
})

describe('10. tid: en time har 60 minutter', () => {
  it('tidsintervaller over hel time regnet med 100 minutter per time avvises', () => {
    const bus = 'Elias begynner på leksene kl. 07:50 og er ferdig kl. 08:15. Hvor mange minutter bruker han?'
    assert.equal(reason(TIME, text(2, bus, '25 minutter. Fra 07:50 til 08:00 er 10 minutter, og fra 08:00 til 08:15 er 15 minutter.')), null)
    assert.equal(reason(TIME, text(2, bus, '65 minutter. 815 − 750 = 65.')), 'wrongTime')
    assert.equal(reason(TIME, text(2, 'Hvor mange minutter er 2 timer?', '200 minutter. 2 timer = 200 minutter.')), 'wrongTime')
    assert.equal(reason(TIME, text(2, 'Leken starter kl. 13:40 og varer i 35 minutter. Når er leken ferdig?', 'Kl. 13:75.')), 'wrongTime')
  })

  it('sluttid og starttid må stemme med varigheten', () => {
    const end = 'Leken starter kl. 13:40 og varer i 35 minutter. Når er leken ferdig?'
    assert.equal(reason(TIME, text(2, end, 'Kl. 14:15. 13:40 + 20 minutter = 14:00. 14:00 + 15 minutter = 14:15.')), null)
    assert.equal(reason(TIME, text(2, end, 'Kl. 14:25.')), 'wrongTime')
    assert.equal(reason(TIME, text(3, 'Du må gå kl. 07:35 for å rekke skolen. Du bruker 25 minutter. Når er du fremme? Forklar.', 'Kl. 08:00. 07:35 + 25 minutter = 08:10.')), 'wrongTime')
  })

  it('klokkeslett skrives med kolon og er entydige, og en klokke som ikke vises, beskrives med ord', () => {
    assert.equal(reason(TIME, text(2, 'Filmen starter kl. 18.15 og slutter kl. 19.00. Hvor lang er filmen?', '45 minutter.')), 'wrongTime')
    assert.equal(reason(TIME, text(1, 'Den lille viseren peker på 4, og den store peker på 12. Skriv klokkeslettet digitalt.', '16:00')), 'wrongTime')
    assert.equal(reason(TIME, text(1, 'Det er ettermiddag. Den lille viseren peker på 4, og den store peker på 12. Skriv klokkeslettet digitalt.', '16:00')), null)
    assert.equal(reason(TIME, text(1, 'Se på klokka. Hva er klokka?', '16:00')), 'missingFigure')
  })
})

describe('11. svar uten nødvendig enhet avvises', () => {
  it('svar uten enhet, og et svar som starter med et tall uten enhet', () => {
    assert.equal(reason(VOLUME, text(2, 'En bøtte rommer 5 L. Hvor mange desiliter er det?', '50')), 'missingUnit')
    assert.equal(reason(VOLUME, text(2, 'En bøtte rommer 5 L. Hvor mange desiliter er det?', '50. 5 · 10 = 50.')), 'missingUnit')
    assert.equal(reason(MASS, text(3, 'En pakke veier 600 g og en annen 300 g. Hvor mye veier de til sammen?', '900')), 'missingUnit')
    assert.equal(reason(PERIMETER, text(2, 'Et rektangel er 5 cm langt og 4 cm bredt. Hva er arealet?', '20')), 'missingUnit')
    assert.equal(reason(TIME, text(2, 'Hvor mange minutter er 3 kvarter?', '45')), 'missingUnit')
  })

  it('et antall med benevning (5 glass) er et fullstendig svar', () => {
    assert.equal(reason(VOLUME, text(3, 'En kanne rommer 2 L. Hvor mange glass på 4 dL kan du fylle?', '5 glass. 2 L = 20 dL, og 20 : 4 = 5.')), null)
  })

  it('et regnestykke må ha en måleenhet fra økta i instruksjonen', () => {
    assert.equal(reason(MASS, math(1, 4, '*', 1000, 'Regn ut.')), 'missingUnit')
    assert.equal(reason(MASS, math(1, 3, '*', 1000, 'Hvor mange gram er 3 kg?')), null)
  })
})

describe('felles kontroller: enheter, tallområde, nivå og fasit', () => {
  it('enheter som ikke hører til økta avvises', () => {
    assert.equal(reason(VOLUME, text(2, 'En flaske rommer 500 ml. Hvor mange dL er det?', '5 dL.')), 'foreignUnit')
    assert.equal(reason(MASS, text(3, 'En hval veier 3 tonn. Hvor mange kg er det?', '3000 kg.')), 'foreignUnit')
    assert.equal(reason(VOLUME, text(2, 'Et bord er 2 m langt. Hvor mange dL vann får plass på det?', '20 dL.')), 'foreignUnit')
    assert.equal(reason(TIME, text(2, 'Hvor mange sekunder er 2 minutter?', '120 sekunder.')), 'foreignUnit')
  })

  it('negative tall, tall utenfor tallområdet, desimaltall i feil område og synlig nøling avvises', () => {
    assert.equal(reason(MASS, text(3, 'En pakke veier 300 g. Du tar ut −100 g. Hvor mye veier den?', '400 g.')), 'offTopic')
    assert.equal(reason(VOLUME, text(1, 'Et basseng rommer 900 L. Hvor mange dL er det?', '9000 dL.')), 'outsideRange')
    assert.equal(reason(VOLUME, text(2, 'En flaske rommer 1,5 L. Hvor mange dL er det?', '15 dL.')), 'wrongArea')
    assert.equal(reason(DECIMAL, text(2, 'En pakke veier 3 kg. Hvor mange gram er det?', '3000 g.')), 'wrongArea')
    assert.equal(reason(MASS, text(3, 'En pakke veier 600 g og en annen 300 g. Hvor mye veier de til sammen?', '900 g. Hmm, vent, 600 + 300 = 900 g.')), 'unclearSolution')
  })

  it('fasiten kan ikke stå i oppgaveteksten, og nivå 1 har ikke vurdering av påstander', () => {
    assert.equal(reason(MASS, text(3, 'En pakke veier 600 g og en annen 300 g. Svaret er 900 g. Hvor mye veier de?', '900 g.')), 'revealedSolution')
    assert.equal(reason(VOLUME, text(1, 'Ali sier at 2 L er 20 dL. Har Ali rett?', 'Ja. 2 L = 20 dL.')), 'levelMismatch')
  })
})

describe('12. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(DECIMAL)
  const ok1 = (t: number) => story(1, `Ina heller ${t} dL vann i en bøtte. Skriv mengden i liter som desimaltall.`, `0,${t} L. ${t} dL er ${t} tideler av en liter.`)
  const ok2 = (a: number, b: number) => story(2, `I en balje er det ${a},${b} L vann. Hvor mange desiliter er det?`, `${10 * a + b} dL. ${a} L = ${10 * a} dL og 0,${b} L = ${b} dL.`)
  const ok3 = (b: number) =>
    story(3, `Mia veier rosiner på kjøkkenvekta. Vekta viser 0,${b} kg. Mia mener det er ${b} g. Stemmer det? Forklar.`, `Nei. 0,${b} kg er ${b * 100} g, fordi 0,1 kg er 100 g.`)

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(4),
        // Punktum.
        story(1, 'Ina heller 6 dL vann i en bøtte. Skriv mengden i liter som desimaltall.', '0.6 L.'),
        ok2(2, 7),
        // 0,13 L i stedet for 1,3 L.
        story(2, 'Ole har 13 dL melk. Hvor mange liter melk har han?', '0,13 L.'),
        ok3(4),
        ok3(6),
      ],
      [ok1(7), ok2(3, 2)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    // Oppgavene legges inn som AI-genererte og ikke gjennomgåtte.
    assert.ok(result.tasks.map((t, i) => toSessionTask(t, `ai-${i}`, result.meta)).every((t) => t.aiGenerated === true && t.reviewed === false))
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_decimalFormat, 1)
    assert.equal(final.removed_tooManyDecimals, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'maling')
    assert.equal(final.area, 'desimaltall-maling')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'Ina heller 5 dL vann i en bøtte. Skriv mengden i liter som desimaltall.', '5 L.')
    const { handler, calls } = scripted([[wrong, wrong, ok2(2, 7), ok2(3, 8), ok3(4), ok3(6)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('13. «Andre ønsker» kan ikke overstyre fagområde, nivå, enheter eller matematisk korrekthet', () => {
  const wishes = 'Bruk matlaging og oppskrifter. Gjerne milliliter, centiliter, hundredeler, lengder og påstander på nivå 1.'

  it('ønskene gir ikke andre enheter, hundredeler, et annet fagområde, et annet nivå eller feil fasit', () => {
    assert.equal(reason(VOLUME, text(2, 'En oppskrift trenger 300 ml melk. Hvor mange dL er det?', '3 dL.'), wishes), 'foreignUnit')
    assert.equal(reason(VOLUME, text(2, 'En oppskrift trenger 5 cl sirup. Hvor mange dL er det?', '0,5 dL.'), wishes), 'foreignUnit')
    assert.equal(reason(DECIMAL, text(2, 'En oppskrift trenger 1,25 kg mel. Hvor mange gram er det?', '1250 g.'), wishes), 'tooManyDecimals')
    assert.equal(reason(MASS, text(3, 'Kakeformen er 24 cm lang. Hvor mange gram mel trengs?', '500 g.'), wishes), 'foreignUnit')
    assert.equal(reason(VOLUME, text(1, 'Kokken sier at 3 L melk er 3 dL. Har kokken rett?', 'Nei. 3 L = 30 dL.'), wishes), 'levelMismatch')
    assert.equal(reason(VOLUME, text(2, 'En oppskrift trenger 4 L kraft. Hvor mange dL kraft trengs?', '4 dL.'), wishes), 'wrongConversion')
    assert.equal(reason(VOLUME, text(2, 'I oppskriften står det 1,5 L vann. Hvor mange dL er det?', '15 dL.'), wishes), 'wrongArea')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta', () => {
    assert.equal(reason(VOLUME, text(2, 'En oppskrift trenger 4 L kraft. Hvor mange dL kraft trengs?', '40 dL. 4 · 10 = 40.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(VOLUME), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('«bruk matlaging» ikke milliliter, centiliter eller hundredeler'))
    assert.ok(prompt.includes('måleenhetene i økta (L, dL)'))
  })
})

describe('14. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de seks andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(hash(file('problemlosing')), '380ddf92250336a8')
    assert.equal(referenceBanks.filter((r) => !['maling', 'monster-og-algoritmer', 'regning', 'strategier-i-divisjon'].includes(r.topic)).length, 54 + 45 + 36 + 36 + 36 + 36)
    for (const [area, level] of [['tabell-6-7-8-9', 2], ['desimaltall-lengde', 3], ['vinkler', 1]] as const) {
      const own = referenceBanks.filter((r) => !['maling', 'monster-og-algoritmer', 'regning', 'strategier-i-divisjon'].includes(r.topic))
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(own, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene og arbeidsarkene er uendret – i repetisjon bare oppgavene fra Måling', () => {
    // Mønster og algoritmer og repetisjonsøkter med undertema derfra er endret senere (se patternAi.test.ts).
    // Regning er endret senere (se arithmeticAi.test.ts); repetisjonsøktene med undertema derfra er uendret.
    // Strategier i divisjon og repetisjonsøkta med undertema derfra er endret samtidig (se divisionStrategiesAi.test.ts).
    const all = unitSpecs.filter((u) => !['maling', 'monster-og-algoritmer', 'regning', 'strategier-i-divisjon'].includes(u.unitId)).flatMap((u) => planned(u.unitId))
    const touched = (s: Planned) => s.skills.some((k) => k.startsWith('mal.') || k.startsWith('mon.') || k.startsWith('sdiv.'))
    // geometri-6 «Vinkler i trekanter» er endret senere: rene tekstoppgaver i stedet for regnestykker (se geometryAi.test.ts).
    const others = all.filter((s) => !touched(s) && s.id !== 'geometri-6').map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))
    // Verdiene er regnet ut fra koden før Mønster og algoritmer ble endret (git HEAD) og er de samme etterpå.
    assert.equal(others.length, 58)
    assert.equal(hash(JSON.stringify(others)), '921ec43842aeb44d')
    assert.equal(hash(JSON.stringify(Object.fromEntries(Object.entries(worksheetTasks).filter(([id]) => !id.startsWith('maling-') && !id.startsWith('monster-og-algoritmer-'))))), 'b573e51e205df96d')
  })

  it('kontrollene for Tall og regning er de samme: lengder kontrolleres som før, og liter hører ikke til lengdeøkta', () => {
    const length = { area: 'desimaltall-lengde' as const }
    assert.equal(numbersProblem(text(2, 'Gjør om 3,4 m til desimeter.', '34 dm'), length), null)
    assert.equal(numbersProblem(text(2, 'Gjør om 3,4 m til desimeter.', '3,4 dm'), length), 'wrongConversion')
    assert.equal(numbersProblem(text(2, 'Gjør om 2,4 liter til desiliter.', '24 dl'), length), 'offTopic')
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '10')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })
})
