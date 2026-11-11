// Tester for referansebanken og AI-genereringen i Problemløsing: banken, koblingen mellom øktene og
// fagområdene, utvalget, kontrollene (regneuttrykk og regneart, modeller, flere steg, avrunding oppover,
// flervalg, fasit og tallområde), utfyllingen, «Andre ønsker» og at andre temaer er uendret.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { PROBLEM_SOLVING_AREAS, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import { divisionProblem } from './divisionChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { problemSolvingProblem, type ProblemSolvingContext } from './problemSolvingChecks.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { divisionReferences } from './references/division.ts'
import { multiplicationReferences } from './references/multiplication.ts'
import { PROBLEM_SOLVING_REFERENCE_COUNT, problemSolvingBankFile, problemSolvingReferences } from './references/problemSolving.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { PROBLEM_SOLVING_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(problemSolvingBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

const sessions = planned('problemlosing')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [STORY, MODEL, STEPS, CHOICE] = ['problemlosing-1', 'problemlosing-2', 'problemlosing-3', 'problemlosing-4']

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Problemløsing', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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
const ctx = (id: string): ProblemSolvingContext => ({ area: session(id).profile!.area as ProblemSolvingContext['area'] })
/** Årsaken fagkontrollen gir én oppgave i økta, eller null når den godtas. */
const problem = (id: string, task: AiTaskDraft) => problemSolvingProblem(task, ctx(id))
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
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-prob', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('referansebanken for Problemløsing', () => {
  it('1. inneholder 36 unike referanser, godkjent av valideringen, med alle feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(PROBLEM_SOLVING_REFERENCE_COUNT, 36)
    assert.equal(raw.referenceCount, 36)
    assert.equal(problemSolvingReferences.length, 36)
    assert.equal(new Set(problemSolvingReferences.map((r) => r.id)).size, 36)
    assert.equal(new Set(problemSolvingReferences.map((r) => r.studentText)).size, 36)
    assert.deepEqual(validateReferenceBank(raw, 36, PROBLEM_SOLVING_BANK).errors, [])
    assert.deepEqual(problemSolvingReferences, raw.references)
    for (const ref of problemSolvingReferences) {
      assert.match(ref.id, /^P[1-4]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'problemlosing')
      for (const field of ['format', 'studentText', 'solution', 'purpose', 'workedSolution'] as const) assert.ok(ref[field]?.trim(), `${ref.id}: ${field}`)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.ok(ref.teacherNote?.trim(), ref.id)
    }
    // Feltene fra vedlegget er beholdt (fasit, løsningsforslag, visuell støtte, lærernotat, svarform og flervalg).
    const ida = problemSolvingReferences.find((r) => r.id === 'P1-N1-01')!
    assert.equal(ida.solution, '34 + 18 = 52. Ida har 52 klinkekuler.')
    assert.equal(ida.workedSolution, 'Ida får flere, så vi legger sammen: 34 + 18 = 52.')
    assert.equal(ida.representationHint, 'Tegn tiere og enere for 34 og 18.')
    assert.equal(ida.format, 'regnefortelling')
    const claims = problemSolvingReferences.find((r) => r.id === 'P4-N3-03')!
    assert.deepEqual(claims.correctOptions, ['A', 'B', 'D'])
    assert.equal(claims.options?.length, 4)
    // Ni flervalgsreferanser; i én av dem (P4-N3-02) lager eleven alternativene selv.
    assert.equal(problemSolvingReferences.filter((r) => r.area === 'flervalg-begrunnelse' && r.options).length, 8)
    assert.equal(referenceBanks.filter((r) => r.topic === 'problemlosing').length, 36)
  })

  it('2. hvert av de fire fagområdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...new Set(problemSolvingReferences.map((r) => r.area))], [...PROBLEM_SOLVING_AREAS])
    for (const area of PROBLEM_SOLVING_AREAS) {
      for (const level of [1, 2, 3]) {
        assert.equal(problemSolvingReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
      }
    }
  })

  it('valideringen kontrollerer flervalgsmetadataene mot elevteksten og fasiten', () => {
    const index = (id: string) => bankJson().references.findIndex((r) => r.id === id)
    const wrongLetter = bankJson()
    wrongLetter.references[index('P4-N1-01')].correctOptions = ['C']
    assert.ok(validateReferenceBank(wrongLetter, 36, PROBLEM_SOLVING_BANK).errors.some((e) => e.includes('P4-N1-01') && e.includes('fasiten peker på B')))
    const missingOption = bankJson()
    missingOption.references[index('P4-N2-01')].options = ['41', '48', '9']
    assert.ok(validateReferenceBank(missingOption, 36, PROBLEM_SOLVING_BANK).errors.some((e) => e.includes('P4-N2-01') && e.includes('viser 4 alternativer')))
    const twoCorrect = bankJson()
    twoCorrect.references[index('P4-N1-02')].correctOptions = ['A', 'B']
    assert.ok(validateReferenceBank(twoCorrect, 36, PROBLEM_SOLVING_BANK).errors.some((e) => e.includes('P4-N1-02') && e.includes('flere riktige')))
  })

  it('referanse-ID-ene fra problemløsingsbanken vises aldri i synlige felt', () => {
    assert.ok(containsInternalText('Lag en oppgave som P2-N1-03.'))
  })

  it('alle 36 referansene består de faglige kontrollene for sitt område og nivå', () => {
    for (const ref of problemSolvingReferences) {
      const s = sessions.find((x) => x.profile?.area === ref.area)!
      // Hele kandidatkontrollen, uten oppgavesettet og uten referanser (ellers er referansen en kopi av seg selv).
      const request = serverRequest(s)
      request.levels = request.levels!.map((l) => ({ ...l, existing: [], referenceTasks: [] }))
      const rejected = checkCandidates([text(ref.level, ref.studentText, ref.solution)], request).rejected[0]?.reason ?? null
      assert.equal(rejected, null, `${ref.id}: ${ref.studentText}`)
    }
    assert.equal(
      problemSolvingReferences.find((r) => r.id === 'P2-N2-03')!.studentText,
      'Tre venner deler 54 kr likt. Tegn en blokkmodell med tre like deler. Hvor mange kroner får hver venn?',
    )
  })
})

describe('3. øktene i Problemløsing og fagområdene', () => {
  it('beholder fire økter med samme ID-er, overskrifter og rekkefølge, og kobler hver økt til ett fagområde', () => {
    const mapping = sessions.map((s) => [s.id, s.heading, s.profile?.area, (s.profile?.secondaryAreas ?? []).join(',')])
    assert.deepEqual(mapping, [
      ['problemlosing-1', 'Regnefortellinger og regneuttrykk', 'regnefortelling-regneuttrykk', ''],
      ['problemlosing-2', 'Bruke modeller', 'bruke-modeller', ''],
      ['problemlosing-3', 'Flerstegsoppgaver', 'flerstegsoppgaver', ''],
      ['problemlosing-4', 'Flervalgsoppgaver', 'flervalg-begrunnelse', ''],
    ])
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'problemlosing')!.weeks.map((w) => w.sessions.length), [2, 2])
  })

  it('velger bare referanser fra øktas fagområde og nivå', () => {
    for (const s of sessions) {
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'problemlosing' && r.area === s.profile!.area && r.level === level), `${s.id} nivå ${level}`)
        }
      }
    }
  })

  it('serveren sender referansene fra banken og sporer område, tema og referanse-ID-er', async () => {
    const s = session(STEPS)
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const body = JSON.stringify({ melding: '', oppgaver: [] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    await assert.rejects(handler(appRequest(s), { uid: 'l', classId: '4A' }))
    assert.ok(prompt.includes('Hovedtema: Problemløsing'))
    assert.ok(prompt.includes('Fagområde: Flerstegsoppgaver'))
    assert.ok(prompt.includes('minst to regnesteg'))
    assert.ok(prompt.includes('Nivåforskjellen handler om støtte og resonnement'))
    // Bare referanser fra P3 (flerstegsoppgaver), og bare elevtekst og fasit – ikke løsningsforslag eller lærernotat.
    const ids = [...prompt.matchAll(/ID: (P\d-N\d-\d{2})/g)].map((m) => m[1])
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id.startsWith('P3-')), ids.join(','))
    assert.ok(!prompt.includes('Mellomsvaret i steg 1 er ikke svaret på oppgaven.'), 'lærernotatet ble sendt')
  })

  it('den visuelle støtten sendes som tekst, ikke som en figur som mangler', () => {
    const ref = toAiReference(problemSolvingReferences.find((r) => r.id === 'P1-N3-01')!)
    assert.equal(ref.support, '[ 28 i kor ][ ? ikke i kor ] = 64')
    assert.equal(ref.representation, undefined)
    const prompt = taskPrompt({ ...serverRequest(session(STORY)), levels: serverRequest(session(STORY)).levels!.map((l) => (l.level === 3 ? { ...l, referenceTasks: [ref] } : l)) })
    assert.ok(prompt.includes('Visuell støtte (beskrevet med ord, ingen figur): [ 28 i kor ][ ? ikke i kor ] = 64'))
  })

  it('nivåene i økta får egne beskrivelser, tallområde og støttestruktur', () => {
    const levels = levelsFor(session(STEPS), 5, 6)
    assert.deepEqual(levels.map((l) => l.title), ['To steg med støtte', 'To steg', 'Flere steg – tolke og vurdere'])
    const contexts = buildLevelContexts(levels, buildTasks(session(STEPS)), session(STEPS).profile)
    assert.ok(contexts.every((c) => c.numbers && c.support && c.referenceTasks.length === 0 && c.existing!.length === 5))
  })
})

describe('grunnoppgavene i Problemløsing', () => {
  it('alle grunnoppgavene er tekstoppgaver og passer kontrollene i sin egen økt', () => {
    for (const s of sessions) {
      const tasks = buildTasks(s)
      assert.equal(tasks.length, 15, s.id)
      // Hele kandidatkontrollen, men uten oppgavesettet (der står jo oppgavene selv).
      const request = serverRequest(s)
      request.levels = request.levels!.map((l) => ({ ...l, existing: [] }))
      for (const t of tasks) {
        assert.equal(t.kind, 'text', `${s.id} ${t.id}`)
        if (t.kind !== 'text') continue
        assert.equal(checkCandidates([text(t.level, t.text, t.solution)], request).rejected[0]?.reason ?? null, null, `${s.id} ${t.id}: ${t.text}`)
      }
    }
  })

  it('nivå 1 i flerstegsøkta viser stegene, nivå 2 og 3 gjør det ikke', () => {
    const tasks = buildTasks(session(STEPS)).filter((t) => t.kind === 'text')
    assert.ok(tasks.filter((t) => t.level === 1).every((t) => t.kind === 'text' && /Steg 1:[\s\S]*Steg 2:/.test(t.text)))
    assert.ok(tasks.filter((t) => t.level > 1).every((t) => t.kind === 'text' && !/Steg \d:/.test(t.text)))
    assert.ok(tasks.some((t) => t.kind === 'text' && /minibusser trengs/.test(t.text)))
  })

  it('repetisjonsøktene med flerstegsoppgaver bruker de nye grunnoppgavene, og de består hele kontrollen', () => {
    const repetitions = unitSpecs
      .filter((u) => u.unitId !== 'problemlosing')
      .flatMap((u) => planned(u.unitId))
      .filter((s) => s.skills.some((k) => k.startsWith('prob.')))
    assert.deepEqual(repetitions.map((s) => [s.id, s.skills.filter((k) => k.startsWith('prob.')).join()]), [
      ['repetisjon-vinter-3', 'prob.flersteg'],
      ['repetisjon-var-4', 'prob.flersteg'],
    ])
    const request = serverRequest(session(STEPS))
    request.levels = request.levels!.map((l) => ({ ...l, existing: [] }))
    for (const s of repetitions) {
      const tasks = buildTasks(s)
      assert.equal(tasks.length, 15, s.id)
      // Oppgave nr. i (1–5) på hvert nivå kommer fra undertema nr. (i − 1) i økta (repetisjon bytter på undertemaene).
      const problemTasks = tasks.filter((t) => s.skills[(Number(t.id.split('-').at(-1)) - 1) % s.skills.length] === 'prob.flersteg')
      assert.equal(problemTasks.length, 6, s.id)
      for (const t of problemTasks) {
        if (t.kind !== 'text') continue
        assert.equal(checkCandidates([text(t.level, t.text, t.solution)], request).rejected[0]?.reason ?? null, null, `${t.id}: ${t.text}`)
      }
      assert.ok(problemTasks.filter((t) => t.level === 1).every((t) => t.kind === 'text' && /Steg 1:[\s\S]*Steg 2:/.test(t.text)), s.id)
      assert.ok(!problemTasks.some((t) => t.kind === 'text' && /Mia leser/.test(t.text)), s.id)
    }
  })

  it('flervalgsøkta har alternativene på egne linjer, og modelløkta viser til modeller som står i teksten', () => {
    for (const t of buildTasks(session(CHOICE))) assert.ok(t.kind === 'text' && /\nA\) .+\nB\) .+/.test(t.text), t.id)
    for (const t of buildTasks(session(MODEL))) assert.ok(t.kind === 'text' && /modell|tallinje|tabell|prikker/i.test(t.text), t.id)
  })
})

describe('4. referanser kopieres ikke', () => {
  const ref = problemSolvingReferences.find((r) => r.id === 'P3-N2-02')!

  it('ordrett, nesten ordrett med nye tall eller med samme tall og omskrevet ordlyd avvises', () => {
    assert.equal(reason(STEPS, text(2, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason(STEPS, text(2, 'Ane kjøper 4 bøker. Hver bok koster 35 kr. Hun betaler med 200 kr. Hvor mye får hun igjen?', '4 · 35 = 140 kr. 200 − 140 = 60 kr. Ane får 60 kr igjen.')), 'copiedReference')
    assert.equal(reason(STEPS, text(2, 'Hver bok koster 45 kr, og Ane kjøper 3 av dem. Hun betaler med 200 kr. Hvor mye får hun tilbake?', '3 · 45 = 135 kr. 200 − 135 = 65 kr. Hun får 65 kr tilbake.')), 'copiedReference')
  })

  it('en ny oppgave med egen formulering og nye tall godtas', () => {
    assert.equal(reason(STEPS, text(2, 'Klassen bestiller 6 pizzaer til 89 kr stykket. Læreren har 600 kr. Hvor mange kroner er igjen etter handelen?', '6 · 89 = 534 kr. 600 − 534 = 66 kr. Det er 66 kr igjen.')), null)
  })
})

describe('5. regneuttrykk og fasit stemmer i regnefortellinger', () => {
  it('riktig uttrykk og svar godtas', () => {
    assert.equal(reason(STORY, text(1, 'Jonas har 27 kort. Han får 15 kort av søsteren sin. Hvor mange kort har Jonas nå? Skriv regneuttrykket og svaret.', '27 + 15 = 42. Jonas har 42 kort.')), null)
  })

  it('et uttrykk som ikke gir svaret i fasiten, avvises', () => {
    assert.equal(reason(STORY, text(1, 'Jonas har 27 kort. Han får 15 kort av søsteren sin. Hvor mange kort har Jonas nå? Skriv regneuttrykket og svaret.', '27 + 15 = 32. Jonas har 32 kort.')), 'wrongSolution')
    assert.equal(reason(STORY, text(1, 'Jonas har 27 kort. Han får 15 kort av søsteren sin. Hvor mange kort har Jonas nå? Skriv regneuttrykket og svaret.', '27 + 15 = 42. Jonas har 43 kort.')), 'wrongSolution')
  })

  it('regnearten må passe handlingen: noe kommer til, noe tas bort, like grupper', () => {
    assert.equal(problem(STORY, text(1, 'Jonas har 27 kort. Han får 15 kort til. Hvor mange kort har Jonas nå? Skriv regneuttrykket og svaret.', '27 − 15 = 12. Jonas har 12 kort.')), 'wrongOperation')
    assert.equal(problem(STORY, text(1, 'Det er 64 elever på trinnet. 28 av dem går ikke på ski. Skriv regneuttrykket: Hvor mange går på ski?', '64 + 28 = 92. 92 elever går på ski.')), 'wrongOperation')
    assert.equal(problem(STORY, text(1, 'I salen står det 6 rader med 7 stoler i hver rad. Skriv regneuttrykket og finn hvor mange stoler det er.', '6 + 7 = 13. Det er 13 stoler.')), 'wrongOperation')
    assert.equal(problem(STORY, text(1, 'I salen står det 6 rader med 7 stoler i hver rad. Skriv regneuttrykket og finn hvor mange stoler det er.', '6 · 7 = 42. Det er 42 stoler.')), null)
  })

  it('når eleven lager fortellingen, må fasiten oppgi uttrykket og svaret det gir', () => {
    const task = 'Skriv en kort fortelling fra skolegården som passer til 4 · 9 + 6. Avslutt med et spørsmål, og regn ut.'
    assert.equal(reason(STORY, text(2, task, '4 · 9 + 6 = 42. Fortellingen må ha 4 like grupper med 9 i hver og 6 til.')), null)
    assert.equal(reason(STORY, text(2, task, 'Fortellingen må ha 4 like grupper og noe i tillegg.')), 'unclearSolution')
    assert.equal(reason(STORY, text(2, task, '4 · 9 + 6 = 40. Fortellingen må ha 4 like grupper med 9 i hver og 6 til.')), 'wrongSolution')
  })
})

describe('6. modelloppgaver krever en faktisk representasjon', () => {
  it('ordet «modell» alene er ikke nok', () => {
    assert.equal(reason(MODEL, text(2, 'Lag en modell og finn ut hvor mange flere kort Emil har enn Sara når Emil har 54 og Sara 38.', '54 − 38 = 16. Emil har 16 flere kort.')), 'missingModel')
  })

  it('blokkmodell i teksten, tegneinstruksjon, tallinje og tabell godtas', () => {
    assert.equal(reason(MODEL, text(1, 'Mia og Leo har 90 perler til sammen. Mia har 35. Blokkmodellen viser problemet:\n\nTil sammen: 90\n[ Mia: 35 ][ Leo: ? ]\n\nHvor mange perler har Leo?', '90 − 35 = 55. Leo har 55 perler.')), null)
    assert.equal(reason(MODEL, text(2, 'Leo har 46 kort. Mia har 18 kort. Tegn en blokkmodell med én stripe for Leo og én for Mia. Hvor mange flere kort har Leo?', '46 − 18 = 28. Leo har 28 flere kort.')), null)
    assert.equal(reason(MODEL, text(1, 'En sti er 600 meter. Tegn en tallinje fra 0 til 600 med et merke for hver 100 meter, og marker 400. Hvor langt er det fra 400 til 600?', '600 − 400 = 200. Det er 200 meter.')), null)
    assert.equal(reason(MODEL, text(2, 'En pakke kritt koster 12 kr. Fyll ut en tabell for 1 til 4 pakker. Hva koster 4 pakker?', '1: 12 kr, 2: 24 kr, 3: 36 kr, 4: 48 kr. 4 · 12 = 48, så prisen er 48 kr.')), null)
  })

  it('oppgaver som viser til en figur, et bilde eller en modell som mangler, avvises', () => {
    assert.equal(reason(MODEL, text(1, 'Se på blokkmodellen. Hvor mange perler har Leo?', '55 perler')), 'missingFigure')
    assert.equal(reason(MODEL, text(1, 'Se på figuren under og finn hvor mange kort Ola har til sammen.', '25 kort')), 'missingFigure')
    assert.equal(reason(MODEL, text(2, 'Bildet viser 4 poser med 6 epler. Tegn en blokkmodell og finn hvor mange epler det er.', '4 · 6 = 24.')), 'missingFigure')
  })
})

describe('7. flerstegsoppgaver må ha to steg og alle opplysningene', () => {
  it('en oppgave med bare ett steg avvises', () => {
    assert.equal(reason(STEPS, text(2, 'Tora har 58 kroner. Hun kjøper en bok til 39 kroner. Hvor mye har hun igjen?', '58 − 39 = 19. Tora har 19 kr igjen.')), 'missingSteps')
  })

  it('en løsning som ikke viser stegene, avvises', () => {
    assert.equal(reason(STEPS, text(2, 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?', '28 kr.')), 'missingSteps')
  })

  it('manglende opplysninger avvises', () => {
    assert.equal(reason(STEPS, text(2, 'Kari har noen poser med 8 drops i hver. Hun gir bort 5 drops. Hvor mange drops har hun igjen?', '3 · 8 = 24, 24 − 5 = 19. Kari har 19 drops igjen.')), 'missingInfo')
  })

  it('et mellomsvar er ikke det endelige svaret', () => {
    assert.equal(reason(STEPS, text(2, 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?', '3 · 24 = 72, 100 − 72 = 28. Ivar får 72 kr igjen.')), 'wrongSolution')
    assert.equal(reason(STEPS, text(2, 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?', '3 · 24 = 72, 100 − 72 = 28. Ivar får 28 kr igjen.')), null)
  })

  it('nivå 1 viser stegene, nivå 2 og 3 gjør det ikke', () => {
    const shown = 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr.\nSteg 1: Hva koster heftene?\nSteg 2: Hvor mye får han igjen?'
    const hidden = 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?'
    const solution = 'Steg 1: 3 · 24 = 72 kr. Steg 2: 100 − 72 = 28 kr. Ivar får 28 kr igjen.'
    assert.equal(reason(STEPS, text(1, shown, solution)), null)
    assert.equal(reason(STEPS, text(1, hidden, solution)), 'levelMismatch')
    assert.equal(reason(STEPS, text(2, shown, solution)), 'levelMismatch')
  })
})

describe('8. avrunding oppover ut fra konteksten', () => {
  const bus = 'Til skidagen skal 86 barn reise. 18 av dem blir kjørt av foreldre. De andre sitter på i minibusser med 20 seter i hver. Hvor mange minibusser må skolen bestille? Forklar.'

  it('når alle skal være med, rundes svaret opp', () => {
    assert.equal(reason(STEPS, text(3, bus, '86 − 18 = 68 barn tar minibuss. 68 : 20 = 3 rest 8. 3 minibusser er for lite. Skolen må bestille 4 minibusser.')), null)
  })

  it('rest-svaret godtas ikke når konteksten krever et helt antall som rundes opp', () => {
    assert.equal(reason(STEPS, text(3, bus, '86 − 18 = 68 barn tar minibuss. 68 : 20 = 3 rest 8. Skolen må bestille 3 minibusser.')), 'wrongRemainder')
    assert.equal(reason(STEPS, text(3, bus, '86 − 18 = 68 barn tar minibuss. 68 : 20 = 3 rest 8. Svaret er 3 minibusser og 8 barn til overs.')), 'wrongRemainder')
  })

  it('samme regel gjelder svaralternativer', () => {
    const choice = `${bus}\nA) 3\nB) 4\nC) 5`
    assert.equal(reason(CHOICE, text(3, choice, 'B) 4. 86 − 18 = 68. 68 : 20 = 3 rest 8, så skolen må bestille 4.')), null)
    assert.equal(reason(CHOICE, text(3, choice, 'A) 3. 86 − 18 = 68. 68 : 20 = 3 rest 8.')), 'wrongRemainder')
  })

  it('når spørsmålet bare gjelder hele grupper, er rest-svaret riktig (som i Divisjon)', () => {
    assert.equal(reason(STEPS, text(3, 'Til skidagen skal 86 barn reise. 18 av dem blir kjørt. De andre deles i lag med 20 i hvert. Hvor mange fulle lag blir det? Forklar.', '86 − 18 = 68. 68 : 20 = 3 rest 8. Det blir 3 fulle lag.')), null)
  })
})

describe('9. flervalgsoppgaver har nøyaktig ett riktig alternativ, med mindre flere er tydelig oppgitt', () => {
  const question = 'Ella har 37 perler. Hun får 8 perler til. Hvor mange perler har hun nå?'

  it('ett riktig alternativ med plausible distraktorer godtas', () => {
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 35\nD) 44`, 'B) 45. 37 + 8 = 45.')), null)
  })

  it('null riktige eller flere riktige alternativer avvises', () => {
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 35\nD) 44`, '37 + 8 = 45.')), 'unclearSolution')
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 35\nD) 44`, 'B og D. 37 + 8 = 45.')), 'invalidOptions')
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 35`, 'E) 45. 37 + 8 = 45.')), 'invalidOptions')
  })

  it('flere riktige godtas når oppgaveteksten sier det tydelig', () => {
    const claims = 'Oppgave: «Det er 4 bord med 6 stoler ved hvert bord. 3 stoler er ødelagte. Hvor mange stoler kan brukes?»\nHvilke påstander er sanne? Det kan være mer enn én. Forklar.\nA) Svaret er 21.\nB) Oppgaven kan løses med 4 + 6 − 3.\nC) Svaret er mindre enn 24.'
    assert.equal(reason(CHOICE, text(3, claims, 'A og C er sanne. 4 · 6 = 24, 24 − 3 = 21. B er feil fordi 4 + 6 − 3 = 7.')), null)
    assert.equal(reason(CHOICE, text(3, claims.replace(' Det kan være mer enn én.', ''), 'A og C er sanne. 4 · 6 = 24, 24 − 3 = 21. B er feil fordi 4 + 6 − 3 = 7.')), 'invalidOptions')
  })

  it('fasiten må peke på et alternativ som faktisk er riktig', () => {
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 35\nD) 44`, 'D) 44. 37 + 8 = 45.')), 'wrongSolution')
  })

  it('like alternativer, tilfeldige gale svar og to riktige regneuttrykk avvises', () => {
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 45\nD) 44`, 'B) 45. 37 + 8 = 45.')), 'invalidOptions')
    assert.equal(reason(CHOICE, text(1, `${question}\nA) 29\nB) 45\nC) 61\nD) 44`, 'B) 45. 37 + 8 = 45.')), 'invalidOptions')
    const expressions = 'Det er 7 lag med 5 barn på hvert lag. Hvilket regneuttrykk viser hvor mange barn det er?\nA) 7 · 5\nB) 5 · 7\nC) 7 + 5'
    assert.equal(reason(CHOICE, text(1, expressions, 'A) 7 · 5. Det er 35 barn.')), 'invalidOptions')
  })
})

describe('10. feil fasit og oppgaver utenfor øktas område avvises', () => {
  it('feil fasit og selvmotsigende løsning', () => {
    assert.equal(reason(STEPS, text(2, 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?', '3 · 24 = 74, 100 − 74 = 26. Ivar får 26 kr igjen.')), 'wrongSolution')
    assert.equal(reason(STEPS, text(2, 'Ivar kjøper 3 hefter til 24 kr hvert og betaler med 100 kr. Hvor mye får han igjen?', '3 · 24 = 72, 100 − 72 = 28. Nei vent, jeg regner på nytt: 28 kr.')), 'unclearSolution')
  })

  it('fasiten avslørt i oppgaveteksten', () => {
    assert.equal(reason(STORY, text(1, 'Mia har 23 kr og får 14 kr. Skriv regneuttrykket 23 + 14 = 37 og forklar.', '23 + 14 = 37. Mia har 37 kr.')), 'revealedSolution')
  })

  it('innhold utenfor problemløsing, desimaltall, negative tall og tall utenfor tallområdet', () => {
    assert.equal(reason(STORY, text(1, 'En pizza deles i 8 biter. Skriv regneuttrykket for hvor stor brøk 3 biter er.', '3/8')), 'offTopic')
    assert.equal(reason(STORY, text(1, 'En is koster 12,50 kr og en brus 10 kr. Skriv regneuttrykket og svaret.', '12,50 + 10 = 22,50')), 'offTopic')
    assert.equal(reason(STORY, text(1, 'En skole har 450 elever. 120 elever kommer til. Hvor mange elever er det nå? Skriv regneuttrykket og svaret.', '450 + 120 = 570. Det er 570 elever.')), 'outsideRange')
  })

  it('oppgaver som hører til et annet fagområde eller format enn økta', () => {
    // I flervalgsøkta: ingen svaralternativer.
    assert.equal(reason(CHOICE, text(1, 'Ella har 37 perler. Hun får 8 perler til. Hvor mange perler har hun nå?', '37 + 8 = 45.')), 'wrongArea')
    // I regnefortellingsøkta: ikke noe regneuttrykk eller fortelling.
    assert.equal(reason(STORY, text(1, 'Ella har 37 perler. Hun får 8 perler til. Hvor mange perler har hun nå?', '45 perler.')), 'wrongArea')
    // Et regnestykke appen retter viser uttrykket eleven skal finne.
    const math: AiTaskDraft = { format: 'math', level: 1, taskType: 'Hoderegning', instruction: 'Regn ut.', a: 34, operator: '+', b: 18, competenceGoal: '', adaptation: '' }
    assert.equal(reason(STORY, math), 'format')
  })
})

describe('11. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(STEPS)
  const ok1 = (p: number, m: number) =>
    story(1, `Lise har ${m} kr. Hun kjøper 2 bøker som koster ${p} kr hver.\nSteg 1: Hva koster bøkene?\nSteg 2: Hvor mye har Lise igjen?`, `Steg 1: 2 · ${p} = ${2 * p} kr. Steg 2: ${m} − ${2 * p} = ${m - 2 * p} kr. Lise har ${m - 2 * p} kr igjen.`)
  const ok2 = (k: number, p: number, paid: number) =>
    story(2, `Klassen kjøper ${k} fotballer til ${p} kr per ball og betaler med ${paid} kr. Hvor mange kroner får klassen tilbake?`, `${k} · ${p} = ${k * p} kr. ${paid} − ${k * p} = ${paid - k * p} kr. Klassen får ${paid - k * p} kr tilbake.`)
  const ok3 = (total: number, walk: number, seats: number) => {
    const bus = total - walk
    const [q, r] = [Math.floor(bus / seats), bus % seats]
    return story(3, `${total} barn skal på leirskole. ${walk} av dem kjører med foreldrene. Resten tar buss. Hver buss har plass til ${seats} barn. Hvor mange busser trengs? Forklar.`, `${total} − ${walk} = ${bus}. ${bus} : ${seats} = ${q} rest ${r}. Det trengs ${q + 1} busser.`)
  }

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(14, 50),
        // Bare ett steg.
        story(1, 'Lise har 50 kr. Hun kjøper en bok til 18 kr.\nSteg 1: Hvor mye har hun igjen?\nSteg 2: Skriv svaret.', 'Steg 1: 50 − 18 = 32 kr. Lise har 32 kr igjen.'),
        ok2(4, 35, 200),
        ok2(3, 120, 400),
        ok3(95, 12, 25),
        // Rest-svaret når alle skal være med.
        story(3, '70 barn skal på tur. 10 av dem sykler. Resten tar buss. Hver buss har plass til 25 barn. Hvor mange busser trengs? Forklar.', '70 − 10 = 60. 60 : 25 = 2 rest 10. Det trengs 2 busser.'),
      ],
      [ok1(16, 100), ok3(77, 9, 15)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_missingSteps, 1)
    assert.equal(final.removed_wrongRemainder, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'problemlosing')
    assert.equal(final.area, 'flerstegsoppgaver')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'Lise har 50 kr. Hun kjøper en bok til 18 kr. Hvor mye har hun igjen?', '32 kr')
    const { handler, calls } = scripted([[wrong, wrong, ok2(4, 35, 200), ok2(3, 120, 400), ok3(95, 12, 25), ok3(77, 9, 15)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('12. «Andre ønsker» kan ikke overstyre fagområde, nivå eller matematisk korrekthet', () => {
  const wishes = 'Lag oppgaver om fotball med store tall og desimaltall. Gjerne feilfinning på nivå 1, og bare ett regnesteg.'

  it('ønskene endrer ikke fagområde, nivå, tallområde eller fasit', () => {
    assert.equal(reason(STEPS, text(2, 'Laget har 58 fotballer. 19 blir borte. Hvor mange fotballer er igjen?', '58 − 19 = 39. Laget har 39 fotballer igjen.'), wishes), 'missingSteps')
    assert.equal(reason(STEPS, text(2, 'En fotball koster 249,50 kr. Laget kjøper 3 baller og betaler med 1000 kr. Hvor mye får laget igjen?', '3 · 249,50 = 748,50. 1000 − 748,50 = 251,50.'), wishes), 'offTopic')
    assert.equal(reason(STEPS, text(2, 'Klubben selger 4 500 billetter til 120 kr. 300 billetter blir refundert. Hvor mye får klubben?', '4 500 − 300 = 4 200. 4 200 · 120 = 504 000 kr.'), wishes), 'outsideRange')
    assert.equal(
      reason(STEPS, text(1, 'Oppgave: «Laget har 3 kurver med 8 baller i hver. 5 baller blir borte.» Petter regner slik: 8 − 5 = 3. Hva har Petter glemt?\nSteg 1: Hvor mange baller er det?\nSteg 2: Hvor mange er igjen?', 'Petter har glemt kurvene. Steg 1: 3 · 8 = 24. Steg 2: 24 − 5 = 19.'), wishes),
      'levelMismatch',
    )
    assert.equal(reason(STEPS, text(2, 'Laget kjøper 4 fotballer til 85 kr per ball og betaler med 400 kr. Hvor mye får laget igjen?', '4 · 85 = 340 kr. 400 − 340 = 70 kr. Laget får 70 kr igjen.'), wishes), 'wrongSolution')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta', () => {
    assert.equal(reason(STEPS, text(2, 'Laget kjøper 4 fotballer til 85 kr per ball og betaler med 400 kr. Hvor mye får laget igjen?', '4 · 85 = 340 kr. 400 − 340 = 60 kr. Laget får 60 kr igjen.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(STEPS), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('Fagområde: Flerstegsoppgaver'))
  })
})

describe('13. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de fire andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(referenceBanks.filter((r) => !['problemlosing', 'tall-og-regning'].includes(r.topic)).length, 54 + 45 + 36 + 36)
    for (const [area, level, own] of [['tabell-6-7-8-9', 2, multiplicationReferences], ['modeller', 3, divisionReferences]] as const) {
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(own, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene og arbeidsarkene er uendret – i repetisjon bare oppgavene fra Problemløsing og Tall og regning', () => {
    // Tall og regning og repetisjonsøkter med undertema derfra er endret senere (se numbersAndOperationsAi.test.ts).
    const touched = (s: Planned) => s.skills.some((k) => k.startsWith('prob.') || k.startsWith('tr.'))
    const all = unitSpecs.filter((u) => !['problemlosing', 'tall-og-regning'].includes(u.unitId)).flatMap((u) => planned(u.unitId))
    const others = all
      .filter((s) => !touched(s))
      .map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))
    assert.equal(others.length, 71)
    assert.equal(hash(JSON.stringify(others)), '07c638fb37b77cd9')
    assert.deepEqual(all.filter(touched).map((s) => s.id), ['repetisjon-vinter-3', 'repetisjon-vinter-4', 'repetisjon-var-4'])
    // «Dette mestrer jeg» (bare Problemløsing): samme overskrift, undertema, nivåer, oppgave-ID-er og regnestykker fra Regning.
    const kept = all
      .filter((s) => s.id === 'repetisjon-var-4')
      .map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, levels: levelsFor(s, 5, 6), ids: buildTasks(s).map((t) => t.id), math: buildTasks(s).filter((t) => t.kind !== 'text') }))
    assert.equal(hash(JSON.stringify(kept)), '95e64256a9bda463')
    assert.equal(hash(JSON.stringify(worksheetTasks)), 'd20a8f714743442c')
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })

  it('problemløsingskontrollene gjelder ikke andre temaer, og avrundingen i Divisjon virker som før', () => {
    // En divisjonsøkt får ikke problemløsingskontrollene (f.eks. krav om svaralternativer eller to steg).
    const division = planned('divisjon').find((x) => x.id === 'divisjon-6')!
    const request = appRequest(division)
    request.lesson.topic = 'Divisjon'
    assert.equal(checkCandidates([text(2, '23 barn skal i båter med plass til 5. Hvor mange båter trengs for at alle skal få plass?', '5 båter')], request).rejected[0]?.reason ?? null, null)
    const ctxRest = { area: 'divisjon-med-rest' as const }
    assert.equal(divisionProblem(text(2, '22 elever skal i biler med plass til 5. Hvor mange biler trengs?', '4 biler'), ctxRest), 'wrongRemainder')
    assert.equal(divisionProblem(text(2, '22 elever skal i biler med plass til 5. Hvor mange biler trengs?', '5 biler'), ctxRest), null)
  })
})
