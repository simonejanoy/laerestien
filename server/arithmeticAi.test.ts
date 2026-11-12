// Tester for referansebanken og AI-genereringen i Regning: banken, koblingen mellom de seks øktene og de fire
// fagområdene, utvalget, dataformatet i prompten, kontrollene (diagrammer med ■ og skala, tabeller, regneart, overslag og
// ukjent tall □), grunnoppgavene, visningen av diagrammer og tabeller, utfyllingen, «Andre ønsker» og at andre temaer er
// uendret. Ingen ekte Gemini-kall, og ingen tester som avhenger av en bestemt formulering fra Gemini. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { ARITHMETIC_AREAS, AREA_TITLES, topicOfArea, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { toSessionTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, summarizeExisting, toAiProfile } from '../src/ai/referenceTasks.ts'
import { asksExplanation, hasDataBlock, labelsIn, questionsIn, withoutQuestions, isBoxEquationLine, isDataLine, lettered, operatorTemplate, readDataBlock, slotCount, textBlocks, withoutOperatorChoices } from '../src/ai/taskText.ts'
import { applyRevision } from '../src/ai/drafts.ts'
import { formatExpected, isCorrect, partCorrect, type ExpectedAnswer } from '../src/ai/patternDisplay.ts'
import { readStoredTask } from '../src/features/sessions/taskStorage.ts'
import { checkTextAnswer, initialTextState, showsSolution, textSlots, typeInSlot } from '../src/features/student/studentTasks.ts'
import { refreshStoredTasks } from '../src/features/sessions/sessionTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import { arithmeticProblem, kindOf } from './arithmeticChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { ARITHMETIC_REFERENCE_COUNT, arithmeticBankFile, arithmeticDataFormat, arithmeticReferences } from './references/arithmetic.ts'
import { referenceBanks } from './references/banks.ts'
import { numbersAndOperationsReferences } from './references/numbersAndOperations.ts'
import { problemSolvingReferences } from './references/problemSolving.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { ARITHMETIC_BANK, checkEquations, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(arithmeticBankFile, 'utf8')) as { referenceCount: number; dataFormat: string; references: ReferenceTask[] }

const sessions = planned('regning')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [DIAGRAMS, TABLES, OPERATIONS, WORD_PROBLEMS, UNKNOWN, EQUALITY] = [1, 2, 3, 4, 5, 6].map((n) => `regning-${n}`)

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Regning', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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
  request.levels = request.levels!.map((l) => ({ ...l, referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, level: l.level, seed: 1 }).map(toAiReference) }))
  return request
}

const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
/** Årsaken hele kandidatkontrollen gir (med referanser og oppgavesett), eller null når oppgaven godtas. */
const reason = (id: string, task: AiTaskDraft, wishes = '') => checkCandidates([task], serverRequest(session(id), wishes)).rejected[0]?.reason ?? null

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit, kompetansemaal: '', tilpasning: 'Nivå i økta.' })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const generate = async (): Promise<GenerateResult> => {
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-re', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

/** Et søylediagram som tekst, som i dataformatet. */
const chart = (scale: number, rows: [string, number][]) =>
  `Diagrammet viser hva elevene i 4C valgte som aktivitet på fredag. Hver ■ er ${scale} ${scale === 1 ? 'elev' : 'elever'}.\n${rows.map(([l, c]) => `${l.padEnd(9)}| ${'■'.repeat(c)}`).join('\n')}\n`

describe('1. referansebanken for Regning', () => {
  it('inneholder 36 unike referanser, godkjent av valideringen, med feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(ARITHMETIC_REFERENCE_COUNT, 36)
    assert.equal(raw.referenceCount, 36)
    assert.equal(arithmeticReferences.length, 36)
    assert.equal(new Set(arithmeticReferences.map((r) => r.id)).size, 36)
    assert.equal(new Set(arithmeticReferences.map((r) => r.studentText)).size, 36)
    assert.deepEqual(validateReferenceBank(raw, 36, ARITHMETIC_BANK).errors, [])
    assert.deepEqual(arithmeticReferences, raw.references)
    for (const ref of arithmeticReferences) {
      assert.match(ref.id, /^RE[1-4]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'regning')
      assert.ok(ref.purpose && ref.format && ref.studentText && ref.solution && ref.workedSolution && ref.teacherNote, ref.id)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.equal(ref.source.document, 'regning_referanser.json')
    }
  })

  it('feltnavnene er tilpasset koden, innholdet er uendret, og dataformatet er med', () => {
    const ref = arithmeticReferences.find((r) => r.id === 'RE1-N2-01')!
    assert.equal(ref.area, 'diagrammer')
    assert.equal(ref.areaTitle, 'Lese og tolke diagrammer')
    assert.equal(ref.level, 2)
    assert.equal(ref.format, 'lese-diagram')
    assert.equal(ref.purpose, 'Eleven leser et diagram der hver ■ er mer enn 1.')
    assert.equal(ref.studentText.split('\n')[1], 'Fotball  | ■■■■■■')
    assert.equal(ref.solution, '12 elever valgte fotball. Ski og svømming: 8 + 6 = 14 elever.')
    assert.equal(ref.workedSolution, 'Fotball: 6 · 2 = 12. Ski: 4 · 2 = 8. Svømming: 3 · 2 = 6.')
    assert.equal(ref.teacherNote, 'Vanlig feil er å glemme skalaen og svare 6.')
    assert.equal(ref.answerForm, 'kort')
    assert.equal(arithmeticReferences.find((r) => r.id === 'RE4-N1-02')!.representationHint, 'Venstre side: 4 klosser og 6 klosser. Høyre side: □ klosser.')
    assert.match(arithmeticDataFormat, /^Diagrammer og tabeller skrives som tekst, én rad per linje, med \| mellom navn og verdier\./)
    assert.equal(bankJson().dataFormat, arithmeticDataFormat)
  })

  it('ID-ene kolliderer ikke med de andre bankene, og ingen annen bank har prefikset RE', () => {
    assert.equal(new Set(referenceBanks.map((r) => r.id)).size, referenceBanks.length)
    assert.equal(referenceBanks.filter((r) => r.topic === 'regning').length, 36)
    assert.ok(!referenceBanks.some((r) => r.topic !== 'regning' && r.id.startsWith('RE')))
    assert.ok(containsInternalText('Se RE3-N2-01.'))
  })

  it('2. hvert av de fire områdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...ARITHMETIC_AREAS], ['diagrammer', 'tabeller', 'fire-regnearter', 'algebra'])
    assert.deepEqual([...new Set(arithmeticReferences.map((r) => r.area))], [...ARITHMETIC_AREAS])
    for (const area of ARITHMETIC_AREAS) {
      assert.equal(topicOfArea(area), 'regning')
      assert.ok(AREA_TITLES[area])
      for (const level of [1, 2, 3]) assert.equal(arithmeticReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 36 referansene består de faglige kontrollene for sitt område og nivå', () => {
    for (const ref of arithmeticReferences) {
      assert.equal(arithmeticProblem(text(ref.level, ref.studentText, ref.solution), { area: ref.area as never }), null, ref.id)
    }
  })

  it('valideringen finner en feil fasit, men regner ikke ut påstander som kalles usanne', () => {
    const broken = bankJson()
    broken.references = broken.references.map((r) => (r.id === 'RE3-N1-02' ? { ...r, solution: 'Multiplikasjon. 6 · 8 = 46. Det er 46 kritt.' } : r))
    assert.ok(validateReferenceBank(broken, 36, ARITHMETIC_BANK).errors.some((e) => e.includes('RE3-N1-02')))
    assert.deepEqual(checkEquations('12 + 3 = 15 + 2 er usant, fordi 15 ikke er lik 17.').errors, [])
    assert.equal(checkEquations('12 + 3 = 15 + 2 er sant.').errors.length, 1)
  })
})

describe('3. regneøktene og de fire fagområdene', () => {
  it('beholder seks økter med samme ID-er, overskrifter og rekkefølge, og kobler hver økt til ett fagområde', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.profile?.area, s.profile?.taskVariant ?? '']),
      [
        ['regning-1', 'Lese og tolke diagrammer', 'diagrammer', ''],
        ['regning-2', 'Lese og tolke tabeller', 'tabeller', ''],
        ['regning-3', 'De fire regneartene', 'fire-regnearter', ''],
        ['regning-4', 'Velge regneart i tekstoppgaver', 'fire-regnearter', 'tekstoppgaver'],
        ['regning-5', 'Utforske algebra – finne det ukjente tallet', 'algebra', ''],
        ['regning-6', 'Likninger med symboler', 'algebra', 'likhet'],
      ],
    )
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'regning')!.weeks.map((w) => w.sessions.length), [2, 2, 2])
  })

  it('velger bare referanser fra Regning, øktas fagområde og nivå – også der Problemløsing og Tall og regning overlapper', () => {
    for (const s of sessions) {
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'regning' && r.area === s.profile!.area && r.level === level && r.id.startsWith('RE')), `${s.id} nivå ${level}`)
        }
      }
    }
    // Problemløsing og Tall og regning henter fortsatt bare fra sine egne banker.
    assert.ok(selectReferences(referenceBanks, { area: 'regnefortelling-regneuttrykk', level: 1, seed: 4 }).every((r) => r.topic === 'problemlosing'))
    assert.ok(selectReferences(referenceBanks, { area: 'sammenheng-addisjon-subtraksjon', level: 2, seed: 4 }).every((r) => r.topic === 'tall-og-regning'))
  })

  it('serveren sender referansene fra området og dataformatet i alle regneøktene', async () => {
    for (const s of sessions) {
      let prompt = ''
      const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
        prompt = contents[0]?.parts?.[0]?.text ?? ''
        const body = JSON.stringify({ melding: '', oppgaver: [] })
        return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
      }
      const handler = createTaskHandler({ generate: generate as never, log: () => {}, newSeed: () => 4 })
      await assert.rejects(handler(appRequest(s), { uid: 'l', classId: '4A' }))
      assert.ok(prompt.includes('Hovedtema: Regning'), s.id)
      assert.ok(prompt.includes(`Fagområde: ${AREA_TITLES[s.profile!.area!]}`), s.id)
      assert.ok(prompt.includes(`Dataformat: ${arithmeticDataFormat}`), s.id)
      const ids = [...prompt.matchAll(/ID: (RE\d-N\d-\d{2})/g)].map((m) => m[1])
      assert.equal(ids.length, 9, s.id)
      const n = ARITHMETIC_AREAS.indexOf(s.profile!.area as never) + 1
      assert.ok(ids.every((id) => id.startsWith(`RE${n}-`)), ids.join(','))
    }
    // Diagrammet i en referanse beholder linjeskift og justering i prompten.
    assert.ok(toAiReference(arithmeticReferences.find((r) => r.id === 'RE1-N1-01')!).studentText.includes('\nEple     | ■■■■■■\n'))
    assert.equal(toAiReference(arithmeticReferences.find((r) => r.id === 'RE4-N1-02')!).support, 'Venstre side: 4 klosser og 6 klosser. Høyre side: □ klosser.')
  })
})

describe('grunnoppgavene i Regning', () => {
  /** Hele kontrollen for én grunnoppgave: oppgavesettet uten oppgaven selv, og alle referansene på nivået. */
  function baseReason(s: Planned, all: ReturnType<typeof buildTasks>, t: ReturnType<typeof buildTasks>[number]) {
    const request = serverRequest(s)
    request.levels = request.levels!.map((l) => ({
      ...l,
      referenceTasks: arithmeticReferences.filter((r) => r.level === l.level && r.area === s.profile!.area).map(toAiReference),
      existing: summarizeExisting(all.filter((x) => x.level === l.level && x.id !== t.id)),
    }))
    const draft = t.kind === 'text' ? text(t.level, t.text, t.solution) : text(t.level, t.instruction, '')
    return checkCandidates([draft], request).rejected[0]?.reason ?? null
  }

  it('alle grunnoppgavene er tekstoppgaver og passer hele kontrollen i sin egen økt', () => {
    let checked = 0
    for (const s of sessions) {
      const all = buildTasks(s)
      assert.equal(all.length, 15, s.id)
      for (const t of all) {
        assert.equal(t.kind, 'text', `${t.id} er et regnestykke`)
        checked++
        assert.equal(baseReason(s, all, t), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : ''}`)
      }
    }
    assert.equal(checked, 90)
  })

  it('diagramøkta viser diagrammet med skala, tabelløkta har kolonnenavn, og ukjent tall er alltid □', () => {
    for (const t of buildTasks(session(DIAGRAMS))) {
      assert.ok(t.kind === 'text' && /Hver ■ er \d+ stemme/.test(t.text) && hasDataBlock(t.text), t.id)
      assert.ok(t.kind === 'text' && !/piktogram/i.test(t.text))
    }
    for (const t of buildTasks(session(TABLES))) assert.ok(t.kind === 'text' && hasDataBlock(t.text) && kindOf(t.text) === 'tabell', t.id)
    for (const id of [UNKNOWN, EQUALITY]) {
      for (const t of buildTasks(session(id))) {
        assert.ok(t.kind === 'text' && !/\b[xy]\b/.test(t.text))
        // Fasiten gir verdien som «□ = …», eller vurderer påstanden.
        assert.ok(t.kind === 'text' && (/□ = \d+/.test(t.solution) || /er (sant|usant)/.test(t.solution)), t.id)
      }
    }
    // Ingen grunnoppgave røper regnearten med et regnestykke under teksten.
    assert.ok(sessions.flatMap(buildTasks).every((t) => t.kind === 'text'))
  })

  it('repetisjonsøktene med undertema fra Regning er uendret (samme oppgaver som før)', () => {
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).filter((s) => s.spec.unitId !== 'regning' && s.skills.some((k) => k.startsWith('reg.')))
    assert.deepEqual(repetition.map((s) => s.id), ['repetisjon-var-3', 'repetisjon-var-4'])
    const hash = (data: string) => createHash('sha256').update(data).digest('hex').slice(0, 16)
    // Regnet ut fra koden før Regning ble endret (git HEAD).
    assert.deepEqual(
      repetition.map((s) => hash(JSON.stringify({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))),
      ['df8be505c749899d', 'fe1fbaa7378c975c'],
    )
  })
})

describe('4. referanser kopieres ikke – heller ikke fra Problemløsing og Tall og regning', () => {
  it('ordrett eller nesten ordrett fra banken for Regning avvises', () => {
    const ref = arithmeticReferences.find((r) => r.id === 'RE1-N2-01')!
    assert.equal(reason(DIAGRAMS, text(2, ref.studentText, ref.solution)), 'copiedReference')
    const alg = arithmeticReferences.find((r) => r.id === 'RE4-N1-03')!
    assert.equal(reason(EQUALITY, text(1, alg.studentText, alg.solution)), 'copiedReference')
  })

  it('en nesten ordrett kopi av en referanse i Problemløsing eller Tall og regning avvises i økta om regneartene og algebra', () => {
    // En referanse fra hver bank som ellers passer kontrollen i økta, med ett ord byttet ut.
    const nearCopy = (refs: readonly ReferenceTask[], id: string) => {
      for (const ref of refs) {
        const copy = text(ref.level, ref.studentText.replace(/\b(har|er)\b/, (w) => (w === 'har' ? 'hadde' : 'var')), ref.solution)
        if (arithmeticProblem(copy, { area: session(id).profile!.area as never }) !== null) continue
        return reason(id, copy)
      }
      return 'ingen passende referanse'
    }
    assert.equal(nearCopy(problemSolvingReferences, OPERATIONS), 'copiedReference')
    // Referansene om sammenhengene mellom regneartene bruker __ for ukjent tall og avvises allerede i algebraøktene; i økta om
    // regneartene sammenlignes kandidatene med dem.
    assert.equal(nearCopy(numbersAndOperationsReferences.filter((r) => r.area.startsWith('sammenheng')), WORD_PROBLEMS), 'copiedReference')
  })

  it('en ny oppgave med egen formulering godtas', () => {
    assert.equal(reason(DIAGRAMS, text(2, chart(2, [['Bordtennis', 6], ['Sjakk', 3], ['Basket', 5]]) + 'Hvor mange valgte bordtennis og sjakk til sammen?', '18 elever. Bordtennis: 6 · 2 = 12. Sjakk: 3 · 2 = 6. 12 + 6 = 18.')), null)
  })
})

describe('5. diagrammer: skala og verdier', () => {
  const rows: [string, number][] = [['Bordtennis', 6], ['Sjakk', 3], ['Basket', 5]]

  it('diagrammer uten skala avvises', () => {
    const noScale = chart(2, rows).replace(' Hver ■ er 2 elever.', '')
    assert.equal(reason(DIAGRAMS, text(1, `${noScale}Hvor mange valgte sjakk?`, '6 elever.')), 'invalidDiagram')
  })

  it('fasiten må stemme med antall ■ og skalaen – også summer, forskjeller og påstander', () => {
    const c = chart(2, rows)
    assert.equal(reason(DIAGRAMS, text(2, `${c}Hvor mange valgte basket?`, 'Basket: 10 elever. 5 · 2 = 10.')), null)
    // Glemt skalaen: antall ■ i stedet for verdien.
    assert.equal(reason(DIAGRAMS, text(2, `${c}Hvor mange valgte basket?`, '5 elever valgte basket.')), 'wrongSolution')
    assert.equal(reason(DIAGRAMS, text(2, `${c}Hvor mange valgte basket?`, 'Basket: 12 elever.')), 'wrongSolution')
    assert.equal(reason(DIAGRAMS, text(2, `${c}Hvor mange flere valgte bordtennis enn sjakk?`, '3 flere. 6 − 3 = 3.')), 'wrongSolution')
    assert.equal(reason(DIAGRAMS, text(2, `${c}Hvor mange flere valgte bordtennis enn sjakk?`, '6 flere. 12 − 6 = 6.')), null)
    assert.equal(reason(DIAGRAMS, text(3, `${c}Mia sier: «Dobbelt så mange valgte bordtennis som sjakk.» Har Mia rett? Forklar.`, 'Nei. Bordtennis: 12 og sjakk: 6.')), 'wrongConclusion')
    assert.equal(reason(DIAGRAMS, text(3, `${c}Mia sier: «Dobbelt så mange valgte bordtennis som sjakk.» Har Mia rett? Forklar.`, 'Ja. Bordtennis: 12 og sjakk: 6. 2 · 6 = 12.')), null)
  })

  it('verdier som ikke kan vises med hele ■, og diagramtyper som ikke kan vises som tekst, avvises', () => {
    assert.equal(reason(DIAGRAMS, text(2, 'Elevene stemte: rød 3, blå 6 og gul 4. Lag et søylediagram der hver ■ er 2 stemmer.', 'Rød: 2 ■.')), 'invalidDiagram')
    assert.equal(reason(DIAGRAMS, text(2, 'Lag et sektordiagram som viser at 6 elever valgte fotball og 4 valgte dans.', 'Fotball 6, dans 4.')), 'offTopic')
  })
})

describe('6. diagrammer og tabeller som ikke står i teksten avvises', () => {
  it('«se diagrammet» eller «tabellen under» uten diagram eller tabell', () => {
    assert.equal(reason(DIAGRAMS, text(1, 'Se på diagrammet. Hvor mange elever valgte fotball?', '6 elever.')), 'missingFigure')
    assert.equal(reason(TABLES, text(1, 'Tabellen under viser prisene. Hva koster en is?', '15 kr.')), 'missingFigure')
    assert.equal(reason(TABLES, text(1, 'Bruk tabellen og finn ut hvor mange elever som går i 4B.', '22 elever.')), 'missingFigure')
  })
})

describe('7. tabeller: kolonnenavn og «Til sammen»', () => {
  const table = (header: string, ...rows: string[]) => `Tabellen viser hvor mange som var med på skirennet.\n${header}\n${rows.join('\n')}\n`

  it('tabeller uten kolonnenavn, eller med ulikt antall kolonner, avvises', () => {
    assert.equal(reason(TABLES, text(1, `${table('4A | 12', '4B | 10')}Hvor mange fra 4B var med?`, '10 elever.')), 'invalidTable')
    assert.equal(reason(TABLES, text(1, `${table('Klasse | Elever', '4A | 12', '4B | 10 | 3')}Hvor mange fra 4B var med?`, '10 elever.')), 'invalidTable')
    assert.equal(reason(TABLES, text(1, `${table('Klasse | Elever', '4A | 12', '4B | 10')}Hvor mange fra 4B var med?`, '10 elever.')), null)
  })

  it('«Til sammen» må være summen av de andre kolonnene, og tallene som mangler må stå riktig i fasiten', () => {
    const wrongTotal = table('Klasse | Jenter | Gutter | Til sammen', '4A | 7 | 6 | 13', '4B | 8 | 5 | 14')
    assert.equal(reason(TABLES, text(2, `${wrongTotal}Hvor mange var med fra 4B?`, '14 elever.')), 'invalidTable')
    const blanks = table('Klasse | Jenter | Gutter | Til sammen', '4A | 7 | __ | 13', '4B | __ | 5 | 14')
    assert.equal(reason(TABLES, text(3, `${blanks}Hvilke tall skal stå i de tomme feltene? Forklar.`, '4A: 6 gutter, fordi 13 − 7 = 6. 4B: 9 jenter, fordi 14 − 5 = 9.')), null)
    assert.equal(reason(TABLES, text(3, `${blanks}Hvilke tall skal stå i de tomme feltene? Forklar.`, '4A: 6 gutter. 4B: 8 jenter.')), 'wrongSolution')
  })

  it('tider i tabeller kontrolleres som tidsintervaller i Måling', () => {
    const bus = 'Tabellen viser når båten går fra hver brygge.\nBrygge | Tid\nHavna  | 09:10\nØya    | 09:35\nHvor lang tid tar båten fra havna til øya?'
    assert.equal(reason(TABLES, text(2, bus, '25 minutter.')), null)
    assert.equal(reason(TABLES, text(2, bus, '35 minutter.')), 'wrongTime')
  })
})

describe('8. regneart og regnestykker i fasiten', () => {
  it('feil regneart avvises', () => {
    const bus = 'Det sitter 45 barn på toget. 17 barn går av på stasjonen. Hvilken regneart passer? Hvor mange barn sitter igjen?'
    assert.equal(reason(OPERATIONS, text(1, bus, 'Subtraksjon. 45 − 17 = 28. Det er 28 barn igjen.')), null)
    assert.equal(reason(OPERATIONS, text(1, bus, 'Addisjon. 45 + 17 = 62. Det er 62 barn.')), 'wrongOperation')
    // Fasiten nevner én regneart, men stykket bruker en annen.
    assert.equal(reason(OPERATIONS, text(1, bus, 'Addisjon. 45 − 17 = 28. Det er 28 barn igjen.')), 'wrongOperation')
  })

  it('feil regnestykke, divisjon med rest og urimelige svar avvises', () => {
    assert.equal(reason(OPERATIONS, text(1, 'Det er 9 kurver med 4 egg i hver kurv. Hvilken regneart passer? Hvor mange egg er det?', 'Multiplikasjon. 9 · 4 = 37. Det er 37 egg.')), 'wrongSolution')
    assert.equal(reason(OPERATIONS, text(2, '50 kort deles likt mellom 6 spillere. Hvor mange kort får hver?', '50 : 6 = 8 rest 2. Hver får 8 kort.')), 'wrongRemainder')
    assert.equal(reason(WORD_PROBLEMS, text(2, 'Det er 42 elever. De skal sitte 6 ved hvert bord. Hvor mange bord trengs?', '42 · 6 = 252. Det trengs 252 bord.')), 'unreasonableAnswer')
  })

  it('overslag må bruke avrundede tall, og konklusjonen må følge overslaget', () => {
    const estimate = 'Lise vil kjøpe 4 spill som koster 49 kr hver. Hun har 150 kr. Bruk overslag: Har Lise nok penger? Forklar.'
    assert.equal(reason(OPERATIONS, text(2, estimate, 'Nei. 49 kr er nesten 50 kr, og 4 · 50 = 200 kr. Det er mer enn 150 kr. Nøyaktig pris er 196 kr.')), null)
    assert.equal(reason(OPERATIONS, text(2, estimate, 'Ja. 49 kr er nesten 50 kr, og 4 · 50 = 200 kr.')), 'wrongConclusion')
    assert.equal(reason(OPERATIONS, text(2, estimate, 'Nei. 4 · 49 = 196 kr, som er mer enn 150 kr.')), 'wrongSolution')
  })
})

describe('9 og 10. ukjent tall □: innsetting, entydighet og skrivemåte', () => {
  it('likninger der verdien for □ ikke gjør likningen sann, avvises', () => {
    assert.equal(reason(UNKNOWN, text(1, 'Finn tallet som mangler.\n□ + 12 = 20', '□ = 8. 8 + 12 = 20.')), null)
    assert.equal(reason(UNKNOWN, text(1, 'Finn tallet som mangler.\n□ + 12 = 20', '□ = 9.')), 'wrongSolution')
    assert.equal(reason(UNKNOWN, text(3, 'Samme symbol er samme tall. Finn □ og forklar.\n□ + □ + 6 = 20', '□ = 8.')), 'wrongSolution')
    assert.equal(reason(UNKNOWN, text(3, 'Samme symbol er samme tall. Finn □ og forklar.\n□ + □ + 6 = 20', '□ = 7. 20 − 6 = 14, og 7 + 7 = 14.')), null)
    assert.equal(reason(EQUALITY, text(1, 'Like mye på begge sider. Finn □.\n9 + 6 = □ + 7', '□ = 15.')), 'wrongSolution')
    // Sant eller usant: begge sider av likhetstegnet regnes ut.
    assert.equal(reason(EQUALITY, text(2, 'Er påstanden sann eller usann? Forklar.\n14 + 5 = 12 + 6', '14 + 5 = 12 + 6 er sant.')), 'wrongConclusion')
    assert.equal(reason(EQUALITY, text(2, 'Er påstanden sann eller usann? Forklar.\n14 + 5 = 12 + 6', '14 + 5 = 12 + 6 er usant, fordi venstre side er 19 og høyre side er 18.')), null)
  })

  it('bokstaver som ukjent tall, __ for et tall, og □ brukt for regnetegn avvises', () => {
    assert.equal(reason(UNKNOWN, text(1, 'Finn x.\nx + 12 = 20', 'x = 8.')), 'invalidUnknown')
    assert.equal(reason(UNKNOWN, text(1, 'Finn tallet som mangler.\n__ + 12 = 20', '8.')), 'invalidUnknown')
    assert.equal(reason(UNKNOWN, text(2, 'Hvilket tegn mangler?\n20 □ 4 = 5', '20 : 4 = 5.')), 'invalidUnknown')
    // Regnetegnet som mangler, skrives __ (ikke □).
    assert.equal(reason(OPERATIONS, text(2, 'Hvilket regnetegn mangler? Velg mellom +, −, · og :.\n36 __ 4 = 9', '36 : 4 = 9')), null)
    assert.equal(reason(OPERATIONS, text(2, 'Hvilket regnetegn mangler? Velg mellom +, −, · og :.\n36 __ 4 = 9', '36 − 4 = 9')), 'wrongSolution')
  })
})

describe('11. visning: diagram- og tabellinjer med linjeskift og justering', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  it('linjene med | blir en datablokk; resten av teksten er vanlig tekst', () => {
    const ref = arithmeticReferences.find((r) => r.id === 'RE1-N1-01')!
    const blocks = textBlocks(ref.studentText)
    assert.deepEqual(blocks.map((b) => b.kind), ['text', 'data', 'text'])
    assert.equal(blocks[1].text, 'Eple     | ■■■■■■\nBanan    | ■■■■\nPære     | ■■\nAppelsin | ■■■■■')
    assert.ok(isDataLine('Klasse | Jenter | Gutter') && !isDataLine('Velg + eller −.') && !isDataLine('a | '))
    // Ingen oppgaver i andre temaer har datalinjer, så de vises nøyaktig som før.
    const others = unitSpecs.filter((u) => u.unitId !== 'regning').flatMap((u) => planned(u.unitId))
    assert.ok(others.flatMap((s) => [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]).every((t) => t.kind !== 'text' || !hasDataBlock(t.text)))
  })

  it('datablokkene vises som søylediagram eller tabell i elevvisningen og på lærerkortet', () => {
    const component = read('src/components/ui/TaskText.tsx')
    assert.match(component, /<table className="border-collapse/)
    assert.match(component, /overflow-x-auto/)
    assert.match(read('src/features/student/TextTaskScreen.tsx'), /hasDataBlock\(body\) \|\| inText \|\| operatorButtons \? \(/)
    assert.match(read('src/features/tasks/TextTaskCard.tsx'), /hasDataBlock\(task\.text\) \? \(\s*<TaskText text=\{task\.text\}/)
    // ■, linjeskift og mellomrom går uendret fra AI-svaret til oppgaven eleven ser.
    const draft = text(1, chart(1, [['Fotball', 4], ['Dans', 2]]) + 'Hvor mange valgte dans?', '2 elever.')
    const task = toSessionTask(draft, 'ai-1')
    assert.equal(task.kind === 'text' && task.text, (draft as { studentText: string }).studentText)
    assert.ok(task.kind === 'text' && task.text.includes('\nFotball  | ■■■■\n'))
  })
})

describe('12. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(UNKNOWN)
  const ok1 = (a: number, b: number) => story(1, `Finn tallet som mangler.\n□ + ${b} = ${a + b}`, `□ = ${a}. ${a} + ${b} = ${a + b}.`)
  const ok2 = (a: number, b: number) => story(2, `Mia tenker på et tall. Finn tallet □.\n${a + b + 30} − □ = ${a}`, `□ = ${b + 30}. ${a + b + 30} − ${b + 30} = ${a}.`)
  const ok3 = (a: number, b: number) => story(3, `Samme symbol er samme tall. Finn □ og forklar.\n□ + □ + ${b} = ${2 * a + b}`, `□ = ${a}. ${2 * a + b} − ${b} = ${2 * a}, og ${a} + ${a} = ${2 * a}.`)

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(11, 13),
        // Bokstav som ukjent tall.
        story(1, 'Finn tallet som mangler.\nx + 13 = 27', 'x = 14.'),
        ok2(14, 6),
        // Feil verdi for □.
        story(2, 'Mia tenker på et tall. Finn tallet □.\n52 − □ = 17', '□ = 36.'),
        ok3(9, 4),
        ok3(12, 5),
      ],
      [ok1(15, 4), ok2(21, 7)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    // Oppgavene legges inn som AI-genererte og ikke gjennomgåtte.
    assert.ok(result.tasks.map((t, i) => toSessionTask(t, `ai-${i}`, result.meta)).every((t) => t.aiGenerated === true && t.reviewed === false))
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_invalidUnknown, 1)
    assert.equal(final.removed_wrongSolution, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'regning')
    assert.equal(final.area, 'algebra')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'Finn tallet som mangler.\n□ + 13 = 24', '□ = 12.')
    const { handler, calls } = scripted([[wrong, wrong, ok2(14, 6), ok2(16, 8), ok3(9, 4), ok3(12, 5)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('13. «Andre ønsker» kan ikke overstyre fagområde, nivå, dataformat eller matematisk korrekthet', () => {
  const wishes = 'Bruk et linjediagram eller et sektordiagram. Gjerne x som ukjent, desimaltall og påstander på nivå 1.'

  it('ønskene gir ikke andre diagramtyper, bokstaver som ukjent, desimaltall, et annet fagområde, et annet nivå eller feil fasit', () => {
    assert.equal(reason(DIAGRAMS, text(2, 'Lag et linjediagram som viser temperaturen mandag 4 grader og tirsdag 6 grader.', 'Linjen går fra 4 til 6.'), wishes), 'offTopic')
    assert.equal(reason(UNKNOWN, text(2, 'Finn x.\n3 · x = 24', 'x = 8.'), wishes), 'invalidUnknown')
    assert.equal(reason(OPERATIONS, text(2, 'En pose koster 12,50 kr. Hva koster 2 poser?', '25 kr.'), wishes), 'outsideRange')
    assert.equal(reason(DIAGRAMS, text(2, 'Det er 7 kurver med 6 egg i hver kurv. Hvor mange egg er det?', '42 egg. 7 · 6 = 42.'), wishes), 'wrongArea')
    assert.equal(reason(UNKNOWN, text(1, 'Ola sier at □ = 5 i □ + 4 = 9. Har Ola rett?', 'Ja. □ = 5.'), wishes), 'levelMismatch')
    assert.equal(reason(UNKNOWN, text(2, 'Finn □.\n3 · □ = 24', '□ = 9.'), wishes), 'wrongSolution')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta, og prompten holder fast på dataformatet', () => {
    assert.equal(reason(DIAGRAMS, text(2, chart(5, [['Klatring', 4], ['Padling', 2], ['Fisking', 3]]) + 'Hvor mange valgte klatring og fisking til sammen?', '35 elever. Klatring: 4 · 5 = 20. Fisking: 3 · 5 = 15. 20 + 15 = 35.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(DIAGRAMS), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('ikke linjediagram, sektordiagram, piktogram eller bilder, heller ikke når ønskene ber om det'))
    assert.ok(prompt.includes(`Dataformat: ${arithmeticDataFormat}`))
  })
})

describe('14. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de åtte andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(hash(file('problemlosing')), '380ddf92250336a8')
    assert.equal(hash(file('tall_og_regning')), 'bc0636c64aaef7f8')
    assert.equal(hash(file('maling')), 'c6c767c2c1daa00d')
    assert.equal(referenceBanks.filter((r) => !['regning', 'strategier-i-divisjon'].includes(r.topic)).length, 54 + 45 + 36 + 36 + 36 + 36 + 45 + 45)
    for (const [area, level] of [['tabell-6-7-8-9', 2], ['flerstegsoppgaver', 3], ['sammenheng-addisjon-subtraksjon', 1], ['tallfolger', 2]] as const) {
      const own = referenceBanks.filter((r) => !['regning', 'strategier-i-divisjon'].includes(r.topic))
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(own, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene, repetisjonsøktene og arbeidsarkene er uendret', () => {
    // Strategier i divisjon og repetisjonsøkta med undertema derfra er endret samtidig (se divisionStrategiesAi.test.ts).
    const others = unitSpecs
      .filter((u) => !['regning', 'strategier-i-divisjon'].includes(u.unitId))
      .flatMap((u) => planned(u.unitId))
      .filter((s) => s.id !== 'geometri-6' && !s.skills.some((k) => k.startsWith('sdiv.')))
    // Verdiene er regnet ut fra koden før Regning ble endret (git HEAD) og er de samme etterpå.
    assert.equal(others.length, 70)
    assert.equal(hash(JSON.stringify(others.map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) })))), 'ea9e0673f0957bd5')
    assert.equal(hash(JSON.stringify(worksheetTasks)), 'e3d6790bfc34bfbb')
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })
})

describe('15. visning og automatisk retting i Regning', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const accepted = (id: string, t: AiTaskDraft) => checkCandidates([t], serverRequest(session(id))).accepted[0] as { expected?: ExpectedAnswer } | undefined

  it('1. søylediagram: hver ■ er en egen rute med luft imellom, og søylene starter på samme sted', () => {
    const data = readDataBlock('Fotball  | ■■■■■■\nHåndball | ■■■')
    assert.deepEqual(data, { kind: 'bars', rows: [{ label: 'Fotball', count: 6 }, { label: 'Håndball', count: 3 }] })
    const component = read('src/components/ui/TaskText.tsx')
    assert.match(component, /grid-cols-\[auto_1fr\]/)
    assert.match(component, /<span className="flex gap-1\.5">/)
    assert.match(component, /Array\.from\(\{ length: row\.count \}/)
  })

  it('2. tabeller vises som ekte tabeller med linjer og overskriftsrad, uten |, og kan rulles sidelengs', () => {
    const data = readDataBlock('Klasse | Jenter | Gutter\n4A     | 12     | 13')
    assert.deepEqual(data, { kind: 'table', header: ['Klasse', 'Jenter', 'Gutter'], rows: [['4A', '12', '13']] })
    const component = read('src/components/ui/TaskText.tsx')
    assert.match(component, /<th key=\{c\} scope="col" className="border border-card-border bg-surface-light [^"]*font-semibold">/)
    assert.match(component, /<td key=\{c\} className=\{`border border-card-border/)
    assert.match(component, /text-right tabular-nums/)
    assert.match(component, /<div className="max-w-full overflow-x-auto">\s*<table/)
    // Lærerkortet bruker samme tabell.
    assert.match(read('src/features/tasks/TextTaskCard.tsx'), /<TaskText text=\{task\.text\}/)
  })

  it('3. tomme ruter i tabeller blir inputbokser, svaret rettes, og forklaringen får eget felt', () => {
    const t = buildTasks(session(TABLES)).find((x) => x.level === 3)!
    assert.ok(t.kind === 'text' && t.expected?.kind === 'numbers')
    if (t.kind !== 'text' || t.expected?.kind !== 'numbers') return
    assert.equal(slotCount(t.text).cells, t.expected.values.length)
    assert.ok(asksExplanation(t.text))
    const right = t.expected.values.join(', ')
    assert.equal(checkTextAnswer({ answer: right, submitted: false }, t).result, 'correct')
    assert.equal(checkTextAnswer({ answer: t.expected.values.map((v) => v + 1).join(', '), submitted: false }, t).result, 'retry')
    // AI-oppgaver får svaret rad for rad når kontrollen har regnet det ut.
    const ai = accepted(TABLES, text(3, 'Tabellen viser hvor mange som var med på skirennet.\nKlasse | Jenter | Gutter | Til sammen\n4A | 7 | __ | 13\n4B | __ | 5 | 14\nHvilke tall skal stå i de tomme feltene? Forklar.', '4A: 6 gutter, fordi 13 − 7 = 6. 4B: 9 jenter, fordi 14 − 5 = 9.'))
    assert.deepEqual(ai?.expected, { kind: 'numbers', values: [6, 9] })
    const screen = read('src/features/student/TextTaskScreen.tsx')
    assert.match(screen, /const \{ total: slotTotal, inText \} = textSlots\(task, shown, textBoxes\)/)
    assert.match(screen, /\{explain && \(/)
  })

  it('4. manglende regnetegn: fire knapper laget av appen, uten oppramsingen i teksten, og valget rettes', () => {
    const t = buildTasks(session(OPERATIONS)).find((x) => x.level === 2)!
    assert.ok(t.kind === 'text' && t.expected?.kind === 'operator')
    if (t.kind !== 'text' || t.expected?.kind !== 'operator') return
    assert.ok(t.text.includes('Velg mellom +, −, · og :.'))
    assert.ok(!withoutOperatorChoices(t.text).includes('Velg mellom'))
    assert.ok(t.text.split('\n').some((l) => operatorTemplate(l)))
    assert.equal(checkTextAnswer({ answer: t.expected.value, submitted: false }, t).result, 'correct')
    assert.equal(checkTextAnswer({ answer: t.expected.value === '+' ? '−' : '+', submitted: false }, t).result, 'retry')
    assert.ok(isCorrect({ kind: 'operator', value: '·' }, 'x') && isCorrect({ kind: 'operator', value: ':' }, '/') && isCorrect({ kind: 'operator', value: '−' }, '-'))
    assert.deepEqual(accepted(OPERATIONS, text(2, 'Hvilket regnetegn mangler? Velg mellom +, −, · og :.\n36 __ 4 = 9', '36 : 4 = 9'))?.expected, { kind: 'operator', value: ':' })
    const screen = read('src/features/student/TextTaskScreen.tsx')
    assert.match(screen, /OPERATOR_OPTIONS\.map\(\(sign\) =>/)
    assert.match(screen, /const shown = operatorButtons \? withoutOperatorChoices\(text\) : text/)
  })

  it('5. regning-4 har én situasjon per oppgave; har en oppgave likevel a) og b), får hver del sitt felt (bare i Regning)', () => {
    assert.ok(buildTasks(session(WORD_PROBLEMS)).every((t) => t.kind === 'text' && !lettered(t.text)))
    const parts = lettered('Skriv regnestykket.\na) Ola har 5 epler.\nb) Kari har 3 pærer.')!
    assert.deepEqual(parts.parts.map((p) => p.label), ['a)', 'b)'])
    assert.equal(parts.intro, 'Skriv regnestykket.')
    assert.match(read('src/features/student/StudentTaskFlow.tsx'), /splitParts=\{topicId === 'regning'\}/)
    assert.ok(taskPrompt(serverRequest(session(WORD_PROBLEMS))).includes('Unngå a)- og b)-deloppgaver.'))
  })

  it('6. □ i likninger blir inputbokser – én per □, med samme tall – og svaret rettes', () => {
    assert.ok(isBoxEquationLine('□ + □ + 5 = 45') && isBoxEquationLine('20 + 4 = □ + 3') && !isBoxEquationLine('Hvilket tall skjuler seg bak □?'))
    assert.deepEqual(slotCount('Hvilket tall skjuler seg bak □?\n□ + □ + 5 = 45'), { cells: 0, boxes: 2 })
    const two = buildTasks(session(UNKNOWN)).find((x) => x.level === 3)!
    assert.ok(two.kind === 'text' && two.expected?.kind === 'numbers' && two.expected.values.length === 2)
    if (two.kind !== 'text' || two.expected?.kind !== 'numbers') return
    const v = two.expected.values[0]
    assert.equal(checkTextAnswer({ answer: `${v}, ${v}`, submitted: false }, two).result, 'correct')
    assert.equal(checkTextAnswer({ answer: `${v}, ${v + 1}`, submitted: false }, two).result, 'retry')
    // Alle likningene med □ i økt 5 og nivå 1 i økt 6 har bokser; sant/usant og påstander rettes ikke automatisk.
    for (const t of [...buildTasks(session(UNKNOWN)), ...buildTasks(session(EQUALITY)).filter((x) => x.level === 1)]) {
      assert.ok(t.kind === 'text' && t.expected?.kind === 'numbers' && slotCount(t.text).boxes === t.expected.values.length, t.id)
    }
    assert.ok(buildTasks(session(EQUALITY)).filter((x) => x.level > 1).every((t) => t.kind === 'text' && !t.expected))
    // AI-oppgaver: likning på egen linje gir bokser; på balansevekten skriver eleven tallet.
    assert.deepEqual(accepted(UNKNOWN, text(3, 'Samme symbol er samme tall. Finn □ og forklar.\n□ + □ + 6 = 20', '□ = 7. 20 − 6 = 14, og 7 + 7 = 14.'))?.expected, { kind: 'numbers', values: [7, 7] })
    assert.deepEqual(accepted(EQUALITY, text(1, 'Mira legger kuler på en skålvekt til den står helt rett. Den ene siden har 3 kuler og 9 kuler. Den andre siden har □ kuler. Finn □.', '□ = 12. 3 + 9 = 12.'))?.expected, { kind: 'number', value: 12 })
    assert.equal(accepted(EQUALITY, text(3, 'Ida løser 9 + 3 = □ + 5 og svarer at □ er 12. Stemmer det? Forklar.', 'Nei. □ = 7. 9 + 3 = 12, og 7 + 5 = 12.'))?.expected, undefined)
  })

  it('7. rettingen som i Mønster og algoritmer: løsningsforslag bare når eleven kan se det, og ærlig melding ellers', () => {
    const t = buildTasks(session(UNKNOWN))[0]
    assert.ok(t.kind === 'text' && t.expected)
    if (t.kind !== 'text' || !t.expected) return
    assert.equal(showsSolution(t), true)
    assert.equal(showsSolution({ ...t, aiGenerated: true, reviewed: false }), false)
    assert.equal(formatExpected({ kind: 'numbers', values: [7, 7] }), '7, 7')
    // Svaret lagres med oppgaven og forsvinner når teksten justeres.
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(t))), t)
    assert.equal(applyRevision(t, { message: '', tasks: [text(t.level, `${t.text} Forklar.`, t.solution)] }).task!.expected, undefined)
    // Påstander og oppgaver uten svar som kan rettes, får «Ferdig! Fortell læreren hva du svarte.».
    assert.ok(buildTasks(session(DIAGRAMS)).filter((x) => x.level === 3).every((x) => x.kind === 'text' && !x.expected))
    assert.match(read('src/features/student/StudentTaskFlow.tsx'), /honestDone=\{topicId === 'monster-og-algoritmer' \|\| topicId === 'regning'\}/)
    // Repetisjonsøktene med undertema fra Regning har ingen automatisk retting.
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).filter((s) => s.spec.unitId !== 'regning' && s.skills.some((k) => k.startsWith('reg.')))
    assert.ok(repetition.flatMap(buildTasks).every((x) => x.kind !== 'text' || !x.expected))
  })
})

describe('16. det går an å skrive i boksene, og svaret rettes med tallene i boksene', () => {
  /** Eleven skriver tallene tegn for tegn i boksene, slik elevvisningen og forhåndsvisningen gjør (typeInSlot). */
  function typeAll(task: ReturnType<typeof buildTasks>[number], numbers: number[], textBoxes = true) {
    assert.ok(task.kind === 'text')
    if (task.kind !== 'text') throw new Error()
    const { total, inText } = textSlots(task, task.text, textBoxes)
    assert.ok(inText, task.text)
    assert.equal(total, numbers.length)
    let answer = initialTextState().answer
    numbers.forEach((n, i) => {
      let typed = ''
      for (const digit of String(n)) {
        typed += digit
        answer = typeInSlot(answer, total, i, typed)
      }
    })
    return answer
  }

  it('tabellen med tomme ruter: tallene skrives i rutene og rettes', () => {
    const t = buildTasks(session(TABLES)).find((x) => x.kind === 'text' && x.level === 3 && x.expected?.kind === 'numbers')!
    assert.ok(t.kind === 'text' && t.expected?.kind === 'numbers')
    if (t.kind !== 'text' || t.expected?.kind !== 'numbers') return
    const answer = typeAll(t, t.expected.values)
    assert.equal(answer, t.expected.values.join(', '))
    assert.equal(checkTextAnswer({ answer, submitted: false }, t).result, 'correct')
    // Ruta for svømming først, så klatring: rekkefølgen følger rutene, ikke skrivingen.
    let reversed = typeInSlot('', 2, 1, String(t.expected.values[1]))
    reversed = typeInSlot(reversed, 2, 0, String(t.expected.values[0]))
    assert.equal(checkTextAnswer({ answer: reversed, submitted: false }, t).result, 'correct')
    // Bokstaver tas ikke imot.
    assert.equal(typeInSlot('', 2, 0, '1a0'), '10, ')
  })

  it('«□ + 5 = 18» og «20 + 4 = □ + 3»: tallet skrives der □ står og rettes', () => {
    const plus = buildTasks(session(UNKNOWN)).find((x) => x.kind === 'text' && x.level === 1)!
    const both = buildTasks(session(EQUALITY)).find((x) => x.kind === 'text' && x.level === 1)!
    for (const t of [plus, both]) {
      assert.ok(t.kind === 'text' && t.expected?.kind === 'numbers')
      if (t.kind !== 'text' || t.expected?.kind !== 'numbers') continue
      const answer = typeAll(t, t.expected.values)
      assert.equal(checkTextAnswer({ answer, submitted: false }, t).result, 'correct')
      assert.equal(checkTextAnswer({ answer: typeAll(t, [t.expected.values[0] + 1]), submitted: false }, t).result, 'retry')
    }
    // To □: begge boksene må ha samme tall.
    const two = buildTasks(session(UNKNOWN)).find((x) => x.kind === 'text' && x.level === 3)!
    assert.ok(two.kind === 'text' && two.expected?.kind === 'numbers')
    if (two.kind === 'text' && two.expected?.kind === 'numbers') {
      const v = two.expected.values[0]
      assert.equal(checkTextAnswer({ answer: typeAll(two, [v, v]), submitted: false }, two).result, 'correct')
      assert.equal(checkTextAnswer({ answer: typeAll(two, [v, v + 1]), submitted: false }, two).result, 'retry')
    }
  })

  it('årsaken: boksene vises også når oppgaven mangler svaret (eldre lagret oppgavesett), og lagrede grunnoppgaver får svaret igjen', () => {
    const fresh = buildTasks(session(UNKNOWN))
    const stale: ReturnType<typeof buildTasks> = fresh.map((t) => (t.kind === 'text' ? (({ expected: _e, ...rest }) => rest)(t) : t))
    const old = stale[0]
    assert.ok(old.kind === 'text' && !old.expected)
    if (old.kind !== 'text') return
    // I Regning er □ alltid en inputboks (før: bare når svaret fantes – da ble □ vist som tekst og boksen kunne ikke brukes).
    assert.deepEqual(textSlots(old, old.text, true), { total: 1, inText: true })
    assert.deepEqual(textSlots(old, old.text, false), { total: 1, inText: false })
    // Uten svar rettes oppgaven ikke: «Ferdig med oppgaven».
    assert.deepEqual(checkTextAnswer({ answer: '13', submitted: false }, old), { answer: '13', submitted: true })
    // Et eldre lagret sett: uendrede grunnoppgaver får svaret igjen, endrede oppgaver og AI-oppgaver ikke.
    const refreshed = refreshStoredTasks(stale, fresh)
    assert.deepEqual(refreshed, fresh)
    const edited = { ...old, text: `${old.text} Forklar.` }
    assert.equal((refreshStoredTasks([edited], fresh)[0] as { expected?: unknown }).expected, undefined)
    const ai = { ...old, aiGenerated: true }
    assert.equal((refreshStoredTasks([ai], fresh)[0] as { expected?: unknown }).expected, undefined)
    const provider = readFileSync(new URL('../src/features/sessions/SessionsProvider.tsx', import.meta.url), 'utf8')
    assert.match(provider, /refreshStoredTasks\(set, all\[id\] \?\? \[\]\)/)
  })

  it('skrivefeltet under er bare for forklaringen, og gjelder både elevvisningen og forhåndsvisningen', () => {
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /\{!row && !choices && !operatorButtons && !inText && !parts && !questionParts && \(/)
    assert.match(screen, /onChange: \(i, v\) => change\(typeInSlot\(answer, slotTotal, i, v\)\)/)
    // Elevvisningen og forhåndsvisningen bruker samme flyt og samme skjerm.
    const flow = readFileSync(new URL('../src/features/student/StudentTaskFlow.tsx', import.meta.url), 'utf8')
    assert.match(flow, /textBoxes=\{topicId === 'regning'\}/)
    assert.match(readFileSync(new URL('../src/features/tasks/StudentPreviewDialog.tsx', import.meta.url), 'utf8'), /<StudentTaskFlow[\s\S]*topicId=\{session\.topicId\}/)
    assert.match(readFileSync(new URL('../src/features/student/StudentHomePage.tsx', import.meta.url), 'utf8'), /<StudentTaskFlow [\s\S]*?topicId=\{session\.topicId\}/)
  })

  it('Mønster og algoritmer: boksene i tallrekkene tar imot tall, og eldre lagrede sett får boksene og svaret igjen', () => {
    const fresh = [...(worksheetTasks['monster-og-algoritmer-2'] ?? []), ...buildTasks(planned('monster-og-algoritmer')[1])]
    const row = fresh.find((t) => t.kind === 'text' && t.answerBoxes && t.expected?.kind === 'numbers')!
    assert.ok(row.kind === 'text' && row.expected?.kind === 'numbers')
    if (row.kind !== 'text' || row.expected?.kind !== 'numbers') return
    // Samme lagring av boksene som i Regning («22, 23, 24»).
    let answer = ''
    row.expected.values.forEach((v, i) => (answer = typeInSlot(answer, row.expected!.kind === 'numbers' ? (row.expected as { values: number[] }).values.length : 0, i, String(v))))
    assert.equal(checkTextAnswer({ answer, submitted: false }, row).result, 'correct')
    const stale: typeof fresh = fresh.map((t) => (t.kind === 'text' ? (({ expected: _e, answerBoxes: _b, ...rest }) => rest)(t) : t))
    assert.deepEqual(refreshStoredTasks(stale, fresh), fresh)
  })
})

describe('17. flere spørsmål: ett svarfelt per spørsmål, rettet hver for seg', () => {
  const accepted = (id: string, t: AiTaskDraft) => checkCandidates([t], serverRequest(session(id))).accepted[0] as { expected?: ExpectedAnswer } | undefined

  it('spørsmålene leses ut av teksten og vises over svarfeltene i stedet for i teksten', () => {
    const t = buildTasks(session(DIAGRAMS)).find((x) => x.level === 1)!
    assert.ok(t.kind === 'text' && t.expected?.kind === 'parts')
    if (t.kind !== 'text' || t.expected?.kind !== 'parts') return
    assert.deepEqual(questionsIn(t.text), t.expected.parts.map((p) => p.question))
    const body = withoutQuestions(t.text, questionsIn(t.text))
    assert.ok(!body.includes('?') && hasDataBlock(body) && body.startsWith('Elevene i 4B stemte'))
    // Navneknappene er radene i diagrammet (laget av appen), og svaret er blant dem.
    assert.ok(labelsIn(t.text).includes((t.expected.parts[1].answer as { value: string }).value))
  })

  it('grunnoppgavene: regnetegn og tall, tall og navn – og hver del rettes for seg', () => {
    const op = buildTasks(session(OPERATIONS)).find((x) => x.level === 1)!
    assert.ok(op.kind === 'text' && op.expected?.kind === 'parts')
    if (op.kind !== 'text' || op.expected?.kind !== 'parts') return
    assert.deepEqual(op.expected.parts.map((p) => p.answer.kind), ['operator', 'number'])
    const [sign, number] = op.expected.parts.map((p) => String(p.answer.value))
    assert.equal(checkTextAnswer({ answer: '', submitted: false, parts: [sign, number] }, op).result, 'correct')
    const half = checkTextAnswer({ answer: '', submitted: false, parts: [sign, `${Number(number) + 1}`] }, op)
    assert.deepEqual([half.result, half.partResults], ['retry', [true, false]])
    assert.equal(checkTextAnswer({ ...half, parts: [sign, `${Number(number) + 2}`] }, op).result, 'revealed')
    assert.ok(partCorrect({ kind: 'operator', value: '·' }, 'x') && partCorrect({ kind: 'choice', value: 'Fotball' }, 'fotball') && !partCorrect({ kind: 'number', value: 12 }, '12 stemmer'))
    // Alle oppgavene av typen «Hvilken regneart passer? Hvor mange …?» i økt 3 og 4, og nivå 1 og 2 i økt 1 og 2.
    for (const t of [...buildTasks(session(OPERATIONS)).filter((x) => x.level === 1), ...buildTasks(session(WORD_PROBLEMS)).filter((x) => x.level === 2)]) {
      assert.ok(t.kind === 'text' && t.expected?.kind === 'parts' && t.expected.parts[0].question === 'Hvilken regneart passer?', t.id)
    }
    for (const id of [DIAGRAMS, TABLES]) {
      for (const t of buildTasks(session(id)).filter((x) => x.level < 3)) {
        assert.ok(t.kind === 'text' && t.expected?.kind === 'parts' && t.expected.parts.every((p) => questionsIn(t.text).includes(p.question)), t.id)
      }
    }
    // Svardelene lagres og leses inn igjen.
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(op))), op)
  })

  it('AI-oppgaver: serveren tolker spørsmålene og regner ut svarene fra diagrammet, tabellen eller regnestykket', () => {
    const chartTask = chart(2, [['Bordtennis', 6], ['Sjakk', 3], ['Basket', 5]])
    assert.deepEqual(accepted(DIAGRAMS, text(1, `${chartTask}Hvor mange valgte sjakk? Hva valgte flest?`, 'Sjakk: 6 elever. Bordtennis valgte flest, 12 elever.'))?.expected, {
      kind: 'parts',
      parts: [
        { question: 'Hvor mange valgte sjakk?', answer: { kind: 'number', value: 6 } },
        { question: 'Hva valgte flest?', answer: { kind: 'choice', value: 'Bordtennis' } },
      ],
    })
    assert.deepEqual(accepted(DIAGRAMS, text(2, `${chartTask}Hvor mange flere valgte bordtennis enn sjakk?`, '6 flere. 12 − 6 = 6.'))?.expected, {
      kind: 'parts',
      parts: [{ question: 'Hvor mange flere valgte bordtennis enn sjakk?', answer: { kind: 'number', value: 6 } }],
    })
    const table = 'Tabellen viser hvor mange som var på svømmehallen.\nDag | Besøkende\nMandag | 18\nTirsdag | 25\nOnsdag | 21\n'
    assert.deepEqual(accepted(TABLES, text(1, `${table}Hvor mange kom på onsdag? Hvilken dag kom færrest?`, '21 besøkende. Mandag hadde færrest, 18.'))?.expected, {
      kind: 'parts',
      parts: [
        { question: 'Hvor mange kom på onsdag?', answer: { kind: 'number', value: 21 } },
        { question: 'Hvilken dag kom færrest?', answer: { kind: 'choice', value: 'Mandag' } },
      ],
    })
    assert.deepEqual(accepted(OPERATIONS, text(1, 'Det står 8 rader med 6 stoler i salen. Hvilken regneart passer? Hvor mange stoler er det?', 'Multiplikasjon. 8 · 6 = 48. Det er 48 stoler.'))?.expected, {
      kind: 'parts',
      parts: [
        { question: 'Hvilken regneart passer?', answer: { kind: 'operator', value: '·' } },
        { question: 'Hvor mange stoler er det?', answer: { kind: 'number', value: 48 } },
      ],
    })
    // Spørsmål som ikke kan tolkes, og påstander: ingen svardeler (vanlig skrivefelt, eller «Ferdig med oppgaven»).
    assert.equal(accepted(DIAGRAMS, text(2, `${chartTask}Hvilken aktivitet ville du valgt, og hvorfor?`, 'Svarene vil variere. Bordtennis: 12, sjakk: 6, basket: 10.'))?.expected, undefined)
    assert.equal(accepted(DIAGRAMS, text(3, `${chartTask}Mia sier: «Dobbelt så mange valgte bordtennis som sjakk.» Har Mia rett? Forklar.`, 'Ja. Bordtennis: 12 og sjakk: 6. 2 · 6 = 12.'))?.expected, undefined)
  })
})
