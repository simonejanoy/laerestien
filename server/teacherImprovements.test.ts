// Tester for forbedringene i lærerdelen: valg av nivåer og antall i «Lag oppgaver med AI», duplikatkontroll også i
// økter uten fagområde, fagområde for repetisjonsøkter og egne økter (så «Klokka» ikke gir addisjon), samsvar mellom
// Temaoversikt og detaljvisningen i statistikken, og at «Profiltekst og nivå» er fjernet. Ingen ekte Gemini-kall.
// Kjør: npm test

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { MAX_PER_LEVEL, targetLevelsOf, type AiLevel, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { isCompletePackage } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { aiProfileFor } from '../src/ai/sessionProfile.ts'
import { buildTasks, levelsFor, planned } from '../src/features/sessions/sessionTasks.ts'
import { classMastery, classTopics, masteryOf, topicInsights } from '../src/features/statistics/mockData.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { LevelGroup, SessionTask } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { checkCandidates } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const lesson = { subject: 'Matematikk', grade: '4. trinn', topic: 'Multiplikasjon', sessionHeading: 'Egen økt', sessionDescription: '', sessionGoals: [] }
const levels: LevelGroup[] = ([1, 2, 3] as const).map((level) => ({ level, title: `Nivå ${level}`, subtitle: '', description: '', taskCount: 0, studentCount: 0 }))
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
const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
const sessionTask = (id: string, level: AiLevel, a: number, b: number): SessionTask => ({ id, level, type: 'Hoderegning', instruction: 'Regn ut.', a, operator: '*', b })

/** Kandidatkontrollen for en økt slik «Lag oppgaver med AI» bestiller (med profilen fra aiProfileFor). */
function reason(session: Parameters<typeof aiProfileFor>[0], task: AiTaskDraft, existing: SessionTask[] = []) {
  const profile = aiProfileFor(session)?.profile
  const request: Extract<TaskRequest, { kind: 'general' }> = {
    kind: 'general',
    lesson,
    perLevel: 2,
    officialGoals: '',
    wishes: '',
    levels: buildLevelContexts(levels, existing, profile),
    ...(profile && { profile: toAiProfile(profile) }),
  }
  return checkCandidates([task], request).rejected[0]?.reason ?? null
}

type Raw = Record<string, unknown>
const raw = (nivaa: AiLevel, a: number, b: number): Raw => ({ nivaa, format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', tall1: a, regneart: '·', tall2: b, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: 'Nivå.' })

function scripted(responses: Raw[][]) {
  let calls = 0
  const prompts: string[] = []
  const logs: AiLogEntry[] = []
  const generate = async (_use: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-niva', newSeed: () => 3 })
  return { handler, prompts, logs, calls: () => calls }
}

const order = (perLevel: number, targetLevels?: unknown): Extract<TaskRequest, { kind: 'general' }> =>
  ({ kind: 'general', lesson, perLevel, officialGoals: '', wishes: '', levels: buildLevelContexts(levels, []), ...(targetLevels !== undefined && { targetLevels }) }) as never

describe('«Lag oppgaver med AI»: valgte nivåer og antall per nivå', () => {
  it('bare de valgte nivåene bestilles og leveres – med nøyaktig det bestilte antallet', async () => {
    const { handler, prompts, logs } = scripted([[raw(2, 3, 4), raw(2, 3, 6), raw(2, 3, 7), raw(2, 3, 8), raw(1, 2, 2)]])
    const result = await handler(order(3, [2]), { uid: 'l', classId: '4A' })
    assert.deepEqual(result.tasks.map((t) => t.level), [2, 2, 2])
    assert.ok(prompts[0].includes('oppgaver på hvert av nivå 2') || prompts[0].includes('kandidater på hvert av nivå 2'), prompts[0])
    assert.ok(prompts[0].includes('Lag ingen oppgaver på andre nivåer enn nivå 2'))
    assert.equal(logs.find((e) => e.event === 'general_tasks')?.delivered, true)
  })

  it('uten valg (eldre bestillinger) lages oppgaver på alle tre nivåene, som før', async () => {
    assert.deepEqual(targetLevelsOf(undefined), [1, 2, 3])
    assert.deepEqual(targetLevelsOf([3, 1, 1]), [1, 3])
    const { handler } = scripted([[raw(1, 2, 3), raw(2, 3, 4), raw(3, 4, 5)]])
    const result = await handler(order(1), { uid: 'l', classId: '4A' })
    assert.deepEqual(result.tasks.map((t) => t.level), [1, 2, 3])
  })

  it('validering: minst ett nivå, og antallet er et positivt heltall (høyst MAX_PER_LEVEL)', async () => {
    const { handler } = scripted([[raw(1, 2, 3)]])
    for (const bad of [0, -1, 2.5, MAX_PER_LEVEL + 1, Number.NaN]) {
      await assert.rejects(handler(order(bad), { uid: 'l', classId: '4A' }), /helt tall/, String(bad))
    }
    for (const bad of [[], [4], [1, 5], 'alle']) {
      await assert.rejects(handler(order(1, bad), { uid: 'l', classId: '4A' }), /minst ett nivå/, JSON.stringify(bad))
    }
  })

  it('appen godtar bare en komplett pakke på de valgte nivåene', () => {
    const drafts = [math(1, 2, '*', 3), math(3, 4, '*', 5)]
    assert.equal(isCompletePackage(drafts, 1, [1, 3]), true)
    assert.equal(isCompletePackage(drafts, 1), false)
    assert.equal(isCompletePackage([...drafts, math(2, 6, '*', 7)], 1, [1, 3]), false)
  })

  it('skjemaet har avkrysningsbokser for nivå 1–3 (alle valgt), et tallfelt og validering', () => {
    const source = readFileSync(new URL('../src/features/tasks/AiTaskGenerator.tsx', import.meta.url), 'utf8')
    assert.match(source, /useState<AiLevel\[\]>\(ALL_LEVELS\)/)
    assert.match(source, /type="checkbox"/)
    assert.match(source, /type="number"/)
    assert.match(source, /Velg minst ett nivå\./)
    assert.match(source, /Antall oppgaver må være et positivt heltall\./)
    assert.match(source, /targetLevels: levels/)
  })
})

describe('duplikater: også i økter uten fagområde', () => {
  const none = { heading: 'Egen økt', topicId: 'finnes-ikke' }
  const existing = [sessionTask('a', 1, 5, 5), sessionTask('b', 1, 2, 3)]

  it('oppgavesettet sendes med for alle økter, så serveren kan sammenligne', () => {
    const contexts = buildLevelContexts(levels, existing)
    assert.deepEqual(contexts[0].existing?.map((t) => `${t.a}${t.operator}${t.b}`), ['5*5', '2*3'])
  })

  it('like oppgaver, byttede faktorer og like oppgaver i samme svar avvises', () => {
    assert.equal(aiProfileFor(none), null)
    assert.equal(reason(none, math(1, 5, '*', 5), existing), 'duplicateInSet')
    assert.equal(reason(none, math(1, 3, '*', 2), existing), 'swappedFactors')
    const request = { kind: 'general', lesson, perLevel: 2, officialGoals: '', wishes: '', levels: buildLevelContexts(levels, []) } as const
    const checked = checkCandidates([math(1, 2, '*', 2), math(1, 2, '*', 2), math(1, 4, '*', 6), math(1, 6, '*', 4)], request)
    assert.deepEqual(checked.rejected.map((r) => r.reason), ['duplicateInResponse', 'duplicateInResponse'])
    assert.equal(reason(none, math(1, 7, '*', 8), existing), null)
  })

  it('grunnoppgavene i årsplanen har ingen helt like oppgaver på samme nivå', () => {
    for (const s of unitSpecs.flatMap((u) => planned(u.unitId))) {
      for (const level of [1, 2, 3]) {
        const keys = buildTasks(s)
          .filter((t) => t.level === level)
          .map((t) => (t.kind === 'text' ? t.text.toLowerCase().trim() : `${t.a}${t.operator}${t.b}`))
        assert.equal(new Set(keys).size, keys.length, `${s.id} nivå ${level}`)
      }
    }
  })
})

describe('fagområde for økter uten egen profil (repetisjon og egne økter)', () => {
  const all = unitSpecs.flatMap((u) => planned(u.unitId))

  it('alle repetisjonsøkter får et fagområde fra undertemaene sine, og årsplanen er uendret', () => {
    const repetitions = all.filter((s) => !s.profile?.area)
    assert.equal(repetitions.length, 14)
    for (const s of repetitions) {
      const before = JSON.stringify({ heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6) })
      const derived = aiProfileFor({ heading: s.heading, skillIds: s.skills, topicId: s.spec.unitId, taskProfile: s.profile })
      assert.ok(derived?.profile.area, s.id)
      assert.equal(derived?.source, 'skills', s.id)
      assert.equal(JSON.stringify({ heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6) }), before)
    }
    const geo = all.find((s) => s.id === 'repetisjon-vinter-1')!
    assert.deepEqual(
      [aiProfileFor({ heading: geo.heading, skillIds: geo.skills, topicId: geo.spec.unitId })?.profile.area, aiProfileFor({ heading: geo.heading, skillIds: geo.skills, topicId: geo.spec.unitId })?.profile.secondaryAreas],
      ['todimensjonale-figurer', ['tredimensjonale-figurer']],
    )
  })

  it('øktene i årsplanen beholder sin egen profil', () => {
    for (const s of all.filter((x) => x.profile?.area)) {
      assert.equal(aiProfileFor({ heading: s.heading, skillIds: s.skills, topicId: s.spec.unitId, taskProfile: s.profile })?.profile, s.profile, s.id)
    }
  })

  it('egne økter får fagområdet ut fra overskriften, ellers hele temaet', () => {
    const area = (topicId: string, heading: string) => aiProfileFor({ heading, topicId })?.profile
    assert.equal(area('maling', 'Klokka')?.area, 'tid')
    assert.equal(area('geometri', 'Vinkler')?.area, 'vinkler')
    assert.equal(area('monster-og-algoritmer', 'Tallfølger')?.area, 'tallfolger')
    const geometry = area('geometri', 'Geometri')!
    assert.equal(aiProfileFor({ heading: 'Geometri', topicId: 'geometri' })?.source, 'topic')
    assert.deepEqual([geometry.area, ...(geometry.secondaryAreas ?? [])], ['todimensjonale-figurer', 'tredimensjonale-figurer', 'fra-3d-til-2d', 'vinkler'])
    assert.equal(aiProfileFor({ heading: 'Noe annet', topicId: 'finnes-ikke' }), null)
  })

  it('regnestykker uten det valgte innholdet avvises: «Klokka», «Måleenheter» og «Geometri»', () => {
    assert.equal(reason({ heading: 'Klokka', topicId: 'maling' }, math(1, 24, '+', 13)), 'missingUnit')
    assert.equal(reason({ heading: 'Måleenheter', topicId: 'maling' }, math(1, 6, '*', 7)), 'missingUnit')
    assert.equal(reason({ heading: 'Geometri', topicId: 'geometri' }, math(1, 6, '*', 7)), 'figureRequired')
    assert.equal(reason({ heading: 'Måleenheter', topicId: 'maling' }, text(1, 'En flaske rommer 3 L. Hvor mange dL er det?', '30 dL. 1 L = 10 dL, så 3 L = 30 dL.')), null)
  })

  it('prompten ber om variasjon mellom de nye oppgavene, og regelversjonen er oppdatert', () => {
    const profile = aiProfileFor({ heading: 'Klokka', topicId: 'maling' })!.profile
    const request = { kind: 'general', lesson, perLevel: 2, officialGoals: '', wishes: '', levels: buildLevelContexts(levels, [], profile), profile: toAiProfile(profile) } as const
    assert.ok(taskPrompt(request).includes('ikke samme formulering med bare nye tall'))
    assert.equal(aiConfig.rulesVersion, '10')
  })
})

describe('statistikk: Temaoversikt og detaljvisningen bruker samme grunnlag', () => {
  it('temaer uten besvarte oppgaver viser «For lite grunnlag» og ingen fylte felt – ingen faglig vurdering', () => {
    assert.deepEqual(classMastery.map((r) => r.topic), classTopics)
    for (const row of classMastery) {
      const insight = topicInsights.find((t) => t.topic === row.topic)
      if (!insight) {
        assert.equal(row.status, 'insufficient', row.topic)
        assert.equal(row.filled, 0, row.topic)
      } else {
        assert.equal(row.status, insight.status, row.topic)
      }
    }
    // Geometri har ingen oppgavedata – og viser derfor ikke lenger «Viser forståelse».
    assert.equal(classMastery.find((r) => r.topic === 'Geometri')?.status, 'insufficient')
  })

  it('feltene er andelen riktige svar i temaets oppgaver (av 8)', () => {
    const regning = classMastery.find((r) => r.topic === 'Regning')!
    assert.deepEqual([regning.status, regning.filled, regning.note], ['needsSupport', 6, 'Tierovergang'])
    assert.equal(masteryOf('X', { topic: 'X', status: 'understanding', tasks: [{ expression: '1', category: 'c', level: 1, attempted: 10, correct: 5 }], struggles: [], notTried: { level: 1, students: [] }, goingWell: '' }).filled, 4)
    assert.equal(masteryOf('X', { topic: 'X', status: 'understanding', tasks: [], struggles: [], notTried: { level: 1, students: [] }, goingWell: '' }).status, 'insufficient')
  })
})

describe('«Profiltekst og nivå» er fjernet', () => {
  it('komponenten, ruten, klientkallet og prompten finnes ikke lenger', () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.ok(!existsSync(new URL('../src/features/statistics/AiProfileSuggestion.tsx', import.meta.url)))
    assert.ok(!read('server/index.ts').includes('/api/ai/profil'))
    assert.ok(!read('src/ai/client.ts').includes('requestProfile'))
    assert.ok(!read('server/prompts.ts').includes('profilePrompt'))
    assert.ok(!read('src/features/statistics/StudentStatsPage.tsx').includes('AiProfileSuggestion'))
    // «Foreslåtte oppgaver» for eleven (som bruker den anonyme elevprofilen) er beholdt.
    assert.ok(read('src/features/statistics/StudentStatsPage.tsx').includes('SuggestedTasksDialog'))
  })
})
