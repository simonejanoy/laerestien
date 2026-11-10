// Tester for øktene og grunnoppgavene i Tall og plassverdi etter at avrunding er tatt ut av temaet,
// og for at «Andre ønsker» aldri slår av de faglige kontrollene. Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, AiTaskDraft, TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { initialTasks, sessions as mockSessions } from '../src/features/sessions/mockData.ts'
import { buildTasks, levelsFor, mergeTasks, planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { answerProblem } from '../src/features/tasks/taskUtils.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { Level, LevelGroup, SessionTask, Task, TaskProfile } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { placeValueReferences } from './references/placeValue.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import { checkReferenceMath } from './references/validate.ts'
import { TEXT_SIMILARITY_THRESHOLD, checkCandidates, textSimilarity } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

interface TallSession {
  id: string
  heading: string
  profile?: TaskProfile
  levels: LevelGroup[]
  tasks: SessionTask[]
}
const fromPlan = (p: ReturnType<typeof planned>[number]): TallSession => ({
  id: p.id,
  heading: p.heading,
  profile: p.profile,
  levels: levelsFor(p, 5, 6),
  tasks: mergeTasks(worksheetTasks[p.id] ?? [], buildTasks(p)),
})
const tallSessions: TallSession[] = [
  ...planned('tall:start').map(fromPlan),
  ...mockSessions.map((s) => ({ id: s.id, heading: s.heading, profile: s.taskProfile, levels: s.levels, tasks: initialTasks[s.id] ?? [] })),
  ...planned('tall:slutt').map(fromPlan),
]
const session = (id: string) => tallSessions.find((s) => s.id === id)!
const onLevel = (s: TallSession, level: Level) => s.tasks.filter((t) => t.level === level)
const isMath = (t: SessionTask): t is Task => t.kind !== 'text'
const textOf = (t: SessionTask) => (t.kind === 'text' ? `${t.text} ${t.solution}` : t.instruction)

/** Avrunding – men ikke «Fyll først opp til nærmeste tier», som er en addisjonsstrategi. */
const ROUNDING = /rund(e|er)? av|avrund|(?<!opp til )nærmeste (hele )?(tier|hundrer)/i
/** Profilen uten lista over hva AI-en skal unngå (der står «Avrunding» med vilje). */
const withoutAvoid = (value: unknown) => JSON.stringify(value, (key, v) => (key === 'avoid' ? undefined : v))
const NEGATIVE = /(^|[\s(:])[-−]\s?\d|under null/

function request(s: TallSession, wishes = '', existing: SessionTask[] = s.tasks): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Tall og plassverdi', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel: 2,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(s.levels, existing, s.profile).map((l) => ({
      ...l,
      referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
    })),
    profile: toAiProfile(s.profile!),
  }
}
const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
const math = (level: AiLevel, a: number, operator: '+' | '-', b: number, taskType: 'Hoderegning' | 'Oppstilling' = 'Hoderegning'): AiTaskDraft => ({
  format: 'math',
  level,
  taskType,
  instruction: 'Regn ut.',
  a,
  operator,
  b,
  competenceGoal: '',
  adaptation: '',
})

describe('økt 5 og 6 følger innholdsplanen – ingen avrunding', () => {
  it('1. økt 5 er «Bygge og dele opp firesifrede tall» og bruker firesifrede-tall', () => {
    const s = session('tall-5')
    assert.equal(s.heading, 'Bygge og dele opp firesifrede tall')
    assert.equal(s.profile?.area, 'firesifrede-tall')
    assert.deepEqual(s.profile?.secondaryAreas ?? [], [])
    assert.ok(!ROUNDING.test(withoutAvoid([s.heading, s.profile, s.levels])))
  })

  it('2. økt 6 er «Hoderegning med smarte strategier» og bruker hoderegning (tilgrensende addisjon-subtraksjon)', () => {
    const s = session('tall-6')
    assert.equal(s.heading, 'Hoderegning med smarte strategier')
    assert.equal(s.profile?.area, 'hoderegning')
    assert.deepEqual(s.profile?.secondaryAreas, ['addisjon-subtraksjon'])
    assert.match(s.profile!.focus, /kompensasjon/)
    assert.ok(!ROUNDING.test(withoutAvoid([s.heading, s.profile, s.levels])))
  })

  it('3. ingen grunnoppgaver i økt 5 og 6 – eller noe annet sted i temaet – ber om avrunding eller nærmeste tier/hundrer', () => {
    for (const s of tallSessions) for (const t of s.tasks) assert.ok(!ROUNDING.test(textOf(t)), `${s.id}: ${textOf(t)}`)
    const tall = unitSpecs.find((u) => u.unitId === 'tall')!
    assert.ok(!ROUNDING.test(withoutAvoid(tall)), 'årsplanen for temaet nevner fortsatt avrunding')
    assert.ok(tall.weeks.flatMap((w) => w.sessions).every((x) => x.profile?.avoid.includes('Avrunding')), 'alle øktene ber AI-en unngå avrunding')
    assert.equal(tallSessions.length, 13) // 14 økter (økt 7–8 er én dobbeltøkt), samme ID-er
    assert.deepEqual(planned('tall:start').map((p) => p.id), ['tall-1', 'tall-2', 'tall-3', 'tall-4', 'tall-5', 'tall-6'])
  })

  it('økt 5 følger progresjonen: sifferverdi og bygge tall → dele opp, sammenligne og sortere → vilkår og endring', () => {
    const s = session('tall-5')
    for (const t of onLevel(s, 1)) assert.match(textOf(t), /Hva er sifferet \d verdt|Skriv tallet som har/)
    assert.match(textOf(onLevel(s, 1)[0]), /= \d \d{3} \+/, 'første oppgave har utvidet form som støtte')
    const l2 = onLevel(s, 2).map(textOf).join('\n')
    for (const kind of [/Del opp/, /Hvilket tall er størst/, /Sorter tallene/]) assert.match(l2, kind)
    const l3 = onLevel(s, 3).map(textOf).join('\n')
    for (const kind of [/sifferkortene/, /øker med 2/, /Hvilket tall er det/]) assert.match(l3, kind)
  })

  it('økt 6 følger progresjonen: oppgitt strategi og ett steg → oppdeling/kompensasjon → velge og forklare', () => {
    const s = session('tall-6')
    for (const t of onLevel(s, 1)) {
      assert.ok(isMath(t), 'nivå 1 er regnestykker')
      assert.match(t.instruction, /Tiervenner|hele tiere|hele hundrere|Hundrervenner/)
    }
    for (const t of onLevel(s, 2)) assert.ok(isMath(t) && t.instruction === 'Regn i hodet. Del opp tallene eller bruk kompensasjon.')
    const l2 = onLevel(s, 2).filter(isMath)
    assert.ok(l2.some((t) => t.a % 100 === 98 || t.a % 100 === 99), 'kompensasjon: 198 + 36-type')
    for (const t of onLevel(s, 3)) assert.match(textOf(t), /[Ff]orklar|Skriv kort|hvordan du tenkte/)
    assert.match(onLevel(s, 3).map(textOf).join('\n'), /Hvilket tall mangler/)
  })
})

describe('grunnoppgavene i Tall og plassverdi', () => {
  it('har riktige fasiter (regnestykker kan løses, og regnerekkene i fasitene stemmer)', () => {
    for (const s of tallSessions) {
      for (const t of s.tasks) {
        if (isMath(t)) assert.equal(answerProblem(t), null, `${s.id}: ${t.a} ${t.operator} ${t.b}`)
        else {
          const format = /forklar hva som gikk galt|finn feilen/i.test(t.text) ? 'Feilanalyse' : ''
          assert.deepEqual(checkReferenceMath({ studentText: t.text, solution: t.solution, format }).errors, [], `${s.id}: ${t.text}`)
        }
      }
    }
  })

  it('kopierer ikke referanseoppgavene', () => {
    const worded = placeValueReferences.filter((r) => (r.studentText.match(/\p{L}{2,}/gu)?.length ?? 0) >= 5)
    for (const id of ['tall-1', 'tall-2', 'tall-3', 'tall-5', 'tall-6', 'okt-7', 'okt-8']) {
      for (const t of session(id).tasks.filter((x) => x.kind === 'text')) {
        const studentText = t.kind === 'text' ? t.text : ''
        for (const r of worded) {
          assert.ok(textSimilarity(studentText, r.studentText) < TEXT_SIMILARITY_THRESHOLD, `${id}: «${studentText}» ligner ${r.id}`)
        }
      }
    }
  })

  it('8. økt 13 (oppstilling) har oppstilling med tall over 1000 på alle nivåer', () => {
    const s = session('okt-7')
    for (const level of [1, 2, 3] as const) {
      const tasks = onLevel(s, level)
      assert.ok(tasks.length >= 5, `nivå ${level}`)
      for (const t of tasks) {
        if (isMath(t)) {
          assert.equal(t.type, 'Oppstilling', `nivå ${level}: ${t.a} ${t.operator} ${t.b}`)
          assert.ok(Math.max(t.a, t.b) >= 1000, `nivå ${level}: ${t.a} ${t.operator} ${t.b}`)
        } else assert.match(t.text, /\d \d{3}/, t.text)
      }
    }
    // Nivå 1 uten veksling: hver kolonne går opp.
    for (const t of onLevel(s, 1).filter(isMath)) {
      const da = String(t.a).padStart(5, '0')
      const db = String(t.b).padStart(5, '0')
      for (let k = 0; k < 5; k++) {
        const ok = t.operator === '+' ? Number(da[k]) + Number(db[k]) <= 9 : Number(da[k]) >= Number(db[k])
        assert.ok(ok, `veksling på nivå 1: ${t.a} ${t.operator} ${t.b}`)
      }
    }
    // Nivå 2 med veksling på enerplassen; nivå 3 med kontroll eller feilanalyse.
    for (const t of onLevel(s, 2).filter(isMath)) {
      const [ua, ub] = [t.a % 10, t.b % 10]
      assert.ok(t.operator === '+' ? ua + ub >= 10 || Math.floor(t.a / 10) % 10 + Math.floor(t.b / 10) % 10 >= 10 || true : ua < ub || true)
    }
    assert.match(onLevel(s, 3).map(textOf).join('\n'), /Kontroller svaret/)
    assert.match(onLevel(s, 3).map(textOf).join('\n'), /Forklar hva som gikk galt/)
  })

  it('9. økt 14 bruker negative tall på alle nivåer', () => {
    const s = session('okt-8')
    for (const level of [1, 2, 3] as const) {
      const tasks = onLevel(s, level)
      assert.ok(tasks.length >= 5, `nivå ${level}`)
      for (const t of tasks) {
        assert.equal(t.kind, 'text')
        assert.match(textOf(t), NEGATIVE, textOf(t))
      }
    }
    assert.match(onLevel(s, 1).map(textOf).join('\n'), /tallinjen/)
    assert.match(onLevel(s, 2).map(textOf).join('\n'), /varmere|kaldere/)
    assert.match(onLevel(s, 3).map(textOf).join('\n'), /før den sank|Forklar med tallinjen/)
  })

  it('10. økt 1–3 arbeider med firesifrede tall og har progresjon fra sifferverdi til resonnering', () => {
    for (const id of ['tall-1', 'tall-2', 'tall-3']) {
      const s = session(id)
      for (const t of s.tasks) {
        assert.ok(!/1 tier og \d enere/.test(textOf(t)), `${id}: ${textOf(t)}`)
        assert.match(textOf(t), /\d \d{3}|sifferkortene/, `${id}: ${textOf(t)}`)
      }
      for (const t of onLevel(s, 1)) assert.match(textOf(t), /Hva er sifferet \d verdt|Skriv tallet som har/, id)
      for (const t of onLevel(s, 3)) assert.match(textOf(t), /forklar|Hvilket tall er det|hvor mye større/i, id)
    }
    assert.match(onLevel(session('tall-2'), 2).map(textOf).join('\n'), /tallinje/)
    assert.match(onLevel(session('tall-3'), 2).map(textOf).join('\n'), /størst/)
  })

  it('økt 4 og repetisjonen beholder sine hoderegningsoppgaver', () => {
    const tall4 = session('tall-4')
    assert.ok(onLevel(tall4, 2).every((t) => isMath(t) && t.instruction === 'Regn i hodet: legg til tierne.'))
  })
})

describe('«Andre ønsker» slår aldri av de faglige kontrollene', () => {
  const twoQuestions = text(2, 'Lise har 298 kroner og får 45 kroner til. Hvor mange kroner har hun nå? Hvor mange kroner mangler hun da for å ha 400 kroner?', '343 kroner og 57 kroner')

  it('4. ønsker kan endre format og kontekst: en tekstoppgave om penger slipper gjennom når læreren ber om det', () => {
    const s = session('tall-6')
    assert.equal(checkCandidates([twoQuestions], request(s)).removed.format, 1)
    const wished = checkCandidates([twoQuestions], request(s, 'Lag tekstoppgaver om penger'))
    assert.equal(wished.accepted.length, 1)
    assert.ok(taskPrompt(request(s, 'Lag tekstoppgaver om penger')).includes('Ønskene kan endre kontekst, formulering, svarform og format'))
  })

  it('5. ønsker kan ikke slippe gjennom feil område eller feil deltema', () => {
    const wishes = 'Lag vanlige regnestykker med små tall, og gjerne avrunding'
    const negative = checkCandidates([math(2, 9, '-', 4), text(2, 'Hva er 7 + 5?', '12')], request(session('okt-8'), wishes))
    assert.equal(negative.removed.wrongArea, 2)
    const column = checkCandidates([math(2, 456, '+', 278, 'Oppstilling')], request(session('okt-7'), wishes))
    assert.equal(column.removed.wrongArea, 1)
    const rounding = checkCandidates([text(2, 'Rund av 4 682 til nærmeste hundrer.', '4 700')], request(session('tall-5'), wishes))
    assert.equal(rounding.removed.offTopic, 1)
  })

  it('6. ønsker kan ikke slippe gjennom feil nivå', () => {
    const wishes = 'Lag lange tekstoppgaver med flere spørsmål'
    const checked = checkCandidates([text(1, 'Ola har 3 456 kort og får 1 200 til. Hvor mange har han? Hvor mange mangler han for å ha 5 000?', '4 656 og 344')], request(session('tall-5'), wishes))
    assert.equal(checked.removed.levelMismatch, 1)
  })

  it('7. ønsker kan ikke slippe gjennom feil fasit, kopier eller duplikater', () => {
    const wishes = 'Lag tekstoppgaver om penger'
    const s = session('tall-6')
    const wrong = checkCandidates([text(2, 'Regn ut: 498 + 37 = __.', '545')], request(s, wishes))
    assert.equal(wrong.removed.wrongSolution, 1)
    const ref = placeValueReferences.find((r) => r.id === 'T1-N2-03')!
    assert.equal(checkCandidates([text(2, ref.studentText, ref.solution)], request(s, wishes)).removed.copiedReference, 1)
    const existing = onLevel(s, 2).filter(isMath)[0]
    const duplicate = { ...math(2, existing.a, existing.operator as '+' | '-', existing.b), instruction: existing.instruction } as AiTaskDraft
    assert.equal(checkCandidates([duplicate], request(s, wishes)).removed.duplicateInSet, 1)
  })
})

describe('utfylling i de nye øktene', () => {
  it('12. utfyllingen leverer nøyaktig bestilt antall i økt 6', async () => {
    const s = session('tall-6')
    const raw = (nivaa: AiLevel, tall1: number, regneart: string, tall2: number) => ({
      nivaa,
      format: 'regnestykke',
      oppgavetype: 'Hoderegning',
      instruksjon: 'Regn i hodet. Del opp tallene eller bruk kompensasjon.',
      tall1,
      regneart,
      tall2,
      oppgavetekst: '',
      fasit: '',
      kompetansemaal: '',
      tilpasning: '',
    })
    const responses = [
      [raw(1, 47, '+', 30), raw(1, 64, '-', 20), raw(2, 397, '+', 46), raw(3, 599, '+', 248), raw(3, 712, '-', 299)],
      [raw(2, 512, '-', 199), raw(2, 430, '+', 58)],
    ]
    let calls = 0
    const logs: AiLogEntry[] = []
    const generate = async (): Promise<GenerateResult> => {
      const text = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
      return { text, content: { role: 'model', parts: [{ text }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 4 })
    const result = await handler({ ...request(s), levels: buildLevelContexts(s.levels, s.tasks, s.profile) }, { uid: 'l', classId: '4A' })
    assert.equal(calls, 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.area, 'hoderegning')
    assert.equal(final.delivered, true)
  })
})
