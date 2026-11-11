// Tester for vurderingsoppgaver («Har Jonas rett?»): løsningsforslaget må gi én entydig, riktig
// ja/nei-konklusjon og riktig utregning – uten nøling, selvkorrigering eller navnealternativer.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, AiTaskDraft, TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { initialTasks, sessions as mockSessions } from '../src/features/sessions/mockData.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { assessmentProblem, checkCandidates } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const okt3 = mockSessions.find((s) => s.id === 'okt-3')!
const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })

function request(wishes = ''): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Tall og plassverdi', sessionHeading: okt3.heading, sessionDescription: '', sessionGoals: [] },
    perLevel: 2,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(okt3.levels, [], okt3.taskProfile),
    profile: toAiProfile(okt3.taskProfile!),
  }
}

const jonas = 'Jonas sier at 2 438 + 1 895 = 4 233. Har Jonas rett? Vis med regning.'

describe('vurderingsoppgaver: ja/nei må stemme med regnestykket', () => {
  it('1. 2 438 + 1 895 = 4 233 er feil – svaret må være «Nei»', () => {
    assert.equal(assessmentProblem(text(3, jonas, 'Nei, Jonas har ikke rett. 2 438 + 1 895 = 4 333.')), null)
    assert.equal(assessmentProblem(text(3, jonas, 'Ja, Jonas har rett. 2 438 + 1 895 = 4 333.')), 'wrongConclusion')
    assert.equal(assessmentProblem(text(3, jonas, 'Jonas har rett.')), 'unclearSolution')
  })

  it('2. en riktig påstand krever «Ja»', () => {
    const correct = 'Ida sier at 3 476 + 2 548 = 6 024. Stemmer det?'
    assert.equal(assessmentProblem(text(3, correct, 'Ja, det stemmer. 3 476 + 2 548 = 6 024.')), null)
    assert.equal(assessmentProblem(text(3, correct, 'Nei. 3 476 + 2 548 = 6 024.')), 'wrongConclusion')
    // Også andre regnearter appen støtter.
    assert.equal(assessmentProblem(text(3, 'Er regnestykket 7 · 8 = 54 riktig?', 'Nei. 7 · 8 = 56.')), null)
    assert.equal(assessmentProblem(text(3, 'Ola sier at 72 : 8 = 9. Har Ola rett?', 'Ja. 72 : 8 = 9.')), null)
    assert.equal(assessmentProblem(text(3, 'Mia sier at 902 − 467 = 545. Har Mia rett?', 'Nei, Mia har ikke rett. 902 − 467 = 435.')), null)
  })

  it('3. både «Ja» og «Nei, vent» i samme løsningsforslag avvises', () => {
    const solution = 'Ja, Jonas har rett. Regnestykket gir 4 333? Nei, vent: 2438 + 1895 = 4333. Mina/Jonas tok feil i tierplass. Riktig svar er 4 333.'
    assert.equal(assessmentProblem(text(3, jonas, solution)), 'unclearSolution')
    assert.equal(assessmentProblem(text(3, jonas, 'Nei. Vent, jeg regner på nytt: 2 438 + 1 895 = 4 333.')), 'unclearSolution')
  })

  it('4. feil utregning i løsningsforslaget avvises, og riktig svar må stå der', () => {
    assert.equal(assessmentProblem(text(3, jonas, 'Nei, Jonas har ikke rett. 2 438 + 1 895 = 4 323.')), 'wrongConclusion')
    assert.equal(assessmentProblem(text(3, jonas, 'Nei, Jonas har ikke rett.')), 'wrongConclusion')
  })

  it('5. en korrekt feiloppgave med entydig forklaring godkjennes – også gjennom alle kontrollene', () => {
    const task = text(3, 'Jonas regnet ut at 2 438 + 1 895 = 4 233. Stemmer svaret hans? Vis utregningen.', 'Nei, svaret stemmer ikke. 2 438 + 1 895 = 4 333. Jonas glemte å veksle til hundrerplassen.')
    assert.equal(assessmentProblem(task), null)
    const checked = checkCandidates([task], request())
    assert.deepEqual(checked.rejected.map((r) => r.reason), [])
  })

  it('6. navnealternativer som «Mina/Jonas» i fasiten avvises', () => {
    assert.equal(assessmentProblem(text(3, jonas, 'Nei, Mina/Jonas har ikke rett. 2 438 + 1 895 = 4 333.')), 'unclearSolution')
    // Gjelder også vanlige tekstoppgaver.
    assert.equal(assessmentProblem(text(2, 'Ola har 47 kort og får 38 til. Hvor mange har han?', '85 kort. Ola/Kari har 85.')), 'unclearSolution')
  })

  it('en vurderingsoppgave uten et regnestykke systemet kan kontrollere, avvises', () => {
    assert.equal(assessmentProblem(text(3, 'Jonas sier at summen er stor. Har Jonas rett?', 'Nei.')), 'unclearSolution')
  })

  it('8. vanlige regneoppgaver og tekstoppgaver uten vurderingsspørsmål påvirkes ikke', () => {
    assert.equal(assessmentProblem(text(2, 'Ola har 47 kort og får 38 til. Hvor mange har han?', '85 kort')), null)
    assert.equal(assessmentProblem(text(2, 'Regn ut: 586 + 278 = __.', '864')), null)
    assert.equal(assessmentProblem({ format: 'math', level: 1, taskType: 'Hoderegning', instruction: 'Regn ut.', a: 28, operator: '+', b: 7, competenceGoal: '', adaptation: '' }), null)
    const checked = checkCandidates([text(2, 'Ola har 47 kort og får 38 til. Hvor mange kort har han nå?', '85 kort')], request())
    assert.equal(checked.accepted.length, 1)
  })

  it('prompten ber om ett kort, entydig svar som starter med Ja eller Nei', () => {
    const prompt = taskPrompt(request())
    assert.ok(prompt.includes('skal fasit starte med «Ja» eller «Nei»'))
    assert.ok(prompt.includes('«Nei, Jonas har ikke rett. 2 438 + 1 895 = 4 333.»'))
  })
})

describe('utfylling med vurderingsoppgaver', () => {
  it('7. avviste kandidater erstattes, så læreren får nøyaktig bestilt antall', async () => {
    const raw = (nivaa: AiLevel, extra: Record<string, unknown>) => ({ nivaa, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: 'Nivå med støtte.', ...extra })
    const sum = (nivaa: AiLevel, tall1: number, tall2: number) =>
      raw(nivaa, { format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut. Fyll først opp til nærmeste tier.', tall1, regneart: '+', tall2 })
    const claim = (oppgavetekst: string, fasit: string) => raw(3, { format: 'tekst', oppgavetekst, fasit })
    const responses = [
      [
        sum(1, 57, 6),
        sum(1, 66, 8),
        sum(2, 57, 26),
        sum(2, 168, 47),
        claim('Jonas skrev at 2 438 + 1 895 = 4 233. Har Jonas rett? Vis med regning.', 'Ja, Jonas har rett. Regnestykket gir 4 333? Nei, vent: 2438 + 1895 = 4333. Mina/Jonas tok feil i tierplass.'),
        // Påstanden stemmer (3 567 + 1 486 = 5 053), men løsningsforslaget sier nei.
        claim('Sara skrev at 3 567 + 1 486 = 5 053. Har Sara rett? Vis med regning.', 'Nei, Sara har ikke rett. 3 567 + 1 486 = 5 053.'),
      ],
      [claim('Emil skrev at 4 675 + 2 348 = 6 923. Er svaret riktig? Vis utregningen.', 'Nei, svaret er ikke riktig. 4 675 + 2 348 = 7 023.'), sum(3, 2650, 1480)],
    ]
    let calls = 0
    const logs: AiLogEntry[] = []
    const generate = async (): Promise<GenerateResult> => {
      const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 3 })
    const result = await handler({ ...request(), levels: buildLevelContexts(okt3.levels, initialTasks['okt-3'], okt3.taskProfile) }, { uid: 'l', classId: '4A' })
    assert.equal(calls, 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    const visible = JSON.stringify(result.tasks)
    assert.ok(!/vent|Mina\/Jonas|Ja, Jonas/.test(visible), visible)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_unclearSolution, 1)
    assert.equal(final.removed_wrongConclusion, 1)
    assert.equal(final.delivered, true)
  })
})
