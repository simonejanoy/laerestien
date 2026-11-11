// Tester for kravet om figur i nye AI-oppgaver: i «todimensjonale figurer» skal hver oppgave ha en plan figur
// og i «vinkler» en vinkel, og teksten skal vise til figuren. Plane figurer har sider og hjørner – ikke kanter.
// Manglende figur gir avvisning og erstatning gjennom utfyllingen. «Juster med AI» beholder figuren som før.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, AiTaskDraft, AiVisual, TaskRequest } from '../src/ai/contract.ts'
import { applyRevision, toDraft } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import type { TextTask } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import { checkCandidates } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'
import { visualProblem } from './visualChecks.ts'

const session = (id: string) => planned('geometri').find((s) => s.id === id)!

function appRequest(s: Planned): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Geometri', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel: 2,
    officialGoals: '',
    wishes: '',
    levels: buildLevelContexts(levelsFor(s, 5, 6), buildTasks(s), s.profile),
    profile: toAiProfile(s.profile!),
  }
}
function serverRequest(s: Planned) {
  const request = appRequest(s)
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

const text = (level: AiLevel, studentText: string, solution: string, figure?: AiVisual): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '', ...(figure && { figure }) })
const reason = (id: string, task: AiTaskDraft) => checkCandidates([task], serverRequest(session(id))).rejected[0]?.reason ?? null

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string, figur?: Raw): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit, kompetansemaal: '', tilpasning: 'Nivå.', ...(figur && { figur }) })
const shapeStory = (nivaa: AiLevel, form: string, sider: number) =>
  story(nivaa, `Se på figuren. Hvor mange sider og hjørner har den?`, `${sider} sider og ${sider} hjørner`, { type: 'figur', form })
const angleStory = (nivaa: AiLevel, d: number) =>
  story(nivaa, `Se på figuren. Vinkelen er ${d}°. Er den spiss, rett eller stump?`, d < 90 ? 'Spiss vinkel' : d === 90 ? 'Rett vinkel' : 'Stump vinkel', {
    type: 'vinkel',
    vinkeltype: d < 90 ? 'spiss' : d === 90 ? 'rett' : 'stump',
    grader: d,
  })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const prompts: string[] = []
  const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req', newSeed: () => 4 })
  return { handler, logs, prompts, calls: () => calls }
}

/** Hver returnerte oppgave har en figur av riktig type, og figuren passer teksten og fasiten. */
function assertFiguresFit(tasks: AiTaskDraft[], kind: 'shape' | 'angle', area: 'todimensjonale-figurer' | 'vinkler') {
  for (const t of tasks) {
    assert.ok(!('format' in t && t.format === 'math'), 'ingen regnestykker uten figur')
    const draft = t as Extract<AiTaskDraft, { studentText: string }>
    assert.equal(draft.figure?.kind, kind, draft.studentText)
    assert.match(draft.studentText, /figuren/i)
    assert.equal(visualProblem(draft, { area }), null, draft.studentText)
  }
}

describe('todimensjonale figurer: hver ny oppgave har en plan figur', () => {
  it('en kandidat uten figur avvises – også en riktig oppgave med figuren beskrevet med ord', () => {
    assert.equal(reason('geometri-1', text(1, 'Hvor mange sider og hjørner har en sekskant?', '6 sider og 6 hjørner')), 'figureRequired')
    assert.equal(reason('geometri-2', text(2, 'Hvor mange symmetrilinjer har et kvadrat?', '4 symmetrilinjer')), 'figureRequired')
  })

  it('teksten må vise til den synlige figuren', () => {
    assert.equal(reason('geometri-1', text(1, 'Hvor mange sider har en femkant?', '5 sider', { kind: 'shape', shape: 'pentagon' })), 'figureRequired')
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange sider har den?', '5 sider', { kind: 'shape', shape: 'pentagon' })), null)
  })

  it('en vinkel i stedet for en plan figur avvises', () => {
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hva slags vinkel er det?', 'Rett vinkel', { kind: 'angle', angleType: 'right' })), 'irrelevantVisual')
  })

  it('«kanter» om en plan figur avvises – «sider og hjørner» godtas', () => {
    const square: AiVisual = { kind: 'shape', shape: 'square' }
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange kanter og hjørner har den?', '4 kanter og 4 hjørner', square)), 'wrongTerm')
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange sider har den?', '4 sider. Alle kantene er like lange.', square)), 'wrongTerm')
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange sider og hjørner har den?', '4 sider og 4 hjørner', square)), null)
    // «Firkant», «trekant» og andre ord som slutter på «kant», er ikke «kanter».
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Er den en firkant eller en femkant?', 'Femkant', { kind: 'shape', shape: 'pentagon' })), null)
  })

  it('3D-oppgaver kan fortsatt bruke «kanter» – og trenger ingen figur', () => {
    assert.equal(reason('geometri-3', text(2, 'Hvor mange kanter har et trekantet prisme?', '9 kanter')), null)
    assert.equal(reason('geometri-4', text(2, 'En kube brettes ut til et nett. Hvor mange kanter hadde kuben?', '12 kanter')), null)
  })

  it('en bestilling erstatter kandidater uten figur og leverer to per nivå, alle med plan figur som passer', async () => {
    const { handler, logs, calls, prompts } = scripted([
      [
        shapeStory(1, 'trekant', 3),
        story(1, 'Hvor mange sider har en sekskant?', '6 sider'),
        shapeStory(2, 'åttekant', 8),
        story(2, 'Se på figuren. Hvor mange kanter har den?', '6 kanter', { type: 'figur', form: 'sekskant' }),
        shapeStory(3, 'femkant', 5),
        shapeStory(3, 'kvadrat', 4),
      ],
      [shapeStory(1, 'sirkel', 0), shapeStory(2, 'sekskant', 6)],
    ])
    const result = await handler(appRequest(session('geometri-1')), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assertFiguresFit(result.tasks, 'shape', 'todimensjonale-figurer')
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_figureRequired, 1)
    assert.equal(final.removed_wrongTerm, 1)
    assert.match(prompts[0], /Alle oppgavene skal ha en plan figur/)
    assert.match(prompts[0], /sider og hjørner/)
  })
})

describe('vinkler: hver ny oppgave har en vinkelillustrasjon', () => {
  it('en vinkeloppgave uten figur avvises – også som regnestykke', () => {
    assert.equal(reason('geometri-5', text(1, 'Er en vinkel på 40° spiss, rett eller stump?', 'Spiss')), 'figureRequired')
    const mathDraft: AiTaskDraft = { format: 'math', level: 2, taskType: 'Hoderegning', instruction: 'En rett vinkel deles i to. Den ene delen er 40°. Hvor stor er den andre?', a: 90, operator: '-', b: 40, competenceGoal: '', adaptation: '' }
    assert.equal(reason('geometri-6', mathDraft), 'figureRequired')
    assert.equal(reason('geometri-5', text(1, 'Se på figuren. Hvor mange sider har den?', '3 sider', { kind: 'shape', shape: 'triangle' })), 'irrelevantVisual')
  })

  it('en bestilling erstatter vinkeloppgaver uten vinkel og leverer to per nivå, alle med vinkel som passer', async () => {
    const { handler, logs, calls, prompts } = scripted([
      [
        angleStory(1, 30),
        story(1, 'Er en vinkel på 120° spiss, rett eller stump?', 'Stump'),
        angleStory(2, 90),
        angleStory(2, 135),
        angleStory(3, 75),
        story(3, 'Hvor stor er en kvart omdreining?', '90°'),
      ],
      [angleStory(1, 150), angleStory(3, 100)],
    ])
    const result = await handler(appRequest(session('geometri-5')), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assertFiguresFit(result.tasks, 'angle', 'vinkler')
    assert.equal(logs.find((e) => e.event === 'general_tasks')!.removed_figureRequired, 2)
    assert.match(prompts[0], /Alle oppgavene skal ha en vinkel/)
  })

  it('når erstatningene heller ikke har figur, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const noFigure = story(1, 'Er en vinkel på 30° spiss, rett eller stump?', 'Spiss')
    const { handler, calls } = scripted([[noFigure, noFigure, angleStory(2, 90), angleStory(2, 135), angleStory(3, 75), angleStory(3, 100)], [noFigure]])
    const result = await handler(appRequest(session('geometri-6')), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })

  it('prompten krever tekstoppgaver med vinkel også når oppgavesettet har regnestykker', () => {
    const prompt = taskPrompt(serverRequest(session('geometri-6')))
    assert.match(prompt, /Alle oppgavene skal ha en vinkel/)
    assert.ok(!prompt.includes('lag format «regnestykke»'))
  })
})

describe('andre områder og «Juster med AI» er uendret', () => {
  it('«Fra 3D til 2D» krever ikke figur', () => {
    assert.equal(reason('geometri-4', text(1, 'En sylinder brettes ut. Hvilke figurer består nettet av?', '2 sirkler og 1 rektangel')), null)
  })

  it('«Juster med AI» beholder figuren, og læreren kan fortsatt fjerne den', async () => {
    const original: TextTask = {
      kind: 'text',
      id: 't',
      level: 1,
      text: 'Se på figuren. Hvor mange sider og hjørner har den?',
      solution: '3 sider og 3 hjørner',
      competenceGoal: '',
      adaptation: '',
      aiGenerated: false,
      reviewed: true,
      figure: { kind: 'shape', shape: 'triangle' },
    }
    const run = async (instruction: string, reply: Raw) => {
      const { handler } = scripted([[reply]])
      const result = await handler({ kind: 'revise', context: { subject: 'Matematikk', grade: '4. trinn', topic: 'Geometri' }, task: toDraft(original), instruction }, { uid: 'l', classId: '4A' })
      return applyRevision(original, result)
    }
    const kept = await run('Bruk enklere ord.', story(1, 'Se på figuren. Tell sidene og hjørnene.', '3 sider og 3 hjørner'))
    assert.deepEqual(kept.task?.figure, { kind: 'shape', shape: 'triangle' })
    const removed = await run('Fjern figuren.', story(1, 'En figur har tre rette sider. Hvor mange hjørner har den?', '3 hjørner', { type: 'ingen' }))
    assert.ok(removed.task)
    assert.equal(removed.task!.figure, undefined)
  })
})
