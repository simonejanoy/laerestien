// Tester for referansebanken og AI-genereringen i Strategier i divisjon: banken, koblingen mellom øktene og
// fagområdene, utvalget (også overlappet med Divisjon), kontrollene (oppdeling i hundrere, tiere og enere, halvering,
// divisjonstype, sammenhenger, divisjon med 10 og 100, del av en hel og en mengde, rest og fasit), utfyllingen,
// «Andre ønsker» og at andre temaer er uendret. Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { AREA_TITLES, DIVISION_STRATEGIES_AREAS, topicOfArea, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { toSessionTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import { divisionProblem } from './divisionChecks.ts'
import { strategiesProblem } from './divisionStrategiesChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { divisionReferences } from './references/division.ts'
import { DIVISION_STRATEGIES_REFERENCE_COUNT, divisionStrategiesBankFile, divisionStrategiesReferences } from './references/divisionStrategies.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { DIVISION_STRATEGIES_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(divisionStrategiesBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }
const original = () =>
  JSON.parse(readFileSync(new URL('./references/strategier_i_divisjon_referanser.json', import.meta.url), 'utf8')) as { references: ReferenceTask[] }

const sessions = planned('strategier-i-divisjon')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [PLACE, GOOD, RELATIONS, TENS, TYPES, PARTS] = [1, 2, 3, 4, 5, 6].map((n) => `strategier-i-divisjon-${n}`)

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Strategier i divisjon', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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

const text = (level: AiLevel, studentText: string, solution: string, adaptation = ''): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation })
const math = (level: AiLevel, a: number, b: number, instruction: string): AiTaskDraft => ({
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction,
  a,
  operator: '/',
  b,
  competenceGoal: '',
  adaptation: '',
})
/** Årsaken hele kandidatkontrollen gir (med referanser og oppgavesett), eller null når oppgaven godtas. */
const reason = (id: string, task: AiTaskDraft, wishes = '') => checkCandidates([task], serverRequest(session(id), wishes)).rejected[0]?.reason ?? null
/** Hele kandidatkontrollen uten oppgavesettet (og eventuelt uten referanser). */
function reasonAlone(s: Planned, task: AiTaskDraft, withReferences = true) {
  const request = serverRequest(s)
  request.levels = request.levels!.map((l) => ({ ...l, existing: [], ...(withReferences ? {} : { referenceTasks: [] }) }))
  return checkCandidates([task], request).rejected[0]?.reason ?? null
}
/** Fagkontrollene alene: uten oppgavesettet og uten referansene på nivået (kopikontrollen testes for seg i 4). */
const alone = (id: string, task: AiTaskDraft) => reasonAlone(session(id), task, false)
const draftOf = (t: ReturnType<typeof buildTasks>[number]): AiTaskDraft =>
  t.kind === 'text' ? text(t.level, t.text, t.solution) : math(t.level, t.a, t.b, t.instruction)

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit, kompetansemaal: '', tilpasning: 'Nivå i økta.' })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const generate = async (): Promise<GenerateResult> => {
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-sd', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('referansebanken for Strategier i divisjon', () => {
  it('1. inneholder 45 unike referanser, godkjent av valideringen, med alle feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(DIVISION_STRATEGIES_REFERENCE_COUNT, 45)
    assert.equal(raw.referenceCount, 45)
    assert.equal(divisionStrategiesReferences.length, 45)
    assert.equal(new Set(divisionStrategiesReferences.map((r) => r.id)).size, 45)
    assert.deepEqual(validateReferenceBank(raw, 45, DIVISION_STRATEGIES_BANK).errors, [])
    assert.deepEqual(divisionStrategiesReferences, raw.references)
    assert.deepEqual(original().references, raw.references)
    for (const ref of divisionStrategiesReferences) {
      assert.match(ref.id, /^SD[1-5]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'strategier-i-divisjon')
      for (const field of ['format', 'studentText', 'solution', 'purpose', 'workedSolution'] as const) assert.ok(ref[field]?.trim(), `${ref.id}: ${field}`)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.ok(ref.teacherNote?.trim(), ref.id)
    }
    const ref = divisionStrategiesReferences.find((r) => r.id === 'SD1-N2-02')!
    assert.equal(ref.studentText, 'Regn ut 52 : 4. 5 tiere kan ikke deles likt på 4. Del 52 i 40 og 12 og regn ut.')
    assert.equal(ref.solution, '40 : 4 = 10 og 12 : 4 = 3. 52 : 4 = 13.')
    assert.equal(ref.teacherNote, 'Dette er kjernen i veksling ved deling.')
    assert.equal(divisionStrategiesReferences.find((r) => r.id === 'SD5-N2-03')!.representationHint, '[ 4 m ][ 4 m ][ 4 m ][ 4 m ][ 4 m ] = 20 m')
    // Divisjonstypen er beholdt: delingsdivisjon → «deling», målingsdivisjon → «maling», begge → «begge».
    const types = Object.fromEntries(divisionStrategiesReferences.filter((r) => r.divisionType).map((r) => [r.id, r.divisionType]))
    assert.deepEqual(types, {
      'SD1-N1-03': 'deling',
      'SD1-N2-03': 'deling',
      'SD2-N1-02': 'deling',
      'SD2-N1-03': 'maling',
      'SD2-N2-03': 'begge',
      'SD2-N3-03': 'begge',
      'SD4-N1-02': 'maling',
      'SD4-N1-03': 'maling',
      'SD4-N2-03': 'maling',
    })
    assert.equal(referenceBanks.filter((r) => r.topic === 'strategier-i-divisjon').length, 45)
  })

  it('ID-ene og områdene kolliderer ikke med de andre bankene – heller ikke med Divisjon', () => {
    const ids = referenceBanks.map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(!referenceBanks.some((r) => r.topic !== 'strategier-i-divisjon' && r.id.startsWith('SD')))
    // SD1-N1-01 tilsvarer D1-N1-01, men er en egen ID.
    assert.ok(divisionReferences.some((r) => r.id === 'D1-N1-01') && !divisionReferences.some((r) => r.id.startsWith('SD')))
    for (const area of DIVISION_STRATEGIES_AREAS) assert.equal(topicOfArea(area), 'strategier-i-divisjon')
    assert.equal(topicOfArea('delingsdivisjon-malingsdivisjon'), 'divisjon')
    assert.equal(AREA_TITLES['plassverdi-deling'], 'Dele i hundrere, tiere og enere')
    assert.ok(validateReferenceBank(bankJson(), 45, { ...DIVISION_STRATEGIES_BANK, idPrefix: 'D' }).errors.length > 0)
    assert.ok(containsInternalText('Lag en oppgave som SD3-N1-02.'))
  })

  it('2. hvert av de fem fagområdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...new Set(divisionStrategiesReferences.map((r) => r.area))], [...DIVISION_STRATEGIES_AREAS])
    for (const area of DIVISION_STRATEGIES_AREAS) {
      for (const level of [1, 2, 3]) assert.equal(divisionStrategiesReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 45 referansene består de faglige kontrollene for sitt område og nivå (fasit, løsningsforslag og divisjonstype)', () => {
    for (const ref of divisionStrategiesReferences) {
      const s = sessions.find((x) => x.profile?.area === ref.area && !x.profile.taskVariant)!
      assert.equal(reasonAlone(s, text(ref.level, ref.studentText, `${ref.solution} ${ref.workedSolution}`), false), null, `${ref.id}: ${ref.studentText}`)
      const task = text(ref.level, ref.studentText, `${ref.solution} ${ref.workedSolution}`)
      assert.equal(strategiesProblem(task, { area: ref.area as never, divisionType: ref.divisionType }), null, ref.id)
    }
  })

  it('valideringen fanger feil i banken (feil utregning og ugyldig divisjonstype)', () => {
    const broken = bankJson()
    broken.references.find((r) => r.id === 'SD1-N1-02')!.solution = '300 : 3 = 100, 60 : 3 = 20 og 9 : 3 = 3. 369 : 3 = 132.'
    broken.references.find((r) => r.id === 'SD2-N1-02')!.divisionType = 'deling-og-maling' as never
    const errors = validateReferenceBank(broken, 45, DIVISION_STRATEGIES_BANK).errors
    assert.ok(errors.some((e) => e.includes('SD1-N1-02')))
    assert.ok(errors.some((e) => e.includes('SD2-N1-02') && e.includes('divisjonstype')))
  })
})

describe('3. øktene i Strategier i divisjon og fagområdene', () => {
  it('beholder seks økter med samme ID-er, overskrifter og rekkefølge, og kobler hver økt til ett fagområde', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.skills.join(','), s.profile?.area, s.profile?.taskVariant ?? '']),
      [
        [PLACE, 'Dele tall i hundrere, tiere og enere', 'sdiv.hte', 'plassverdi-deling', ''],
        [GOOD, 'Dele tall på gode måter', 'sdiv.gode-mater', 'gode-delestrategier', ''],
        [RELATIONS, 'Sammenhenger i divisjon', 'sdiv.sammenhenger', 'sammenhenger-divisjon', ''],
        [TENS, 'Dividere med 10 og 100', 'sdiv.10-100', 'dividere-10-100', ''],
        [TYPES, 'Målingsdivisjon og delingsdivisjon', 'sdiv.malings-delings', 'gode-delestrategier', 'divisjonstyper'],
        [PARTS, 'Del av en hel og del av en mengde', 'sdiv.del-av-hel,sdiv.del-av-mengde', 'del-av-hel-mengde', ''],
      ],
    )
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'strategier-i-divisjon')!.weeks.map((w) => w.sessions.length), [2, 2, 2])
    assert.ok(sessions.every((s) => s.profile!.operations.join() === '/'))
  })

  it('velger bare referanser fra Strategier i divisjon, øktas fagområde og nivå', () => {
    for (const s of sessions) {
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'strategier-i-divisjon' && r.area === s.profile!.area && r.level === level && r.id.startsWith('SD')), `${s.id} nivå ${level}`)
        }
      }
    }
  })

  it('overlappet med Divisjon: Divisjon får bare sine egne referanser, og Strategier i divisjon bare sine', () => {
    for (const level of [1, 2, 3] as const) {
      for (const area of ['multiplikasjon-divisjon', 'delingsdivisjon-malingsdivisjon', 'divisjon-med-rest', 'modeller'] as const) {
        assert.ok(selectReferences(referenceBanks, { area, level, seed: 3 }).every((r) => r.topic === 'divisjon'))
      }
    }
    // Økta om målingsdivisjon og delingsdivisjon henter fra «Dele tall på gode måter», ikke fra Divisjon.
    assert.ok(selectReferences(referenceBanks, { area: session(TYPES).profile!.area!, level: 2, seed: 3 }).every((r) => r.id.startsWith('SD2-')))
  })

  it('serveren sender referansene fra banken, med visuell støtte som tekst og divisjonstype, og sporer tema og område', async () => {
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const body = JSON.stringify({ melding: '', oppgaver: [] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    await assert.rejects(handler(appRequest(session(PLACE)), { uid: 'l', classId: '4A' }))
    assert.ok(prompt.includes('Hovedtema: Strategier i divisjon'))
    assert.ok(prompt.includes('Fagområde: Dele i hundrere, tiere og enere'))
    assert.ok(prompt.includes('Plassverdien skal følge med'))
    assert.ok(prompt.includes('Alle delestykkene skal gå opp.'))
    const ids = [...prompt.matchAll(/ID: (SD\d-N\d-\d{2})/g)].map((m) => m[1])
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id.startsWith('SD1-')), ids.join(','))
    const ref = toAiReference(divisionStrategiesReferences.find((r) => r.id === 'SD1-N1-03')!)
    assert.equal(ref.representation, undefined)
    assert.equal(ref.support, '[ 10 ][ 10 ][ 10 ][ 10 ][ 10 ][ 10 ] [ 1 ][ 1 ][ 1 ]')
    assert.equal(ref.divisionType, 'delingsdivisjon')
    assert.equal(toAiReference(divisionStrategiesReferences.find((r) => r.id === 'SD1-N1-01')!).divisionType, undefined)
    // Brøker: ingen brøkvisning i appen, så brøken skrives med ord og tall i parentes.
    const parts = taskPrompt(serverRequest(session(PARTS)))
    assert.ok(parts.includes('«en fjerdedel (1/4)»'))
  })

  it('nivåene i økta får egne beskrivelser, tallområde og støttestruktur', () => {
    const levels = levelsFor(session(PLACE), 5, 6)
    assert.deepEqual(levels.map((l) => l.title), ['Dele opp med støtte', 'Dele opp selv', 'Dele opp og forklare'])
    assert.deepEqual(levelsFor(session(TYPES), 5, 6).map((l) => l.title), ['To måter å dele på med støtte', 'To måter å dele på', 'To måter å dele på – forklare'])
    const contexts = buildLevelContexts(levels, buildTasks(session(PLACE)), session(PLACE).profile)
    assert.ok(contexts.every((c) => c.numbers && c.support && c.referenceTasks.length === 0 && c.existing!.length === 5))
  })
})

describe('grunnoppgavene i Strategier i divisjon', () => {
  it('alle grunnoppgavene passer hele kontrollen i sin egen økt, og alle delestykkene går opp', () => {
    for (const s of sessions) {
      const tasks = buildTasks(s)
      assert.equal(tasks.length, 15, s.id)
      for (const t of tasks) {
        assert.equal(reasonAlone(s, draftOf(t)), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
        if (t.kind !== 'text') assert.equal(t.a % t.b, 0, t.id)
      }
    }
  })

  it('de endrede grunnoppgavene: plassverdi uten veksling på nivå 1, tiere og hundrere, og brøker med ord', () => {
    // Nivå 1 i økta om plassverdi: hvert siffer går opp i tallet vi deler på (tierne og enerne kan deles hver for seg).
    for (const t of buildTasks(session(PLACE)).filter((x) => x.level === 1)) {
      assert.ok(t.kind !== 'text' && Math.floor(t.a / 10) % t.b === 0 && (t.a % 10) % t.b === 0, t.id)
    }
    // Dividere med 10 og 100: tiere og hundrere – ikke «hva skjer med sifrene».
    assert.ok(buildTasks(session(TENS)).every((t) => t.kind !== 'text' && /tiere|hundrere/.test(t.instruction) && !/sifrene/.test(t.instruction)))
    // Brøker: med ord og tall i parentes, og teller 1 unntatt på nivå 3.
    for (const t of buildTasks(session(PARTS))) {
      const all = t.kind === 'text' ? `${t.text} ${t.solution}` : t.instruction
      assert.match(all, /(halvdel|tredjedel|fjerdedel|femtedel|sjettedel|åttedel|niendedel|tidel)\w* \([12]\/\d+\)/, t.id)
      if (t.level < 3) assert.ok(!/\b2\/\d/.test(all), t.id)
    }
    // Tallområdet følger referansene: halvering med tall under 100.
    assert.ok(buildTasks(session(GOOD)).every((t) => t.kind !== 'text' && t.a < 100))
  })
})

describe('4. referanser kopieres ikke – heller ikke fra divisjonsbanken', () => {
  it('ordrett eller nesten ordrett fra banken for Strategier i divisjon avvises', () => {
    const ref = divisionStrategiesReferences.find((r) => r.id === 'SD1-N2-03')!
    assert.equal(reason(PLACE, text(2, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(PLACE, text(2, 'Fire klasser deler 484 ark likt. Hvor mange ark får hver av klassene? Del opp i hundrere, tiere og enere.', 'Hver klasse får 121 ark.')), 'copiedReference')
  })

  it('en kandidat som er nesten lik en referanse i divisjonsbanken, avvises', () => {
    const ref = divisionReferences.find((r) => r.id === 'D2-N1-01')!
    assert.equal(ref.studentText, '24 blyanter skal deles likt mellom 6 elever. Hvor mange blyanter får hver elev?')
    assert.equal(reason(TYPES, text(1, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(TYPES, text(1, '24 blyanter skal fordeles likt mellom 6 elever. Hvor mange blyanter får hver av elevene?', '4 blyanter')), 'copiedReference')
  })

  it('en ny oppgave med egen formulering godtas', () => {
    assert.equal(reason(TYPES, text(1, 'Mor deler 28 jordbær likt på 4 skåler. Hvor mange jordbær blir det i hver skål?', '7 jordbær. 28 : 4 = 7.')), null)
  })
})

describe('5. oppdeling i hundrere, tiere og enere', () => {
  it('riktig oppdeling godtas – også med veksling', () => {
    assert.equal(alone(PLACE, text(1, 'Regn ut 69 : 3. Fyll inn: 60 : 3 = __ og 9 : 3 = __. Hva er 69 : 3?', '60 : 3 = 20 og 9 : 3 = 3. 69 : 3 = 23.')), null)
    assert.equal(alone(PLACE, text(2, 'Regn ut 248 : 2. Del tallet i hundrere, tiere og enere, og vis hvordan du regner.', '200 : 2 = 100, 40 : 2 = 20 og 8 : 2 = 4. 248 : 2 = 124.')), null)
    assert.equal(alone(PLACE, text(2, 'Regn ut 72 : 4. 7 tiere kan ikke deles likt på 4. Del 72 i 40 og 32 og regn ut.', '40 : 4 = 10 og 32 : 4 = 8. 72 : 4 = 18.')), null)
    assert.equal(alone(PLACE, text(2, 'Tre klasser deler 396 perler likt. Hvor mange perler får hver klasse? Del opp i hundrere, tiere og enere.', '132 perler. 300 : 3 = 100, 90 : 3 = 30 og 6 : 3 = 2.')), null)
  })

  it('løsninger der plassverdien forsvinner, deler som ikke er tallet og deler som ikke går opp, avvises', () => {
    // 96 : 3 regnet som 9 : 3 og 6 : 3.
    assert.equal(alone(PLACE, text(2, 'Regn ut 96 : 3. Del tallet i tiere og enere.', '9 : 3 = 3 og 6 : 3 = 2. 3 + 2 = 5.')), 'wrongSolution')
    assert.equal(alone(PLACE, text(2, 'Tre venner deler 96 klistremerker likt. Hvor mange får hver venn? Del opp i tiere og enere.', '9 : 3 = 3 og 6 : 3 = 2, så hver får 5.')), 'wrongSolution')
    // Delene er ikke til sammen tallet som deles.
    assert.equal(alone(PLACE, text(2, 'Regn ut 84 : 4. Del 84 i 40 og 40.', '40 : 4 = 10 og 40 : 4 = 10. 84 : 4 = 21.')), 'wrongSolution')
    // En del går ikke opp.
    assert.equal(alone(PLACE, text(2, 'Regn ut 52 : 4. Del 52 i 30 og 22.', '30 : 4 og 22 : 4. 52 : 4 = 13.')), 'wrongRemainder')
    // Feil kvotient.
    assert.equal(alone(PLACE, text(2, 'Regn ut 286 : 2. Del tallet i hundrere, tiere og enere.', '200 : 2 = 100, 80 : 2 = 40 og 6 : 2 = 3. 286 : 2 = 134.')), 'wrongSolution')
    assert.equal(alone(PLACE, text(2, 'Regn ut 286 : 2. Del tallet i hundrere, tiere og enere.', '143')), null)
    // I en vurderingsoppgave er feilen i oppgaveteksten lov, men fasiten må ha riktig oppdeling og svar.
    assert.equal(alone(PLACE, text(3, 'Eva regner 84 : 2 slik: 8 : 2 = 4 og 4 : 2 = 2, så svaret er 6. Hva har Eva glemt?', 'Eva har glemt at 8 er 8 tiere. 80 : 2 = 40 og 4 : 2 = 2. 84 : 2 = 42.')), null)
    assert.equal(alone(PLACE, text(3, 'Eva regner 84 : 2 slik: 8 : 2 = 4 og 4 : 2 = 2, så svaret er 6. Hva har Eva glemt?', 'Eva har glemt å legge sammen. Svaret er 6.')), 'wrongSolution')
  })
})

describe('6. halvering godtas bare der den passer', () => {
  it('halvering for å dele på 2, 4 og 8 godtas – med riktig antall halveringer', () => {
    assert.equal(alone(GOOD, math(2, 76, 4, 'Del på 4: halver to ganger.')), null)
    assert.equal(alone(GOOD, math(3, 88, 8, 'Del på 8: halver tre ganger.')), null)
    assert.equal(alone(GOOD, text(1, 'Del 44 på 4 ved å halvere to ganger: 44 : 2 = __ og __ : 2 = __.', '44 : 2 = 22 og 22 : 2 = 11. 44 : 4 = 11.')), null)
    assert.equal(alone(GOOD, text(3, 'Mia regner 64 : 4 ved å halvere to ganger. Vis hvordan hun regner, og forklar hvorfor det virker.', '64 : 4 = 16. 64, 32, 16. To halveringer er å dele på 4.')), null)
  })

  it('halvering når tallet vi deler på ikke er 2, 4 eller 8, feil antall halveringer og feil halveringskjede avvises', () => {
    assert.equal(alone(GOOD, math(2, 72, 3, 'Del på 3: halver to ganger.')), 'invalidStrategy')
    assert.equal(alone(GOOD, math(2, 60, 6, 'Halver tallet for å dele på 6.')), 'invalidStrategy')
    assert.equal(alone(GOOD, math(2, 64, 4, 'Del på 4: halver tre ganger.')), 'invalidStrategy')
    assert.equal(alone(GOOD, text(2, 'Del 45 på 5 ved å halvere to ganger.', '45 : 5 = 9.')), 'invalidStrategy')
    assert.equal(alone(GOOD, text(3, 'Ola regner 84 : 4 ved å halvere to ganger. Vis hvordan han regner, og forklar.', '84 : 4 = 21. 84, 42, 20.')), 'wrongSolution')
    // Å forklare hvorfor halvering ikke passer, er lov.
    assert.equal(alone(GOOD, text(3, 'Forklar hvorfor det passer å halvere for 48 : 2, men ikke for 48 : 3. Regn ut begge.', '48 : 2 = 24 og 48 : 3 = 16. Halvering er å dele på 2, ikke på 3.')), null)
  })

  it('oppdeling i kjente stykker må gi deler som går opp og riktig svar', () => {
    assert.equal(alone(GOOD, text(2, 'Regn ut 84 : 7. Del 84 i 70 og 14.', '70 : 7 = 10 og 14 : 7 = 2. 84 : 7 = 12.')), null)
    assert.equal(alone(GOOD, text(2, 'Regn ut 84 : 7. Del 84 i 60 og 24.', '84 : 7 = 12.')), 'wrongSolution')
  })
})

describe('7. delingsdivisjon og målingsdivisjon skilles når divisjonstypen er oppgitt', () => {
  const sharingText = 'Fire venner deler 48 kr likt. Hvor mange kroner får hver venn?'
  const sharing = text(1, sharingText, '12 kr. 48 : 4 = 12.')
  const measuring = text(1, 'Du har 48 kr. Et klistremerke koster 4 kr. Hvor mange klistremerker kan du kjøpe?', '12 klistremerker. 48 : 4 = 12.')

  it('oppgaver med riktig divisjonstype godtas (gjenbrukt kontroll fra Divisjon)', () => {
    assert.equal(strategiesProblem(sharing, { area: 'gode-delestrategier', divisionType: 'deling' }), null)
    assert.equal(strategiesProblem(measuring, { area: 'gode-delestrategier', divisionType: 'maling' }), null)
  })

  it('oppgitt type som ikke passer spørsmålet, og en fasit som nevner feil type, avvises', () => {
    assert.equal(strategiesProblem(sharing, { area: 'gode-delestrategier', divisionType: 'maling' }), 'wrongDivisionType')
    assert.equal(strategiesProblem(measuring, { area: 'gode-delestrategier', divisionType: 'deling' }), 'wrongDivisionType')
    assert.equal(reason(TYPES, text(2, sharingText, '12 kr. Det er målingsdivisjon fordi 48 : 4 = 12.')), 'wrongDivisionType')
    assert.equal(reason(TYPES, text(2, sharingText, '12 kr. 48 : 4 = 12.', 'Målingsdivisjon: størrelsen på gruppene er kjent.')), 'wrongDivisionType')
  })

  it('i oppgaver med to deler (A og B) må typen passe hver del', () => {
    const studentText =
      'A: 36 elever skal deles i grupper med 4 elever i hver. Hvor mange grupper blir det?\nB: 36 elever skal deles i 4 like store grupper. Hvor mange elever blir det i hver gruppe?\nSkriv divisjonsstykket for begge. Hvilken er delingsdivisjon?'
    assert.equal(alone(TYPES, text(2, studentText, 'Begge: 36 : 4 = 9. A er målingsdivisjon (9 grupper). B er delingsdivisjon (9 i hver gruppe).')), null)
    assert.equal(alone(TYPES, text(2, studentText, 'Begge: 36 : 4 = 9. A er delingsdivisjon (9 grupper). B er målingsdivisjon (9 i hver gruppe).')), 'wrongDivisionType')
  })
})

describe('8. sammenhenger i divisjon', () => {
  it('riktige sammenhenger godtas', () => {
    assert.equal(alone(RELATIONS, text(2, '36 : 6 = 6. Hva er 36 : 3? Forklar.', '36 : 3 = 12. Når det blir halvparten så mange grupper, blir det dobbelt så mange i hver gruppe.')), null)
    assert.equal(alone(RELATIONS, text(2, '14 : 7 = 2. Hva er 28 : 7? Forklar.', '28 : 7 = 4. Når tallet som deles dobles, dobles svaret.')), null)
    assert.equal(alone(RELATIONS, text(3, 'Jon sier: «Når jeg dobler tallet jeg deler på, blir svaret halvparten så stort.» Har Jon rett? Bruk 24 : 3 og 24 : 6 i forklaringen.', 'Ja. 24 : 3 = 8 og 24 : 6 = 4. Når tallet vi deler på dobles, blir svaret halvparten så stort.')), null)
    assert.equal(alone(RELATIONS, text(3, 'Hvilke av disse har samme svar? 10 : 2, 20 : 4 og 30 : 5. Forklar.', '10 : 2 og 20 : 4 gir begge 5. 30 : 5 gir 6. Når begge tallene dobles, blir svaret det samme.')), null)
  })

  it('feil beskrevne sammenhenger, feil konklusjon og feil svar avvises', () => {
    assert.equal(alone(RELATIONS, text(2, '36 : 6 = 6. Hva er 36 : 3? Forklar.', '36 : 3 = 12. Når tallet vi deler på halveres, blir svaret halvparten så stort.')), 'wrongRelation')
    assert.equal(alone(RELATIONS, text(2, '40 : 5 = 8. Hva er 40 : 10? Forklar.', '40 : 10 = 4. Når tallet vi deler på dobles, dobles svaret.')), 'wrongRelation')
    assert.equal(alone(RELATIONS, text(3, 'Kari sier: «Når jeg dobler tallet jeg deler på, blir svaret også dobbelt så stort.» Har Kari rett? Bruk 40 : 5 og 40 : 10.', 'Ja. 40 : 5 = 8 og 40 : 10 = 4.')), 'wrongConclusion')
    assert.equal(alone(RELATIONS, text(3, 'Hvilke av disse har samme svar? 12 : 2, 24 : 4 og 18 : 2. Forklar.', '12 : 2, 24 : 4 og 18 : 2 gir alle 6.')), 'wrongSolution')
    assert.equal(alone(RELATIONS, text(1, '8 : 2 = 4. Hva er 80 : 2?', '80 : 2 = 4.')), 'wrongSolution')
  })

  it('en oppgave uten et kjent stykke å bygge på avvises', () => {
    assert.equal(alone(RELATIONS, math(2, 120, 4, 'Regn ut.')), 'missingRelation')
    assert.equal(alone(RELATIONS, math(2, 120, 4, '12 : 4 = 3. Hva er 120 : 4?')), null)
    assert.equal(alone(RELATIONS, text(2, 'Regn ut 120 : 4.', '30')), 'missingRelation')
  })
})

describe('9. dividere med 10 og 100', () => {
  it('svar med tiere og hundrere godtas', () => {
    assert.equal(alone(TENS, text(2, 'Regn ut 470 : 10. Forklar svaret med tiere.', '470 : 10 = 47. 470 er 47 tiere.')), null)
    assert.equal(alone(TENS, text(2, 'En butikk har 1500 kr i hundrelapper. Hvor mange hundrelapper er det?', '15 hundrelapper. 1500 : 100 = 15.')), null)
    assert.equal(alone(TENS, math(2, 560, 10, 'Hvor mange tiere er det i 560? Regn ut.')), null)
  })

  it('desimaltall som svar, divisjon som ikke går opp, og forklaring uten plassverdi avvises', () => {
    assert.equal(alone(TENS, text(2, 'Regn ut 345 : 10. Forklar svaret med tiere.', '34,5. 345 er 34 tiere og 5 enere.')), 'offTopic')
    assert.equal(alone(TENS, text(2, 'Regn ut 345 : 10. Forklar svaret med tiere.', '34 og 5 til overs.')), 'wrongRemainder')
    assert.equal(alone(TENS, math(2, 345, 10, 'Hvor mange tiere er det i tallet? Regn ut.')), 'wrongRemainder')
    assert.equal(alone(TENS, text(2, 'Regn ut 470 : 10.', '47. Stryk en null.')), 'missingPlaceValue')
    assert.equal(alone(TENS, text(2, 'Regn ut 470 : 10.', '470 : 10 = 47.')), 'missingPlaceValue')
    assert.equal(alone(TENS, math(2, 470, 10, 'Stryk en null for å dele på 10.')), 'missingPlaceValue')
    assert.equal(alone(TENS, text(2, 'Regn ut 3400 : 100 og forklar.', '3400 : 100 = 34. Flytt kommaet to plasser.')), 'missingPlaceValue')
    // En vurderingsoppgave om regelen er lov når fasiten forklarer med hundrere.
    assert.equal(alone(TENS, text(3, 'Ali sier at 600 : 100 = 60, fordi han strøk en null. Hva har Ali gjort feil? Forklar med hundrere.', '600 : 100 = 6. 600 er 6 hundrere.')), null)
  })
})

describe('10. del av en hel og del av en mengde', () => {
  it('riktige brøkdeler, antall og lengder godtas', () => {
    assert.equal(alone(PARTS, text(1, 'Et brett er delt i 6 like store ruter. Hvor stor del av brettet er én rute? Skriv svaret med ord og som brøk.', 'En sjettedel (1/6).')), null)
    assert.equal(alone(PARTS, text(1, 'Det er 15 biler. En tredjedel (1/3) av bilene er røde. Hvor mange biler er røde?', '5 biler. 15 : 3 = 5.')), null)
    assert.equal(alone(PARTS, text(2, 'Ei snor er 40 cm lang. En fjerdedel (1/4) av snora er blå. Hvor mange cm av snora er blå?', '10 cm. 40 : 4 = 10.')), null)
    assert.equal(alone(PARTS, text(3, 'I en kurv er det 24 epler. To tredjedeler (2/3) av eplene er røde. Hvor mange epler er røde? Forklar hvordan du tenker.', '16 epler. 24 : 3 = 8, og 2 · 8 = 16.')), null)
  })

  it('del av en hel og del av en mengde skilles', () => {
    const studentText =
      'A: En pai deles i 8 like store stykker. Hvor stor del av paien er ett stykke?\nB: 32 kuler deles i 8 like store grupper. Hvor mange kuler er en åttedel av kulene?\nHvilken handler om del av en hel?'
    assert.equal(alone(PARTS, text(2, studentText, 'A: En åttedel (1/8) av paien. Det er del av en hel. B: 4 kuler (32 : 8 = 4). Det er del av en mengde.')), null)
    assert.equal(alone(PARTS, text(2, studentText, 'A: En åttedel (1/8) av paien. Det er del av en mengde. B: 4 kuler (32 : 8 = 4). Det er del av en hel.')), 'wrongArea')
    // Svaret har feil form: et antall der det spørres om en del av en hel, og en lengde uten enhet.
    assert.equal(alone(PARTS, text(1, 'En kake deles i 4 like store stykker. Hvor stor del av kaken er ett stykke?', '1 stykke.')), 'wrongSolution')
    assert.equal(alone(PARTS, text(1, 'En kake deles i 4 like store stykker. Hvor stor del av kaken er ett stykke?', 'En tredjedel (1/3).')), 'wrongSolution')
    assert.equal(alone(PARTS, text(2, 'Et tau er 30 m langt. En femtedel (1/5) av tauet er grønt. Hvor mange meter er grønt?', '6')), 'missingUnit')
    // Én gjenstand må deles i like store deler.
    assert.equal(alone(PARTS, text(1, 'En pizza deles i 4 biter. Hvor stor del av pizzaen er én bit?', 'En fjerdedel (1/4).')), 'missingInfo')
  })

  it('mengder som ikke går opp i nevneren, feil teller og brøk med ord og tall som ikke stemmer, avvises', () => {
    assert.equal(alone(PARTS, text(1, 'En fjerdedel (1/4) av 30 kjeks er med sjokolade. Hvor mange kjeks er med sjokolade?', '7 kjeks.')), 'wrongRemainder')
    assert.equal(alone(PARTS, math(1, 30, 4, 'Hva er en fjerdedel (1/4) av 30?')), 'wrongRemainder')
    assert.equal(alone(PARTS, text(1, 'Det er 21 elever. En tredjedel (1/3) av elevene har ski. Hvor mange elever har ski?', '6 elever.')), 'wrongSolution')
    assert.equal(alone(PARTS, text(2, 'To tredjedeler (2/3) av 18 bøker er tegneserier. Hvor mange er tegneserier?', '12 bøker.')), 'levelMismatch')
    assert.equal(alone(PARTS, text(3, 'Tre fjerdedeler (3/4) av 20 elever har sykkel. Hvor mange har sykkel? Forklar.', '15 elever.')), 'levelMismatch')
    assert.equal(alone(PARTS, text(1, 'En fjerdedel (1/3) av 12 kuler er røde. Hvor mange kuler er røde?', '3 kuler.')), 'wrongSolution')
    assert.equal(alone(PARTS, math(1, 20, 4, 'Hva er en femtedel (1/5) av 20?')), 'wrongSolution')
  })
})

describe('11. rest, divisjon på null og feil fasit avvises i alle fagområdene', () => {
  it('rest', () => {
    assert.equal(alone(PLACE, math(1, 85, 4, 'Del tierne og enerne hver for seg.')), 'wrongRemainder')
    assert.equal(alone(GOOD, text(2, 'Seks venner deler 50 kr likt. Hvor mange kroner får hver venn?', '8 kr, og 2 kr blir til overs.')), 'wrongRemainder')
    assert.equal(alone(RELATIONS, text(2, '15 : 5 = 3. Hva er 16 : 5?', '3 rest 1')), 'wrongRemainder')
  })

  it('divisjon på null', () => {
    assert.equal(alone(PLACE, math(1, 48, 0, 'Del tierne og enerne hver for seg.')), 'divisionByZero')
    assert.equal(alone(GOOD, text(2, 'Regn ut 48 : 0. Velg en god måte å regne på.', '0')), 'divisionByZero')
  })

  it('feil fasit', () => {
    assert.equal(alone(GOOD, text(1, 'Ni barn deler 63 klinkekuler likt. Hvor mange får hvert barn?', '8 klinkekuler. 63 : 9 = 8.')), 'wrongSolution')
    assert.equal(alone(TENS, text(1, 'Hvor mange tiere er det i 80? Hva er 80 : 10?', 'Det er 8 tiere i 80. 80 : 10 = 80.')), 'wrongSolution')
    assert.equal(alone(GOOD, text(2, 'Regn ut 96 : 8. Velg en god måte å regne på, og vis den.', '80 : 8 = 10 og 16 : 8 = 2. 96 : 8 = 12. Vent, jeg regner på nytt.')), 'unclearSolution')
    assert.equal(alone(PLACE, text(2, 'Svaret er 21. Regn ut 84 : 4 og del opp i tiere og enere.', '80 : 4 = 20 og 4 : 4 = 1. 84 : 4 = 21.')), 'revealedSolution')
  })

  it('tall utenfor tallområdet, desimaltall, negative tall og innhold utenfor temaet', () => {
    assert.equal(alone(GOOD, math(1, 480, 4, 'Del på 4: halver to ganger.')), 'outsideRange')
    assert.equal(alone(PARTS, text(2, 'Halvparten (1/2) av 300 elever går ut. Hvor mange går ut?', '150 elever.')), 'outsideRange')
    assert.equal(alone(PLACE, text(2, 'Regn ut 8,4 : 4. Del tiere og enere.', '2,1')), 'offTopic')
    assert.equal(alone(PLACE, text(2, 'Temperaturen er −12 grader. Del på 4.', '−3')), 'offTopic')
    assert.equal(alone(PLACE, text(2, 'Hva er en fjerdedel (1/4) av 84?', '21')), 'offTopic')
    assert.equal(alone(GOOD, text(2, 'Lise har 34 kort og får 18 til. Hvor mange kort har hun nå?', '52 kort.')), 'offTopic')
    assert.equal(alone(GOOD, text(1, 'Se på figuren under. Hvor mange epler blir det i hver kurv når 20 epler deles likt i 4 kurver?', '5 epler.')), 'missingFigure')
  })
})

describe('12. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(PARTS)
  const ok1 = (t: number) => story(1, `Lise har ${2 * t} perler. Halvparten (1/2) av perlene er blå. Hvor mange perler er blå?`, `${t} perler. ${2 * t} : 2 = ${t}.`)
  const ok2 = (cm: number) => story(2, `Ei snor er ${cm} cm lang. Du klipper av en fjerdedel (1/4) av snora. Hvor lang er biten du klipper av?`, `${cm / 4} cm. ${cm} : 4 = ${cm / 4}.`)
  const ok3 = (x: number) =>
    story(3, `I en kurv er det ${3 * x} epler. To tredjedeler (2/3) av eplene er røde. Hvor mange epler er røde? Forklar hvordan du tenker.`, `${2 * x} epler. ${3 * x} : 3 = ${x}, og 2 · ${x} = ${2 * x}.`)

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(7),
        // Går ikke opp.
        story(1, 'En fjerdedel (1/4) av 30 kjeks er med sjokolade. Hvor mange kjeks er med sjokolade?', '7 kjeks.'),
        ok2(48),
        // Teller 2 på nivå 2.
        story(2, 'To tredjedeler (2/3) av 18 bøker er tegneserier. Hvor mange er tegneserier?', '12 bøker.'),
        ok3(8),
        ok3(9),
      ],
      [ok1(8), ok2(60)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_wrongRemainder, 1)
    assert.equal(final.removed_levelMismatch, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'strategier-i-divisjon')
    assert.equal(final.area, 'del-av-hel-mengde')
    // Oppgavene merkes som AI-genererte og ikke gjennomgått når appen legger dem inn.
    assert.ok(result.tasks.map((t, i) => toSessionTask(t, `ai-${i}`)).every((t) => t.aiGenerated === true && t.reviewed === false))
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'En fjerdedel (1/4) av 30 kjeks er med sjokolade. Hvor mange kjeks er med sjokolade?', '7 kjeks.')
    const { handler, calls } = scripted([[wrong, wrong, ok2(48), ok2(60), ok3(8), ok3(9)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('13. «Andre ønsker» kan ikke overstyre fagområde, nivå eller matematisk korrekthet', () => {
  const wishes = 'Bruk penger og butikk. Gjerne kroner og øre, noe til overs, brøk og påstander på nivå 1.'

  it('ønskene gir ikke rest, desimaltall, et annet fagområde, et annet nivå eller feil fasit', () => {
    assert.equal(reason(PLACE, text(2, 'I butikken deler tre venner 65 kr likt. Hvor mange kroner får hver?', '21 kr, og 2 kr blir til overs.'), wishes), 'wrongRemainder')
    assert.equal(reason(PLACE, text(2, 'I butikken deler fire venner 86 kr likt. Hvor mye får hver?', '21,50 kr.'), wishes), 'offTopic')
    assert.equal(reason(PLACE, text(2, 'En fjerdedel (1/4) av 84 kr i kassa er tikroner. Hvor mange kroner er det?', '21 kr.'), wishes), 'offTopic')
    assert.equal(reason(PLACE, text(1, 'Kassereren sier at 84 : 4 = 12. Har hun rett?', 'Nei. 84 : 4 = 21.'), wishes), 'levelMismatch')
    assert.equal(reason(PLACE, text(2, 'Fire venner deler 84 kr likt i butikken. Hvor mange kroner får hver? Del opp i tiere og enere.', '80 : 4 = 20 og 4 : 4 = 1. Hver får 24 kr.'), wishes), 'wrongSolution')
    assert.equal(reason(TENS, text(2, 'I kassa er det 450 kr i tikroner. Hvor mange tikroner er det?', '45. Stryk en null.'), wishes), 'missingPlaceValue')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta', () => {
    assert.equal(reason(PLACE, text(2, 'Fire venner deler 88 kr likt i butikken. Hvor mange kroner får hver? Del opp i tiere og enere.', '80 : 4 = 20 og 8 : 4 = 2. Hver får 22 kr.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(PLACE), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('«bruk penger» hele kroner som går opp, ikke øre eller rest'))
  })
})

describe('14. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(hash(file('problemlosing')), '380ddf92250336a8')
    assert.equal(hash(file('tall_og_regning')), 'bc0636c64aaef7f8')
    // Måling, Mønster og algoritmer og Regning er lagt til samtidig (se measurementAi.test.ts, patternAi.test.ts og arithmeticAi.test.ts).
    assert.equal(referenceBanks.filter((r) => !['strategier-i-divisjon', 'maling', 'monster-og-algoritmer', 'regning'].includes(r.topic)).length, 54 + 45 + 36 + 36 + 36 + 36)
    for (const [area, level] of [['multiplikasjon-divisjon', 2], ['delingsdivisjon-malingsdivisjon', 1], ['modeller', 3]] as const) {
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(divisionReferences, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene og arbeidsarkene er uendret – i repetisjon bare oppgavene fra Strategier i divisjon', () => {
    // Måling, Mønster og algoritmer, Regning, repetisjonsøkter med undertema derfra og geometri-6 er endret samtidig
    // (se measurementAi.test.ts, patternAi.test.ts, arithmeticAi.test.ts og geometryAi.test.ts).
    const all = unitSpecs.filter((u) => !['strategier-i-divisjon', 'maling', 'monster-og-algoritmer', 'regning'].includes(u.unitId)).flatMap((u) => planned(u.unitId))
    const touched = (s: Planned) => s.skills.some((k) => k.startsWith('sdiv.') || k.startsWith('mal.') || k.startsWith('mon.'))
    const others = all.filter((s) => !touched(s) && s.id !== 'geometri-6').map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))
    assert.equal(others.length, 58)
    assert.equal(hash(JSON.stringify(others)), '921ec43842aeb44d')
    // Repetisjonsøkta: samme overskrift, undertema og antall oppgaver, og oppgavene om målingsdivisjon og delingsdivisjon er de samme.
    const rep = all.filter((s) => s.skills.some((k) => k.startsWith('sdiv.')))
    assert.deepEqual(rep.map((s) => [s.id, s.heading, s.skills.join(',')]), [['repetisjon-var-1', 'Repetisjon: divisjon og ulike strategier', 'sdiv.hte,sdiv.malings-delings']])
    const tasks = buildTasks(rep[0])
    assert.equal(tasks.length, 15)
    const kept = tasks.filter((t) => rep[0].skills[(Number(t.id.split('-').at(-1)) - 1) % rep[0].skills.length] !== 'sdiv.hte')
    assert.equal(hash(JSON.stringify(kept)), 'b27fdb0dba94db43')
    // Arbeidsarket i økt 1 (store delestykker på nivå 3) er uendret. Arbeidsarkene i Måling og Mønster og algoritmer er endret samtidig.
    assert.equal(hash(JSON.stringify(Object.fromEntries(Object.entries(worksheetTasks).filter(([id]) => !id.startsWith('maling-') && !id.startsWith('monster-og-algoritmer-'))))), 'b573e51e205df96d')
    assert.equal(worksheetTasks['strategier-i-divisjon-1'].length, 6)
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '10')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })

  it('kontrollene for Strategier i divisjon gjelder ikke Divisjon, og Divisjon kontrollerer divisjonstypen som før', () => {
    // I Divisjon er tallområdet fortsatt gangetabellen, og typen kontrolleres med den samme (delte) funksjonen.
    const ctx = { area: 'delingsdivisjon-malingsdivisjon' as const, divisionType: 'deling' as const }
    assert.equal(divisionProblem(text(2, 'Fire klasser deler 484 ark likt (484 : 4). Hvor mange ark får hver klasse?', '121 ark.'), ctx), 'outsideTables')
    assert.equal(divisionProblem(text(1, '20 epler legges i poser med 5 i hver. Hvor mange poser blir det?', '4 poser.'), ctx), 'wrongDivisionType')
    assert.equal(divisionProblem(text(1, '20 epler deles likt på 5 barn. Hvor mange får hvert barn?', '4 epler.'), ctx), null)
    assert.equal(divisionProblem(text(1, '20 epler deles likt på 5 barn. Hvor mange får hvert barn?', '4 epler. Målingsdivisjon.'), { area: 'delingsdivisjon-malingsdivisjon' }), 'wrongDivisionType')
  })
})
