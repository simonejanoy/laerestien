// Tester for referansebanken og AI-genereringen i Divisjon: banken, koblingen mellom øktene og
// fagområdene, utvalget, kontrollene (sammenheng med gange, divisjonstype, rest, modeller, fasit),
// utfyllingen, «Andre ønsker» og at andre temaer er uendret.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { DIVISION_AREAS, parseTaskResult, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { tasksFor } from '../src/features/topics/yearPlan.ts'
import { divisionOf, divisionProblem, divisionTypeOf, statedAnswer, usesModel, type DivisionContext } from './divisionChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { DIVISION_REFERENCE_COUNT, divisionBankFile, divisionReferences } from './references/division.ts'
import { multiplicationBankFile, multiplicationReferences } from './references/multiplication.ts'
import { placeValueBankFile, placeValueReferences } from './references/placeValue.ts'
import { referenceDivisionType, selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { checkEquations, DIVISION_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(divisionBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

const sessions = planned('divisjon')
const session = (id: string) => sessions.find((s) => s.id === id)!

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Divisjon', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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
  const { area, secondaryAreas, divisionType } = s.profile!
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: area!, secondaryAreas, divisionType, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

const text = (level: AiLevel, studentText: string, solution: string, adaptation = ''): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation })
const math = (level: AiLevel, a: number, operator: '+' | '-' | '*' | '/', b: number, instruction = 'Regn ut.'): AiTaskDraft => ({
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
const ctx = (s: Planned): DivisionContext => ({ area: s.profile!.area as DivisionContext['area'], secondaryAreas: s.profile!.secondaryAreas as DivisionContext['secondaryAreas'], divisionType: s.profile!.divisionType })
/** Årsaken kontrollen gir én oppgave i økta, eller null når den godtas. */
const problem = (id: string, task: AiTaskDraft) => divisionProblem(task, ctx(session(id)))
/** Årsaken hele kandidatkontrollen gir (med referanser og oppgavesett), eller null når oppgaven godtas. */
const reason = (id: string, task: AiTaskDraft, wishes = '') => checkCandidates([task], serverRequest(session(id), wishes)).rejected[0]?.reason ?? null

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit, kompetansemaal: '', tilpasning: 'Nivå med støtte.' })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const generate = async (): Promise<GenerateResult> => {
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-div', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('referansebanken for Divisjon', () => {
  it('1. inneholder 36 unike referanser, importert uendret og godkjent av valideringen', () => {
    const raw = bankJson()
    assert.equal(DIVISION_REFERENCE_COUNT, 36)
    assert.equal(raw.referenceCount, 36)
    assert.equal(divisionReferences.length, 36)
    assert.equal(new Set(divisionReferences.map((r) => r.id)).size, 36)
    assert.deepEqual(validateReferenceBank(raw, 36, DIVISION_BANK).errors, [])
    // Alle feltene er beholdt: ID, nivå, område, oppgavetype, elevtekst, fasit, lærernotat og hensikt.
    assert.deepEqual(divisionReferences, raw.references)
    for (const ref of divisionReferences) {
      assert.match(ref.id, /^D[1-4]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'divisjon')
      for (const field of ['format', 'studentText', 'solution', 'purpose'] as const) assert.ok(ref[field].trim(), `${ref.id}: ${field}`)
    }
    // Hele banken er med i den samlede banken serveren velger fra.
    assert.equal(referenceBanks.filter((r) => r.topic === 'divisjon').length, 36)
  })

  it('2. hvert av de fire fagområdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...new Set(divisionReferences.map((r) => r.area))], [...DIVISION_AREAS])
    for (const area of DIVISION_AREAS) {
      for (const level of [1, 2, 3]) {
        assert.equal(divisionReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
      }
    }
  })

  it('valideringen kontrollerer divisjon med rest i fasit og lærernotat', () => {
    assert.deepEqual(checkEquations('14 : 4 = 3 rest 2.').errors, [])
    assert.deepEqual(checkEquations('48 : 7 = 6 med 6 til overs').errors, [])
    assert.equal(checkEquations('14 : 4 = 3 rest 1').errors.length, 1)
    const broken = bankJson()
    broken.references[18].teacherNote = '14 : 4 = 2 rest 6.'
    assert.ok(validateReferenceBank(broken, 36, DIVISION_BANK).errors.some((e) => e.includes('D3-N1-01')))
  })

  it('referanse-ID-ene fra divisjonsbanken vises aldri i synlige felt', () => {
    assert.ok(containsInternalText('Lag en oppgave som D3-N2-01.'))
  })
})

describe('3. øktene i Divisjon og fagområdene', () => {
  it('beholder åtte økter med samme ID-er og overskrifter, og kobler hver økt til riktig fagområde', () => {
    const mapping = sessions.map((s) => [s.id, s.heading, s.profile?.area, s.profile?.divisionType ?? '', (s.profile?.secondaryAreas ?? []).join(',')])
    assert.deepEqual(mapping, [
      ['divisjon-1', 'Multiplikasjon og divisjon henger sammen', 'multiplikasjon-divisjon', '', ''],
      ['divisjon-2', 'Dele med gangetabellen', 'multiplikasjon-divisjon', '', ''],
      ['divisjon-3', 'Delingsdivisjon – dele likt', 'delingsdivisjon-malingsdivisjon', 'deling', ''],
      ['divisjon-4', 'Målingsdivisjon – hvor mange grupper?', 'delingsdivisjon-malingsdivisjon', 'maling', ''],
      ['divisjon-5', 'Divisjon med noe til overs', 'divisjon-med-rest', '', ''],
      ['divisjon-6', 'Rest i hverdagen', 'divisjon-med-rest', '', ''],
      ['divisjon-7', 'Bruke modeller i divisjon', 'modeller', '', ''],
      ['divisjon-8', 'Dette mestrer jeg – divisjon', 'multiplikasjon-divisjon', '', 'delingsdivisjon-malingsdivisjon,divisjon-med-rest,modeller'],
    ])
  })

  it('velger bare referanser fra øktas fagområde og nivå – og riktig divisjonstype', () => {
    for (const s of sessions.filter((x) => !x.profile?.secondaryAreas)) {
      const { area, divisionType } = s.profile!
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: area!, level, seed, divisionType })
          assert.ok(chosen.length > 0 && chosen.length <= 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.area === area && r.level === level), `${s.id} nivå ${level}`)
          if (divisionType) assert.ok(chosen.every((r) => [null, divisionType].includes(referenceDivisionType(r))), `${s.id} nivå ${level}`)
        }
      }
    }
    assert.deepEqual(selectReferences(referenceBanks, { area: 'delingsdivisjon-malingsdivisjon', level: 1, seed: 4, divisionType: 'maling' }).map((r) => r.id), ['D2-N1-02'])
    assert.deepEqual(
      selectReferences(referenceBanks, { area: 'delingsdivisjon-malingsdivisjon', level: 1, seed: 4, divisionType: 'deling' }).map((r) => r.id).sort(),
      ['D2-N1-01', 'D2-N1-03'],
    )
  })

  it('oppsummeringsøkta får to referanser fra hovedområdet og én fra et tilgrensende område', () => {
    const s = session('divisjon-8')
    for (const level of [1, 2, 3] as const) {
      const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level, seed: 7 })
      assert.equal(chosen.length, 3)
      assert.equal(chosen.filter((r) => r.area === 'multiplikasjon-divisjon').length, 2)
      assert.ok(chosen.every((r) => r.topic === 'divisjon' && r.level === level))
    }
  })

  it('serveren sender referansene fra banken og sporer område, tema og referanse-ID-er', async () => {
    const s = session('divisjon-4')
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const oppgaver = ([1, 2, 3] as const).flatMap((level) => [
        story(level, `${level * 6 + 6} binders legges i esker med 6 i hver. Hvor mange esker blir det?`, `${level + 1} esker`),
        story(level, `${level * 10 + 5} knapper legges i skåler med 5 i hver. Hvor mange skåler blir det?`, `${level * 2 + 1} skåler`),
      ])
      const body = JSON.stringify({ melding: '', oppgaver })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(result.meta?.area, 'delingsdivisjon-malingsdivisjon')
    assert.equal(result.meta?.topic, 'divisjon')
    for (const level of ['1', '2', '3'] as const) {
      const ids = result.meta?.referenceIds?.[level] ?? []
      assert.ok(ids.length > 0 && ids.every((id) => id.startsWith(`D2-N${level}-`)), `nivå ${level}: ${ids}`)
      assert.ok(ids.every((id) => referenceDivisionType(divisionReferences.find((r) => r.id === id)!) !== 'deling'), `nivå ${level}: ${ids}`)
    }
    assert.ok(prompt.includes('Hovedtema: Divisjon'))
    assert.ok(prompt.includes('Fagområde: Delingsdivisjon og målingsdivisjon'))
    assert.ok(prompt.includes('Alle oppgavene skal være målingsdivisjon'))
    assert.ok(prompt.includes('Alle delestykkene skal gå opp'))
    assert.ok(!prompt.includes('D2-N1-01'), 'en referanse om delingsdivisjon ble sendt til en økt om målingsdivisjon')
    assert.equal(logs.at(-1)?.topic, 'divisjon')
    assert.equal(result.tasks.length, 6)
  })

  it('nivåene i økta får egne beskrivelser og samme tallområde og støttestruktur i appen og hos AI-en', () => {
    const s = session('divisjon-3')
    const levels = levelsFor(s, 5, 6)
    assert.equal(levels[0].title, 'Dele likt med støtte')
    const contexts = buildLevelContexts(levels, buildTasks(s), s.profile)
    assert.ok(contexts.every((c) => c.numbers && c.support && c.referenceTasks.length === 0 && c.existing!.length > 0))
  })
})

describe('grunnoppgavene i Divisjon', () => {
  it('alle grunnoppgavene laget av årsplanen passer kontrollene i sin egen økt', () => {
    for (const s of sessions) {
      for (const t of buildTasks(s)) {
        const draft =
          t.kind === 'text'
            ? text(t.level, t.text, t.solution)
            : ({ format: 'math', level: t.level, taskType: t.type, instruction: t.instruction, a: t.a, operator: t.operator, b: t.b, competenceGoal: '', adaptation: '' } as AiTaskDraft)
        assert.equal(divisionProblem(draft, ctx(s)), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
      }
    }
  })

  it('øktene om delingsdivisjon og målingsdivisjon har bare sin egen type, og ingen rene gangestykker', () => {
    const typeOf = (id: string) =>
      [...(worksheetTasks[id] ?? []), ...buildTasks(session(id))].map((t) => (t.kind === 'text' ? divisionTypeOf(t.text) : t.operator === '*' ? 'gange' : divisionTypeOf(t.instruction)))
    assert.ok(!typeOf('divisjon-3').some((t) => t === 'maling' || t === 'gange'))
    assert.ok(!typeOf('divisjon-4').some((t) => t === 'deling' || t === 'gange'))
  })

  it('modelløkta har bare oppgaver der eleven bruker eller tolker en modell', () => {
    const tasks = [...(worksheetTasks['divisjon-7'] ?? []), ...buildTasks(session('divisjon-7'))]
    assert.equal(tasks.length, 15)
    assert.ok(tasks.every((t) => t.kind === 'text' && usesModel(t.text)))
  })

  it('«Rest i hverdagen» har både hele grupper med rest og situasjoner der svaret må rundes opp', () => {
    const tasks = buildTasks(session('divisjon-6')).filter((t) => t.kind === 'text')
    assert.ok(tasks.some((t) => t.kind === 'text' && /trengs|bestille/.test(t.text)))
    assert.ok(tasks.some((t) => t.kind === 'text' && /hele|fulle/.test(t.text)))
    assert.ok(!tasks.some((t) => t.kind === 'text' && /\b1 (kaker|gulrøtter|bilder)\b/.test(t.solution)))
  })

  it('arket i økt 1 har ikke lenger et rent gangestykke med tosifrede tall', () => {
    assert.ok(!(worksheetTasks['divisjon-1'] ?? []).some((t) => t.kind === 'text' && t.text.includes('16 · 18')))
  })
})

describe('4. referanser kopieres ikke', () => {
  const s = 'divisjon-5'
  const ref = divisionReferences.find((r) => r.id === 'D3-N2-01')!

  it('ordrett, med nye tall eller med samme tall og omskrevet ordlyd avvises', () => {
    assert.equal(reason(s, text(2, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(s, text(2, '33 muffins legges i esker med 6 muffins i hver. Hvor mange fulle esker blir det, og hvor mange muffins blir til overs?', '5 fulle esker og 3 muffins til overs')), 'copiedReference')
    assert.equal(reason(s, text(2, 'Vi har 26 muffins og 6 i hver eske. Hvor mange esker blir helt fulle, og hvor mange muffins er igjen?', '4 fulle esker og 2 muffins igjen')), 'copiedReference')
  })

  it('en ny oppgave med egen formulering og nye tall godtas', () => {
    assert.equal(reason(s, text(2, 'Klassen har 39 blyanter. De settes i kopper med 5 i hver. Hvor mange kopper blir helt fulle, og hvor mange blyanter er igjen?', '7 fulle kopper og 4 blyanter igjen')), null)
  })
})

describe('5. multiplikasjon og divisjon kobles matematisk korrekt', () => {
  const s = 'divisjon-1'

  it('en korrekt sammenheng godtas', () => {
    assert.equal(reason(s, text(1, '5 · 7 = 35. Derfor er 35 : 5 = __.', '7')), null)
    // Samme gangefakta som referansen D1-N2-02 («Regn ut 56 : 8 …»), men i et annet format: ikke en kopi.
    assert.equal(reason(s, text(2, 'Hvilket tall mangler i gangestykket __ · 8 = 56?', '7')), null)
    assert.equal(reason(s, text(2, 'Lag en regnefamilie med tallene 4, 9 og 36.', '4 · 9 = 36, 9 · 4 = 36, 36 : 4 = 9 og 36 : 9 = 4')), null)
    assert.equal(reason(s, math(1, 30, '/', 5, 'Regn ut. Hvilket gangestykke hjelper deg?')), null)
  })

  it('feil kobling, feil regnefamilie og manglende sammenheng avvises', () => {
    assert.equal(reason(s, text(1, '5 · 7 = 35. Derfor er 35 : 7 = __.', '7')), 'wrongSolution')
    assert.equal(reason(s, text(2, 'Bruk tallene 6, 7 og 48. Skriv to divisjonsstykker.', '48 : 6 = 8 og 48 : 8 = 6')), 'wrongSolution')
    assert.equal(reason(s, text(2, 'Bruk tallene 4, 9 og 36. Skriv to divisjonsstykker.', '36 : 4 = 9 og 36 : 6 = 6')), 'wrongSolution')
    assert.equal(reason(s, text(2, 'Regn ut 42 : 6.', '7')), 'missingRelation')
    assert.equal(reason(s, math(1, 30, '/', 5)), 'missingRelation')
    assert.equal(reason(s, math(1, 6, '*', 5)), 'missingRelation')
  })
})

describe('6. delingsdivisjon og målingsdivisjon skilles', () => {
  it('spørsmålet avgjør typen', () => {
    assert.equal(divisionTypeOf('24 blyanter deles likt mellom 6 elever. Hvor mange blyanter får hver elev?'), 'deling')
    assert.equal(divisionTypeOf('18 klosser deles i 3 like store grupper. Hvor mange klosser er det i hver gruppe?'), 'deling')
    assert.equal(divisionTypeOf('Det er 20 epler. Det skal være 5 epler i hver pose. Hvor mange poser trengs?'), 'maling')
    assert.equal(divisionTypeOf('Hvor mange bord trengs når det sitter 6 ved hvert bord?'), 'maling')
    assert.equal(divisionTypeOf('Løs begge og skriv hva tallet 4 betyr.'), null)
  })

  it('økta om delingsdivisjon godtar bare delingsdivisjon, og omvendt', () => {
    const deling = text(2, '42 kort fordeles likt mellom 7 barn. Hvor mange kort får hvert barn?', '6 kort')
    const maling = text(2, '42 kort legges i bunker med 7 kort i hver. Hvor mange bunker blir det?', '6 bunker')
    assert.equal(reason('divisjon-3', deling), null)
    assert.equal(reason('divisjon-3', maling), 'wrongDivisionType')
    assert.equal(reason('divisjon-4', maling), null)
    assert.equal(reason('divisjon-4', deling), 'wrongDivisionType')
    assert.equal(reason('divisjon-3', math(1, 15, '/', 3, 'Du har 15 baller og legger 3 i hver kurv. Hvor mange kurver blir det?')), 'wrongDivisionType')
  })

  it('oppgavetekst, fasit og tilpasning må være enige om typen', () => {
    const task = '45 perler brukes til armbånd med 9 perler på hvert. Hvor mange armbånd kan lages? Er dette delingsdivisjon eller målingsdivisjon?'
    assert.equal(problem('divisjon-4', text(3, task, '5 armbånd. Dette er målingsdivisjon.')), null)
    assert.equal(problem('divisjon-4', text(3, task, '5 armbånd. Dette er delingsdivisjon.')), 'wrongDivisionType')
    assert.equal(problem('divisjon-8', text(3, task, '5 armbånd. Dette er delingsdivisjon.')), 'wrongDivisionType')
    assert.equal(problem('divisjon-4', text(2, '42 kort legges i bunker med 7 kort i hver. Hvor mange bunker blir det?', '6 bunker', 'Delingsdivisjon med støtte.')), 'wrongDivisionType')
  })
})

describe('7. rest og nødvendig avrunding oppover', () => {
  const s = 'divisjon-6'

  it('hele grupper og rest: 26 boller i esker med 6 gir 4 fulle esker og 2 til overs', () => {
    const task = '26 boller legges i esker med 6 i hver. Hvor mange fulle esker blir det, og hvor mange boller blir til overs?'
    assert.equal(problem(s, text(2, task, '4 fulle esker og 2 boller til overs')), null)
    assert.equal(problem(s, text(2, task, '5 esker')), 'wrongRemainder')
    assert.equal(problem(s, text(2, task, '4 fulle esker')), 'wrongSolution')
    assert.equal(problem(s, text(2, task, '4 fulle esker og 3 boller til overs')), 'wrongSolution')
  })

  it('når alle skal være med, må svaret rundes opp: 22 elever i biler med plass til 5 trenger 5 biler', () => {
    const task = '22 elever skal kjøre i biler med plass til 5 i hver. Hvor mange biler trengs for at alle skal være med?'
    assert.equal(problem(s, text(2, task, '5 biler (22 : 5 = 4 rest 2, så det trengs én bil til)')), null)
    assert.equal(problem(s, text(2, task, '4 biler og 2 elever til overs')), 'wrongRemainder')
    assert.equal(problem(s, text(2, task, '4 rest 2')), 'wrongRemainder')
    assert.equal(problem(s, text(2, task, '6 biler')), 'wrongSolution')
    assert.equal(statedAnswer('5 biler (22 : 5 = 4 rest 2)'), 5)
  })

  it('rest i en økt der delingen skal gå opp avvises, og en økt om rest krever rest', () => {
    assert.equal(problem('divisjon-3', text(2, '27 kort fordeles likt mellom 4 barn. Hvor mange kort får hvert barn, og hvor mange blir til overs?', '6 kort til hvert barn og 3 til overs')), 'wrongRemainder')
    assert.equal(problem('divisjon-5', text(2, '24 kort fordeles likt mellom 4 barn. Hvor mange kort får hvert barn?', '6 kort')), 'wrongRemainder')
    assert.equal(problem('divisjon-5', math(1, 24, '/', 4)), 'wrongRemainder')
    // Oppsummeringsøkta har rest som tilgrensende område.
    assert.equal(problem('divisjon-8', text(2, '27 kort fordeles likt mellom 4 barn. Hvor mange kort får hvert barn, og hvor mange blir til overs?', '6 kort til hvert barn og 3 til overs')), null)
  })
})

describe('8. modelloppgaver krever en faktisk representasjon', () => {
  const s = 'divisjon-7'

  it('ordet «modell» alene er ikke nok', () => {
    assert.equal(problem(s, text(1, 'Tegn en modell og regn ut 24 : 6.', '4')), 'missingModel')
    assert.equal(problem(s, text(2, 'Bruk modellen til å finne svaret: 35 : 5 = __.', '7')), 'missingModel')
    assert.equal(problem(s, math(2, 32, '/', 4, 'Tegn en modell, og regn ut.')), 'missingModel')
  })

  it('like grupper, tallinje, rutenett og blokkmodell godtas', () => {
    assert.equal(problem(s, text(1, 'Tegn 3 ringer og fordel 21 prikker likt i dem. Hvor mange prikker blir det i hver ring?', '7 prikker')), null)
    assert.equal(problem(s, text(1, 'Hopp 3 om gangen fra 0 til 18 på tallinjen. Hvor mange hopp blir det?', '6 hopp')), null)
    assert.equal(problem(s, text(2, 'Et rutenett har 30 ruter og 5 rader. Hvor mange ruter er det i hver rad?', '6 ruter. 30 : 5 = 6.')), null)
    assert.equal(problem(s, text(2, 'En blokk med totalen 48 er delt i 6 like store deler. Hvilket tall står i hver del?', '8')), null)
    assert.equal(problem(s, text(3, 'Vis 54 : 9 med to ulike modeller. Forklar hva 9 og svaret betyr i hver modell.', '6. Modellene viser 54 delt i grupper på 9.')), null)
    assert.equal(problem(s, math(1, 24, '/', 4, 'Hopp 4 og 4 på tallinjen fra 0 til 24. Hvor mange hopp blir det?')), null)
  })

  it('modellen må gi riktig svar', () => {
    assert.equal(problem(s, text(2, 'En blokk med totalen 48 er delt i 6 like store deler. Hvilket tall står i hver del?', '6')), 'wrongSolution')
  })
})

describe('9. feil fasit, divisjon på null og oppgaver utenfor økta avvises', () => {
  it('feil fasit', () => {
    assert.equal(reason('divisjon-3', text(1, '24 blyanter deles likt mellom 6 elever. Hvor mange blyanter får hver elev?', '5 blyanter')), 'wrongSolution')
    assert.equal(reason('divisjon-2', text(2, '7 · 8 = 56. Derfor er 56 : 8 = __.', '8')), 'wrongSolution')
    // Tallene i instruksjonen må være de samme som i regnestykket.
    assert.equal(reason('divisjon-3', math(1, 24, '/', 4, 'Del 24 kort likt på 6 barn. Hvor mange får hvert barn?')), 'wrongSolution')
  })

  it('divisjon på null', () => {
    assert.equal(reason('divisjon-2', text(1, 'Regn ut 12 : 0. Hvilket gangestykke hjelper deg?', '0')), 'divisionByZero')
    assert.equal(reason('divisjon-3', text(1, 'Del 12 epler likt på 0 barn. Hvor mange får hvert barn?', '0')), 'divisionByZero')
    assert.equal(parseTaskResult({ oppgaver: [{ nivaa: 1, format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', tall1: 12, regneart: ':', tall2: 0 }] })!.tasks.length, 0)
  })

  it('innhold utenfor divisjon, desimaltall, negative tall og tall utenfor gangetabellen', () => {
    assert.equal(reason('divisjon-3', text(2, 'Ola har 23 kort og får 15 til. Hvor mange kort har Ola nå?', '38 kort')), 'offTopic')
    assert.equal(reason('divisjon-3', math(2, 23, '+', 15)), 'offTopic')
    assert.equal(reason('divisjon-4', text(2, '3 poser har 4 epler i hver. Hvor mange epler er det til sammen?', '12 epler')), 'offTopic')
    assert.equal(reason('divisjon-3', text(2, '7,5 liter saft deles likt på 3 kanner. Hvor mye blir det i hver kanne?', '2,5 liter')), 'offTopic')
    assert.equal(reason('divisjon-3', text(2, 'Temperaturen −12 grader deles på 3. Hva blir det?', '−4')), 'offTopic')
    assert.equal(reason('divisjon-3', text(2, '84 kort deles likt mellom 4 barn. Hvor mange kort får hvert barn?', '21 kort')), 'outsideTables')
    assert.equal(reason('divisjon-2', text(2, 'Regn ut 96 : 12. Hvilket gangestykke hjelper deg?', '8, fordi 8 · 12 = 96')), 'outsideTables')
  })
})

describe('10. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session('divisjon-6')
  const ok = (level: AiLevel, total: number, d: number, noun: string, box: string) => {
    const [q, r] = [Math.floor(total / d), total % d]
    return story(level, `${total} ${noun} pakkes i ${box} med ${d} i hver. Hvor mange ${box} blir helt fulle, og hvor mange ${noun} er igjen?`, `${q} fulle ${box} og ${r} ${noun} igjen`)
  }

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok(1, 17, 4, 'kanelboller', 'kurver'),
        ok(1, 23, 5, 'klinkekuler', 'poser'),
        ok(2, 38, 6, 'tusjer', 'esker'),
        // Rest-svar der alle skal være med (skal rundes opp).
        story(2, '33 barn skal ro i båter med plass til 4 i hver. Hvor mange båter trengs for at alle skal være med?', '8 båter og 1 barn til overs'),
        ok(3, 61, 7, 'frimerker', 'ark'),
        // Går opp – ikke rest.
        story(3, '56 kopper settes på brett med 8 på hvert. Hvor mange brett blir det?', '7 brett'),
      ],
      [story(2, 'Klassen på 29 elever skal på tur. Hver taxi tar 4 elever. Hvor mange taxier må de bestille?', '8 taxier (29 : 4 = 7 rest 1)'), ok(3, 52, 8, 'bilder', 'sider')],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_wrongRemainder, 2)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'divisjon')
    assert.equal(final.area, 'divisjon-med-rest')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, '20 epler legges i poser med 5 i hver. Hvor mange poser blir det?', '4 poser')
    const { handler, calls } = scripted([[wrong, wrong, ok(2, 38, 6, 'tusjer', 'esker'), ok(2, 45, 7, 'kort', 'bunker'), ok(3, 61, 7, 'frimerker', 'ark'), ok(3, 52, 8, 'bilder', 'sider')], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('11. «Andre ønsker» kan ikke overstyre fagområde, nivå eller matematisk korrekthet', () => {
  const wishes = 'Lag tekstoppgaver om fotball. Gjerne med rest, store tall og målingsdivisjon.'

  it('ønskene endrer ikke divisjonstype, rest, tallområde, fasit eller nivå', () => {
    assert.equal(reason('divisjon-3', text(2, '40 fotballer legges i nett med 8 i hver. Hvor mange nett blir det?', '5 nett'), wishes), 'wrongDivisionType')
    assert.equal(reason('divisjon-3', text(2, '30 fotballer fordeles likt på 4 lag. Hvor mange får hvert lag, og hvor mange blir til overs?', '7 fotballer og 2 til overs'), wishes), 'wrongRemainder')
    assert.equal(reason('divisjon-3', text(2, '96 fotballer fordeles likt på 4 lag. Hvor mange fotballer får hvert lag?', '24 fotballer'), wishes), 'outsideTables')
    assert.equal(reason('divisjon-3', text(2, '40 fotballer fordeles likt på 8 lag. Hvor mange fotballer får hvert lag?', '6 fotballer'), wishes), 'wrongSolution')
    assert.equal(reason('divisjon-7', text(2, 'Lag en modell av fotballkampen og regn ut 45 : 9.', '5'), wishes), 'missingModel')
    assert.equal(reason('divisjon-3', text(1, 'Treneren sier at 40 : 8 = 6. Har treneren rett?', 'Nei. 40 : 8 = 5.'), wishes), 'levelMismatch')
  })

  it('ønskene kan endre kontekst og format innenfor økta', () => {
    assert.equal(reason('divisjon-3', text(2, '40 fotballer fordeles likt på 8 lag. Hvor mange fotballer får hvert lag?', '5 fotballer'), wishes), null)
    const prompt = taskPrompt(serverRequest(session('divisjon-3'), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('Alle oppgavene skal være delingsdivisjon'))
  })
})

describe('12. andre temaer og referansebanker er uendret', () => {
  it('bankene for Multiplikasjon og Tall og plassverdi er byte for byte uendret', () => {
    const hash = (file: URL) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
    assert.equal(hash(multiplicationBankFile), '4e3e3970c12f95a6')
    assert.equal(hash(placeValueBankFile), '21ba85a512aeffed')
    assert.equal(multiplicationReferences.length, 54)
    assert.equal(placeValueReferences.length, 45)
    assert.equal(referenceBanks.filter((r) => !['geometri', 'problemlosing', 'tall-og-regning', 'maling', 'monster-og-algoritmer', 'regning'].includes(r.topic)).length, 54 + 45 + 36)
  })

  it('utvalget i de andre bankene er det samme som før (ingen divisjonstype, ingen divisjonsreferanser)', () => {
    for (const [area, level] of [['tabell-6-7-8-9', 2], ['hoderegning', 3]] as const) {
      const all = selectReferences(referenceBanks, { area, level, seed: 11 })
      const own = selectReferences(area === 'hoderegning' ? placeValueReferences : multiplicationReferences, { area, level, seed: 11 })
      assert.deepEqual(all.map((r) => r.id), own.map((r) => r.id))
    }
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })

  it('divisjon uten divisjonstype (repetisjon og Strategier i divisjon) blander de to typene som før', () => {
    const level3 = tasksFor(['div.delings-malings'], 3, 0)
    const types = level3.map((t) => (Array.isArray(t) ? divisionTypeOf(t[4]) : null))
    assert.ok(types.includes('deling') && types.includes('maling'))
    assert.ok(tasksFor(['div.delings-malings'], 1, 0).every((t) => Array.isArray(t) && t[4].includes('klistremerker')))
  })

  it('kontrollene for Tall og plassverdi gjelder ikke divisjon, og divisjonskontrollene gjelder ikke andre temaer', () => {
    // Avrunding er bare utenfor temaet i Tall og plassverdi.
    assert.equal(problem('divisjon-6', text(2, '23 barn skal i båter med plass til 5. Hvor mange båter trengs for at alle skal få plass?', '5 båter')), null)
    assert.equal(divisionOf('Ola har 4 · 3 epler.'), null)
  })
})

describe('lærerens ønske om at alle skal få plass', () => {
  const wish = 'Lag oppgaver der alle elevene må få plass i biler eller busser, slik at antall kjøretøy må rundes opp.'
  // Kandidaten AI-en laget i nettlesertesten.
  const aiText = '22 barn skal sitte på i biler med plass til 4 barn i hver bil. Hvor mange fulle biler blir det, og hvor mange barn blir til overs?'
  const aiSolution = '5 fulle biler og 2 barn til overs.'
  const fullGroups = text(1, aiText, aiSolution)

  it('avviser «hele grupper og noe til overs» når læreren ba om at alle skal få plass (avviket fra nettlesertesten)', () => {
    assert.equal(reason('divisjon-5', fullGroups, wish), 'wrongRemainder')
    // Generelt – ikke bare 22 og 4.
    const other = text(2, '45 elever skal reise med minibusser med 8 seter i hver. Hvor mange fulle busser blir det, og hvor mange elever er igjen?', '5 fulle busser og 5 elever igjen')
    assert.equal(reason('divisjon-6', other, wish), 'wrongRemainder')
    assert.equal(reason('divisjon-6', other, 'Alt som skal fraktes, må få plass. Svaret skal rundes opp.'), 'wrongRemainder')
    // Flere tall i situasjonen (delestykket kan ikke leses sikkert): spørsmålet om hele grupper avvises likevel.
    const many = text(3, '3 klasser med 18, 19 og 20 elever skal kjøre buss med 30 seter. Hvor mange fulle busser blir det, og hvor mange elever blir til overs?', '1 full buss og 27 elever til overs')
    assert.equal(reason('divisjon-6', many, wish), 'wrongRemainder')
  })

  it('godtar oppgaver som spør hvor mange som trengs, og krever at fasiten runder opp', () => {
    const needed = '22 barn skal kjøre til svømmehallen. Hver bil har plass til 4 barn. Hvor mange biler må de ha for at alle skal få plass?'
    assert.equal(reason('divisjon-5', text(1, needed, '6 biler (22 : 4 = 5 rest 2, så det trengs én bil til)'), wish), null)
    assert.equal(reason('divisjon-5', text(1, needed, '5 biler'), wish), 'wrongRemainder')
    assert.equal(reason('divisjon-6', text(2, '45 elever skal reise med minibusser med 8 seter i hver. Hvor mange busser trengs?', '6 busser'), wish), null)
  })

  it('vanlige restoppgaver er fortsatt tillatt uten et slikt ønske', () => {
    assert.equal(reason('divisjon-5', fullGroups), null)
    assert.equal(reason('divisjon-5', fullGroups, 'Bruk gjerne fotball som tema.'), null)
  })

  it('utfyllingen erstatter kandidaten og leverer nøyaktig bestilt antall', async () => {
    const s = session('divisjon-6')
    const box = (level: AiLevel, total: number, d: number) =>
      story(level, `${total} elever skal på tur. Hver minibuss har ${d} seter. Hvor mange minibusser må skolen bestille?`, `${Math.ceil(total / d)} minibusser`)
    const { handler, logs, calls } = scripted([
      [
        story(1, aiText, aiSolution),
        box(1, 17, 5),
        box(2, 38, 6),
        box(2, 47, 6),
        box(3, 61, 7),
        box(3, 52, 9),
      ],
      [box(1, 23, 4)],
    ])
    const result = await handler(appRequest(s, wish), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.ok(!JSON.stringify(result.tasks).includes('fulle biler'))
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_wrongRemainder, 1)
    assert.equal(final.delivered, true)
  })
})
