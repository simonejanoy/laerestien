// Tester for referansebanken og AI-genereringen i Tall og regning: banken, koblingen mellom øktene og
// fagområdene, utvalget (også overlappet med Divisjon), kontrollene (tallfamilier, gange og dele, tideler,
// desimaltall, lengder og enheter, fasit), utfyllingen, «Andre ønsker» og at andre temaer er uendret.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { AREA_TITLES, NUMBERS_AND_OPERATIONS_AREAS, topicOfArea, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import { divisionProblem } from './divisionChecks.ts'
import { numbersProblem } from './numbersAndOperationsChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { divisionReferences } from './references/division.ts'
import { multiplicationReferences } from './references/multiplication.ts'
import { NUMBERS_AND_OPERATIONS_REFERENCE_COUNT, numbersAndOperationsBankFile, numbersAndOperationsReferences } from './references/numbersAndOperations.ts'
import { placeValueReferences } from './references/placeValue.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { NUMBERS_AND_OPERATIONS_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(numbersAndOperationsBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

const sessions = planned('tall-og-regning')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [ADD, MULT, TENTHS, LINE, LENGTH, WRITE] = [1, 2, 3, 4, 5, 6].map((n) => `tall-og-regning-${n}`)

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Tall og regning', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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
/** Hele kandidatkontrollen uten oppgavesettet (og eventuelt uten referanser). */
function reasonAlone(s: Planned, task: AiTaskDraft, withReferences = true) {
  const request = serverRequest(s)
  request.levels = request.levels!.map((l) => ({ ...l, existing: [], ...(withReferences ? {} : { referenceTasks: [] }) }))
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
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-tr', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('referansebanken for Tall og regning', () => {
  it('1. inneholder 36 unike referanser, godkjent av valideringen, med alle feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(NUMBERS_AND_OPERATIONS_REFERENCE_COUNT, 36)
    assert.equal(raw.referenceCount, 36)
    assert.equal(numbersAndOperationsReferences.length, 36)
    assert.equal(new Set(numbersAndOperationsReferences.map((r) => r.id)).size, 36)
    assert.deepEqual(validateReferenceBank(raw, 36, NUMBERS_AND_OPERATIONS_BANK).errors, [])
    assert.deepEqual(numbersAndOperationsReferences, raw.references)
    for (const ref of numbersAndOperationsReferences) {
      assert.match(ref.id, /^TR[1-4]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'tall-og-regning')
      for (const field of ['format', 'studentText', 'solution', 'purpose', 'workedSolution'] as const) assert.ok(ref[field]?.trim(), `${ref.id}: ${field}`)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.ok(ref.teacherNote?.trim(), ref.id)
    }
    const ref = numbersAndOperationsReferences.find((r) => r.id === 'TR3-N2-02')!
    assert.equal(ref.studentText, 'Regn ut 0,6 + 0,7. Skriv svaret som desimaltall og forklar med tideler.')
    assert.equal(ref.solution, '1,3.')
    assert.equal(ref.teacherNote, 'Vanlig feil er å svare 0,13.')
    assert.equal(numbersAndOperationsReferences.find((r) => r.id === 'TR1-N1-01')!.representationHint, '[ 25 ][ 13 ] = 38')
    assert.equal(referenceBanks.filter((r) => r.topic === 'tall-og-regning').length, 36)
  })

  it('ID-ene og områdene kolliderer ikke med de andre bankene', () => {
    const ids = referenceBanks.map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(!referenceBanks.some((r) => r.topic !== 'tall-og-regning' && r.id.startsWith('TR')))
    // «addisjon-subtraksjon» og «multiplikasjon-divisjon» finnes i Tall og plassverdi og Divisjon: egne interne ID-er,
    // og ID-en fra referansefilen er beholdt i sourceArea.
    const source = Object.fromEntries(numbersAndOperationsReferences.map((r) => [r.area, r.sourceArea]))
    assert.deepEqual(source, {
      'sammenheng-addisjon-subtraksjon': 'addisjon-subtraksjon',
      'sammenheng-multiplikasjon-divisjon': 'multiplikasjon-divisjon',
      'desimaltall-tideler': 'desimaltall-tideler',
      'desimaltall-lengde': 'desimaltall-lengde',
    })
    for (const area of NUMBERS_AND_OPERATIONS_AREAS) assert.equal(topicOfArea(area), 'tall-og-regning')
    assert.equal(topicOfArea('addisjon-subtraksjon'), 'tall-og-plassverdi')
    assert.equal(topicOfArea('multiplikasjon-divisjon'), 'divisjon')
    assert.equal(AREA_TITLES['sammenheng-multiplikasjon-divisjon'], 'Sammenhengen mellom multiplikasjon og divisjon')
    assert.ok(containsInternalText('Lag en oppgave som TR2-N2-01.'))
  })

  it('2. hvert av de fire fagområdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...new Set(numbersAndOperationsReferences.map((r) => r.area))], [...NUMBERS_AND_OPERATIONS_AREAS])
    for (const area of NUMBERS_AND_OPERATIONS_AREAS) {
      for (const level of [1, 2, 3]) assert.equal(numbersAndOperationsReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 36 referansene består de faglige kontrollene for sitt område og nivå (fasit og løsningsforslag)', () => {
    for (const ref of numbersAndOperationsReferences) {
      const s = sessions.find((x) => x.profile?.area === ref.area && !x.profile.taskVariant)!
      assert.equal(reasonAlone(s, text(ref.level, ref.studentText, `${ref.solution} ${ref.workedSolution}`), false), null, `${ref.id}: ${ref.studentText}`)
    }
  })

  it('valideringen regner med desimalkomma og fanger feil i banken', () => {
    const broken = bankJson()
    broken.references.find((r) => r.id === 'TR4-N3-02')!.workedSolution = 'Meter: 3 − 1,2 = 1,7.'
    assert.ok(validateReferenceBank(broken, 36, NUMBERS_AND_OPERATIONS_BANK).errors.some((e) => e.includes('TR4-N3-02')))
  })
})

describe('3. øktene i Tall og regning og fagområdene', () => {
  it('beholder seks økter med samme ID-er, overskrifter og rekkefølge, og kobler hver økt til ett fagområde', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.profile?.area, s.profile?.taskVariant ?? '']),
      [
        ['tall-og-regning-1', 'Sammenhengen mellom addisjon og subtraksjon', 'sammenheng-addisjon-subtraksjon', ''],
        ['tall-og-regning-2', 'Sammenhengen mellom multiplikasjon og divisjon', 'sammenheng-multiplikasjon-divisjon', ''],
        ['tall-og-regning-3', 'Desimaltall med tideler', 'desimaltall-tideler', ''],
        ['tall-og-regning-4', 'Tideler på tallinjen', 'desimaltall-tideler', 'tallinje'],
        ['tall-og-regning-5', 'Desimaltall i lengdemåling', 'desimaltall-lengde', ''],
        ['tall-og-regning-6', 'Måle og skrive lengder med desimaltall', 'desimaltall-lengde', 'skrive'],
      ],
    )
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'tall-og-regning')!.weeks.map((w) => w.sessions.length), [2, 2, 2])
  })

  it('velger bare referanser fra Tall og regning, øktas fagområde og nivå', () => {
    for (const s of sessions) {
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'tall-og-regning' && r.area === s.profile!.area && r.level === level && r.id.startsWith('TR')), `${s.id} nivå ${level}`)
        }
      }
    }
  })

  it('overlappet med Divisjon og Tall og plassverdi: hvert tema får bare sine egne referanser', () => {
    for (const level of [1, 2, 3] as const) {
      assert.ok(selectReferences(referenceBanks, { area: 'multiplikasjon-divisjon', level, seed: 3 }).every((r) => r.topic === 'divisjon'))
      assert.ok(selectReferences(referenceBanks, { area: 'addisjon-subtraksjon', level, seed: 3 }).every((r) => r.topic === 'tall-og-plassverdi'))
    }
    // Tall og plassverdi har ingen desimaltall; desimaløktene henter bare fra Tall og regning.
    assert.ok(!placeValueReferences.some((r) => /\d,\d/.test(`${r.studentText} ${r.solution}`)))
  })

  it('serveren sender referansene fra banken, med visuell støtte som tekst, og sporer tema og område', async () => {
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const body = JSON.stringify({ melding: '', oppgaver: [] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    await assert.rejects(handler(appRequest(session(TENTHS)), { uid: 'l', classId: '4A' }))
    assert.ok(prompt.includes('Hovedtema: Tall og regning'))
    assert.ok(prompt.includes('Fagområde: Desimaltall med tideler'))
    assert.ok(prompt.includes('Ti tideler er én hel'))
    const ids = [...prompt.matchAll(/ID: (TR\d-N\d-\d{2})/g)].map((m) => m[1])
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id.startsWith('TR3-')), ids.join(','))
    const ref = toAiReference(numbersAndOperationsReferences.find((r) => r.id === 'TR3-N1-02')!)
    assert.equal(ref.representation, undefined)
    assert.equal(ref.support, '0 - 0,1 - 0,2 - 0,3 - 0,4 - 0,5 - 0,6 - 0,7 - 0,8 - 0,9 - 1')
  })

  it('nivåene i økta får egne beskrivelser, tallområde og støttestruktur', () => {
    const levels = levelsFor(session(TENTHS), 5, 6)
    assert.deepEqual(levels.map((l) => l.title), ['Tideler', 'Regne og sammenligne', 'Forklare tideler'])
    const contexts = buildLevelContexts(levels, buildTasks(session(TENTHS)), session(TENTHS).profile)
    assert.ok(contexts.every((c) => c.numbers && c.support && c.referenceTasks.length === 0 && c.existing!.length === 5))
  })
})

describe('grunnoppgavene i Tall og regning', () => {
  it('alle grunnoppgavene passer hele kontrollen i sin egen økt', () => {
    for (const s of sessions) {
      const tasks = buildTasks(s)
      assert.equal(tasks.length, 15, s.id)
      for (const t of tasks) assert.equal(reasonAlone(s, draftOf(t)), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
    }
  })

  it('repetisjonsøktene med undertema fra Tall og regning bruker de samme grunnoppgavene, og de består kontrollen', () => {
    const repetitions = unitSpecs
      .filter((u) => u.unitId !== 'tall-og-regning')
      .flatMap((u) => planned(u.unitId))
      .filter((s) => s.skills.some((k) => k.startsWith('tr.')))
    assert.deepEqual(repetitions.map((s) => s.id), ['repetisjon-vinter-3', 'repetisjon-vinter-4'])
    const areaOf: Record<string, string> = { 'tr.add-sub': ADD, 'tr.mult-div': MULT, 'tr.tideler': TENTHS }
    let checked = 0
    for (const s of repetitions) {
      for (const t of buildTasks(s)) {
        const skill = s.skills[(Number(t.id.split('-').at(-1)) - 1) % s.skills.length]
        if (!skill.startsWith('tr.')) continue
        checked++
        assert.equal(reasonAlone(session(areaOf[skill]), draftOf(t)), null, `${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
      }
    }
    assert.equal(checked, 9 + 15)
  })

  it('tideløkta og tallinjeøkta har ulike oppgaver, og lengdeøktene har enhet i alle fasiter', () => {
    const textOf = (id: string) => buildTasks(session(id)).map((t) => (t.kind === 'text' ? t.text : ''))
    assert.ok(textOf(LINE).every((t) => /tallinje/.test(t)))
    assert.ok(!textOf(TENTHS).some((t) => textOf(LINE).includes(t)))
    for (const id of [LENGTH, WRITE]) for (const t of buildTasks(session(id))) assert.ok(t.kind === 'text' && /\d\s*(mm|cm|dm|m)\b/.test(t.solution), t.id)
    assert.ok(!buildTasks(session(TENTHS)).some((t) => t.kind === 'text' && /\d,\d{2}/.test(`${t.text} ${t.solution}`)))
  })
})

describe('4. referanser kopieres ikke – heller ikke fra divisjonsbanken', () => {
  it('ordrett eller nesten ordrett fra banken for Tall og regning avvises', () => {
    const ref = numbersAndOperationsReferences.find((r) => r.id === 'TR2-N2-02')!
    assert.equal(reason(MULT, text(2, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(MULT, text(2, 'Finn tallet som mangler: 56 : __ = 8. Skriv gangestykket du bruker.', '7. Gangestykket er 8 · 7 = 56.')), 'copiedReference')
  })

  it('en kandidat som er nesten lik en referanse om multiplikasjon og divisjon i divisjonsbanken, avvises', () => {
    const ref = divisionReferences.find((r) => r.id === 'D1-N1-03')!
    assert.equal(ref.studentText, 'Bruk tallene 5, 8 og 40. Skriv de to divisjonsstykkene som hører til.')
    const copy = text(1, 'Bruk tallene 6, 7 og 42. Skriv de to divisjonsstykkene som hører til.', '42 : 6 = 7 og 42 : 7 = 6')
    assert.equal(reason(MULT, copy), 'copiedReference')
    // Divisjonsbanken brukes bare her – ikke i de andre øktene i Tall og regning.
    assert.notEqual(reason(ADD, copy), 'copiedReference')
  })

  it('en ny oppgave med egen formulering godtas', () => {
    assert.equal(reason(MULT, text(2, 'Klassen vet at 7 · 40 = 280. Hvilket delestykke med 280 kan de nå løse uten å regne? Skriv det med svar.', '280 : 7 = 40, og 280 : 40 = 7.')), null)
  })
})

describe('5. tallfamilier i addisjon og subtraksjon', () => {
  it('en riktig tallfamilie med de samme tre tallene godtas', () => {
    assert.equal(reason(ADD, text(1, 'Bruk tallene 35, 24 og 59. Skriv de to pluss-stykkene og de to minus-stykkene i tallfamilien.', '35 + 24 = 59, 24 + 35 = 59, 59 − 24 = 35 og 59 − 35 = 24.')), null)
  })

  it('tall som ikke hører sammen, et fremmed tall eller en feil utregning avvises', () => {
    const family = 'Bruk tallene 35, 24 og 58. Skriv de to pluss-stykkene og de to minus-stykkene i tallfamilien.'
    assert.equal(reason(ADD, text(1, family, '35 + 24 = 59, 59 − 24 = 35.')), 'wrongSolution')
    assert.equal(reason(ADD, text(1, 'Bruk tallene 35, 24 og 59. Skriv to pluss-stykker og to minus-stykker som hører sammen.', '35 + 24 = 59, 59 − 25 = 34.')), 'wrongSolution')
    assert.equal(reason(ADD, text(1, 'Bruk tallene 35, 24 og 59. Skriv to pluss-stykker og to minus-stykker som hører sammen.', '35 + 24 = 59, 59 − 24 = 36.')), 'wrongSolution')
  })

  it('oppgir oppgaven et regnestykke, må fasiten bruke de samme tre tallene', () => {
    assert.equal(reason(ADD, text(1, '42 + 17 = 59. Bruk dette og fyll inn: 59 − 17 = __.', '59 − 17 = 42.')), null)
    assert.equal(reason(ADD, text(1, '42 + 17 = 59. Bruk dette og fyll inn: 59 − 17 = __.', '59 − 18 = 41.')), 'wrongSolution')
  })

  it('ukjent tall: fasiten må passe i det opprinnelige regnestykket', () => {
    assert.equal(reason(ADD, text(2, 'Hvilket tall står på den tomme plassen? __ + 47 = 120. Skriv minus-stykket du bruker.', '73. 120 − 47 = 73.')), null)
    assert.equal(reason(ADD, text(2, 'Hvilket tall står på den tomme plassen? __ + 47 = 120. Skriv minus-stykket du bruker.', '83. 120 − 47 = 83.')), 'wrongSolution')
    assert.equal(reason(ADD, text(2, 'Hvilket tall står på den tomme plassen? __ − 47 = 120. Skriv pluss-stykket du bruker.', '73. 120 − 47 = 73.')), 'wrongSolution')
  })

  it('et rent minus-stykke uten sammenheng avvises', () => {
    assert.equal(reason(ADD, math(1, 85, '-', 37, 'Regn ut.')), 'missingRelation')
    assert.equal(reason(ADD, math(1, 85, '-', 37, '48 + 37 = 85. Bruk det til å finne 85 − 37.')), null)
  })
})

describe('6. gangestykke og divisjonsstykke kobles matematisk korrekt', () => {
  it('riktig kobling godtas – også med hele tiere', () => {
    assert.equal(reason(MULT, text(2, 'Du vet at 6 · 40 = 240. Bruk det til å skrive to delestykker med svar.', '240 : 6 = 40 og 240 : 40 = 6.')), null)
    assert.equal(reason(MULT, math(1, 35, '/', 5, '7 · 5 = 35. Bruk det til å finne 35 : 5.')), null)
  })

  it('feil kobling, feil regnefamilie og manglende sammenheng avvises', () => {
    assert.equal(reason(MULT, text(2, 'Du vet at 6 · 40 = 240. Bruk det til å skrive to delestykker med svar.', '240 : 6 = 40 og 240 : 60 = 4.')), 'wrongSolution')
    assert.equal(reason(MULT, text(1, 'Bruk tallene 4, 6 og 25. Skriv ett gangestykke og ett delestykke.', '4 · 6 = 24 og 24 : 6 = 4.')), 'wrongSolution')
    assert.equal(reason(MULT, math(1, 35, '/', 5, '8 · 5 = 40. Bruk det til å finne 35 : 5.')), 'wrongSolution')
    assert.equal(reason(MULT, math(1, 35, '/', 5, 'Regn ut.')), 'missingRelation')
    assert.equal(reason(MULT, text(2, 'Hvilket tall mangler? 54 : __ = 9. Vis med et gangestykke.', '5. 9 · 5 = 54.')), 'wrongSolution')
  })

  it('rest og divisjon med 0 avvises', () => {
    assert.equal(reason(MULT, text(2, '6 · 7 = 42. Bruk det til å finne 44 : 6. Hvor mye blir til overs?', '44 : 6 = 7 rest 2.')), 'wrongRemainder')
    assert.equal(reason(MULT, text(2, 'Hva er 30 : 0? Bruk et gangestykke.', 'Det går ikke.')), 'divisionByZero')
  })
})

describe('7. desimaltall: punktum, hundredeler og feil sammenligning avvises', () => {
  it('punktum i stedet for komma', () => {
    assert.equal(reason(TENTHS, text(1, 'Skriv tallet som desimaltall: sju tideler.', '0.7')), 'decimalFormat')
  })

  it('hundredeler eller flere desimaler', () => {
    assert.equal(reason(TENTHS, text(2, 'Hvilket tall er størst, 0,25 eller 0,3? Forklar.', '0,3 er størst.')), 'tooManyDecimals')
    assert.equal(reason(TENTHS, text(2, 'Skriv tre hundredeler som desimaltall.', '0,03')), 'tooManyDecimals')
  })

  it('feil sammenligning, feil rekkefølge og feil konklusjon', () => {
    assert.equal(reason(TENTHS, text(2, 'Hvilket av tallene 1,1 og 0,8 er størst? Begrunn svaret.', '1,1 er størst. 1,1 er 11 tideler og 0,8 er 8 tideler.')), null)
    assert.equal(reason(TENTHS, text(2, 'Hvilket av tallene 1,1 og 0,8 er størst? Begrunn svaret.', '0,8 er størst, fordi 8 er større enn 1.')), 'wrongSolution')
    assert.equal(reason(LINE, text(2, 'Plasser tallene på en tenkt tallinje og ordne dem fra minst til størst: 1,6 0,8 1,2 0,3', '0,3 0,8 1,2 1,6.')), null)
    assert.equal(reason(LINE, text(2, 'Plasser tallene på en tenkt tallinje og ordne dem fra minst til størst: 1,6 0,8 1,2 0,3', '0,3 1,2 0,8 1,6.')), 'wrongSolution')
    assert.equal(reason(TENTHS, text(3, 'Ola mener 1,4 er mindre enn 0,7, siden 4 er mindre enn 7. Stemmer det? Forklar.', 'Ja. 4 er mindre enn 7.')), 'wrongConclusion')
    assert.equal(reason(TENTHS, text(3, 'Ola mener 1,4 er mindre enn 0,7, siden 4 er mindre enn 7. Stemmer det? Forklar.', 'Nei. 1,4 er 14 tideler og 0,7 er 7 tideler.')), null)
  })
})

describe('8. ti tideler blir én hel', () => {
  // Fagkontrollen direkte: oppgaven med 0,6 og 0,7 er referansen TR3-N2-02 (hele kontrollen ville avvist den som kopi).
  const task = 'Regn ut 0,6 + 0,7. Skriv svaret som desimaltall og forklar med tideler.'
  const tenths = (t: AiTaskDraft) => numbersProblem(t, { area: 'desimaltall-tideler' })

  it('0,6 + 0,7 = 1,3 godtas, 0,13 og 1,2 godtas ikke', () => {
    assert.equal(tenths(text(2, task, '1,3. 6 tideler + 7 tideler = 13 tideler, som er 1 hel og 3 tideler.')), null)
    assert.equal(tenths(text(2, task, '0,13')), 'tooManyDecimals')
    assert.equal(tenths(text(2, task, '1,2. 0,6 + 0,7 = 1,2.')), 'wrongSolution')
    // Hele kontrollen, med egen formulering.
    assert.equal(reason(TENTHS, text(2, 'Finn summen av 0,9 og 0,5, og forklar med tideler. Skriv svaret som desimaltall.', '1,4. 0,9 + 0,5 = 1,4. 14 tideler er 1 hel og 4 tideler.')), null)
    assert.equal(reason(TENTHS, text(2, 'Finn summen av 0,9 og 0,5, og forklar med tideler. Skriv svaret som desimaltall.', '0,14. 0,9 + 0,5 = 0,14.')), 'tooManyDecimals')
    assert.equal(reason(TENTHS, text(2, 'Regn ut 0,8 + 0,5. Skriv svaret med tideler.', '1,4')), 'wrongSolution')
  })

  it('hele og tideler skrives riktig, og antall tideler i et tall stemmer', () => {
    assert.equal(reason(TENTHS, text(1, 'Et tall har 3 hele og 6 tideler. Skriv det som desimaltall.', '3,6')), null)
    assert.equal(reason(TENTHS, text(1, 'Et tall har 3 hele og 6 tideler. Skriv det som desimaltall.', '6,3')), 'wrongSolution')
    assert.equal(reason(TENTHS, text(1, 'Et tall har 3 hele og 6 tideler. Skriv det som desimaltall.', '0,36')), 'tooManyDecimals')
    assert.equal(reason(TENTHS, text(1, 'Skriv som desimaltall: 14 tideler', '1,4')), null)
    assert.equal(reason(TENTHS, text(1, 'Skriv som desimaltall: 14 tideler', '0,14')), 'tooManyDecimals')
    assert.equal(reason(TENTHS, text(3, 'Hvor mange tideler er det i 4,2? Begrunn svaret ditt.', '42 tideler. 4 hele er 40 tideler.')), null)
    assert.equal(reason(TENTHS, text(3, 'Hvor mange tideler er det i 4,2? Begrunn svaret ditt.', '6 tideler. 4 + 2 = 6.')), 'wrongSolution')
  })
})

describe('9. omgjøring mellom m, dm, cm og mm, og enhet i fasiten', () => {
  it('riktig omgjøring godtas', () => {
    assert.equal(reason(LENGTH, text(2, 'Gjør om 3,4 m til desimeter.', '34 dm')), null)
    assert.equal(reason(LENGTH, text(1, 'En linjal er 9 cm og 5 mm. Skriv lengden i centimeter som desimaltall.', '9,5 cm')), null)
  })

  it('feil omgjøring, feil enhet og svar uten enhet avvises', () => {
    assert.equal(reason(LENGTH, text(2, 'Gjør om 3,4 m til desimeter.', '3,4 dm')), 'wrongConversion')
    assert.equal(reason(LENGTH, text(2, 'Gjør om 3,4 m til desimeter.', '43 dm')), 'wrongConversion')
    assert.equal(reason(LENGTH, text(2, 'Gjør om 3,4 m til desimeter.', '34 cm')), 'wrongConversion')
    assert.equal(reason(LENGTH, text(2, 'Gjør om 3,4 m til desimeter.', '34')), 'missingUnit')
    assert.equal(reason(LENGTH, text(3, 'Et tau er 2,5 m. Forklar hvor mange centimeter det er.', '2,5 m er 25 cm, fordi 1 m er 10 cm.')), 'wrongConversion')
  })

  it('lengder i ulike enheter må gjøres om til samme enhet i løsningen', () => {
    const compare = 'Hvilken er lengst av 5,6 cm og 58 mm? Begrunn svaret.'
    assert.equal(reason(WRITE, text(2, compare, '58 mm er lengst. 5,6 cm er 56 mm, og 58 mm er mer enn 56 mm.')), null)
    assert.equal(reason(WRITE, text(2, compare, '5,6 cm er lengst, fordi 6 er mer enn 5.')), 'wrongSolution')
    assert.equal(reason(WRITE, text(2, compare, '58 mm er lengst.')), 'wrongConversion')
  })

  it('oppgaver som krever hundredeler avvises', () => {
    assert.equal(reason(LENGTH, text(2, 'Gjør om 125 cm til meter.', '1,25 m')), 'tooManyDecimals')
  })
})

describe('10. feil fasit og oppgaver utenfor øktas område avvises', () => {
  it('feil fasit og selvmotsigende løsning', () => {
    assert.equal(reason(ADD, text(2, 'Regn ut 304 − 168, og sjekk svaret ved å legge sammen.', '304 − 168 = 146. Kontroll: 146 + 168 = 314.')), 'wrongSolution')
    assert.equal(reason(ADD, text(2, 'Regn ut 304 − 168, og sjekk svaret ved å legge sammen.', '304 − 168 = 136. Hmm, vent, jeg regner på nytt.')), 'unclearSolution')
  })

  it('innhold utenfor øktas område', () => {
    // Lengder i tideløkta, hele tall i tideløkta, desimaltall i sammenhengsøkta.
    assert.equal(reason(TENTHS, text(2, 'Gjør om 2,4 m til desimeter.', '24 dm')), 'wrongArea')
    assert.equal(reason(TENTHS, text(1, 'Hva er 7 + 5?', '12')), 'wrongArea')
    assert.equal(reason(ADD, text(2, 'Bruk 1,2 + 0,5 = 1,7 til å finne 1,7 − 0,5.', '1,2')), 'offTopic')
    assert.equal(reason(LENGTH, text(2, 'Gjør om 2,4 liter til desiliter.', '24 dl')), 'offTopic')
    assert.equal(reason(TENTHS, text(1, 'Skriv brøken 3/10 som desimaltall.', '0,3')), 'offTopic')
  })

  it('negative tall, tall utenfor tallområdet og figurer som mangler', () => {
    assert.equal(reason(ADD, text(2, 'Bruk 12 − 20 = −8 til å finne −8 + 20.', '12')), 'offTopic')
    assert.equal(reason(ADD, text(1, '2 450 + 1 300 = 3 750. Bruk det til å finne 3 750 − 1 300.', '2 450')), 'outsideRange')
    assert.equal(reason(TENTHS, text(1, 'Se på figuren under. Hvor mange tideler er fargelagt? Skriv som desimaltall.', '0,4')), 'missingFigure')
  })
})

describe('11. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(TENTHS)
  const ok1 = (t: number) => story(1, `En kake er delt i 10 like store stykker. ${t} stykker er spist. Hvor stor del er spist? Skriv det som desimaltall.`, `0,${t}`)
  const ok2 = (x: number, y: number) =>
    story(2, `Hvilket av tallene 1,${x} og 0,${y} er størst? Begrunn med tideler.`, `1,${x} er størst. 1,${x} er ${10 + x} tideler, og 0,${y} er ${y} tideler.`)
  const ok3 = (h: number, t: number) =>
    story(3, `Leo sier at ${h},${t} er ${h + t} tideler. Har Leo rett? Forklar.`, `Nei. ${h},${t} er ${10 * h + t} tideler, fordi ${h} hele er ${10 * h} tideler.`)

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(4),
        // Punktum.
        story(1, 'En kake er delt i 10 like store stykker. 5 stykker er spist. Hvor stor del er spist? Skriv det som desimaltall.', '0.5'),
        ok2(2, 7),
        // 0,13 i stedet for 1,3.
        story(2, 'Hvor mye er 0,6 og 0,7 til sammen? Forklar med tideler.', '0,13. 0,6 + 0,7 = 0,13.'),
        ok3(2, 5),
        ok3(3, 4),
      ],
      [ok1(6), ok2(3, 8)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_decimalFormat, 1)
    assert.equal(final.removed_tooManyDecimals, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'tall-og-regning')
    assert.equal(final.area, 'desimaltall-tideler')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'En kake er delt i 10 like store stykker. 4 stykker er spist. Hvor stor del er spist?', '0.4')
    const { handler, calls } = scripted([[wrong, wrong, ok2(2, 7), ok2(3, 8), ok3(2, 5), ok3(3, 4)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('12. «Andre ønsker» kan ikke overstyre fagområde, nivå eller matematisk korrekthet', () => {
  const wishes = 'Bruk penger og butikk. Gjerne kroner og øre, lengder og påstander på nivå 1.'

  it('ønskene gir ikke hundredeler, et annet fagområde, et annet nivå eller feil fasit', () => {
    assert.equal(reason(TENTHS, text(2, 'En is koster 12,50 kr og en brus 8,50 kr. Hva koster de til sammen?', '21 kr. 12,50 + 8,50 = 21.'), wishes), 'tooManyDecimals')
    assert.equal(reason(TENTHS, text(2, 'Et bånd i butikken er 1,4 m. Gjør om til desimeter.', '14 dm'), wishes), 'wrongArea')
    assert.equal(reason(TENTHS, text(1, 'Kassereren sier at 1,2 er mindre enn 0,9. Har hun rett?', 'Nei. 1,2 er 12 tideler.'), wishes), 'levelMismatch')
    assert.equal(reason(TENTHS, text(2, 'I butikken veier en pose 0,7 kg og en annen 0,5 kg. Legg sammen tidelene.', '1,2'), wishes), 'offTopic')
    assert.equal(reason(TENTHS, text(2, 'Butikken har 1,4 og 0,8 kaker igjen. Legg sammen og skriv svaret som desimaltall.', '2,1. 1,4 + 0,8 = 2,1.'), wishes), 'wrongSolution')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta', () => {
    assert.equal(reason(TENTHS, text(2, 'Butikken har 1,4 og 0,8 kaker igjen. Legg sammen og skriv svaret som desimaltall.', '2,2. 1,4 + 0,8 = 2,2. 22 tideler er 2 hele og 2 tideler.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(TENTHS), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('«bruk penger» ikke kroner og øre i en økt om tideler'))
  })
})

describe('13. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de fem andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(hash(file('problemlosing')), '380ddf92250336a8')
    assert.equal(referenceBanks.filter((r) => r.topic !== 'tall-og-regning').length, 54 + 45 + 36 + 36 + 36)
    for (const [area, level, own] of [['tabell-6-7-8-9', 2, multiplicationReferences], ['multiplikasjon-divisjon', 2, divisionReferences], ['addisjon-subtraksjon', 1, placeValueReferences]] as const) {
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(own, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene og arbeidsarkene er uendret – i repetisjon bare oppgavene fra Tall og regning', () => {
    const all = unitSpecs.filter((u) => u.unitId !== 'tall-og-regning').flatMap((u) => planned(u.unitId))
    const touched = (s: Planned) => s.skills.some((k) => k.startsWith('tr.'))
    const others = all.filter((s) => !touched(s)).map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))
    assert.equal(others.length, 76)
    assert.equal(hash(JSON.stringify(others)), '79eb6494412dbd1c')
    // De to repetisjonsøktene: samme overskrift, undertema, antall oppgaver, og oppgavene fra Problemløsing er de samme.
    const v3 = all.find((s) => s.id === 'repetisjon-vinter-3')!
    assert.deepEqual(v3.skills, ['prob.flersteg', 'tr.add-sub', 'tr.mult-div'])
    const prob = buildTasks(v3).filter((t) => v3.skills[(Number(t.id.split('-').at(-1)) - 1) % v3.skills.length] === 'prob.flersteg')
    assert.equal(hash(JSON.stringify(prob)), '6bb905c32fd8d01b')
    assert.equal(buildTasks(all.find((s) => s.id === 'repetisjon-vinter-4')!).length, 15)
    assert.equal(hash(JSON.stringify(worksheetTasks)), 'd20a8f714743442c')
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })

  it('kontrollene for Tall og regning gjelder ikke Divisjon, og Divisjon kontrollerer som før', () => {
    // I Divisjon er tallområdet gangetabellen (tiere er utenfor), og regnefamilien kontrolleres med gange og dele.
    const ctx = { area: 'multiplikasjon-divisjon' as const }
    assert.equal(divisionProblem(text(2, 'Du vet at 6 · 40 = 240. Bruk det til å skrive to delestykker med svar.', '240 : 6 = 40 og 240 : 40 = 6.'), ctx), 'outsideTables')
    assert.equal(divisionProblem(text(1, 'Bruk tallene 4, 6 og 24. Skriv de to divisjonsstykkene som hører til.', '24 : 4 = 6 og 24 : 6 = 4'), ctx), null)
    assert.equal(divisionProblem(text(1, 'Bruk tallene 4, 6 og 25. Skriv de to divisjonsstykkene som hører til.', '25 : 4 = 6'), ctx), 'wrongSolution')
  })
})
