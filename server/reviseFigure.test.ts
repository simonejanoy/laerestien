// Tester for «Juster med AI» på oppgaver med figur: figuren beholdes som standard, kan endres eller fjernes
// bare når læreren uttrykkelig ber om det, og den justerte oppgaven går gjennom de samme figurkontrollene
// som ved generering. En avvist justering gir en tydelig melding og endrer ikke den opprinnelige oppgaven.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { AiVisual, TaskResult } from '../src/ai/contract.ts'
import { applyRevision, toDraft } from '../src/ai/drafts.ts'
import type { TextTask } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { createTaskHandler } from './taskHandler.ts'

const triangle: AiVisual = { kind: 'shape', shape: 'triangle' }
const pentagon: AiVisual = { kind: 'shape', shape: 'pentagon' }

const task = (text: string, solution: string, figure?: TextTask['figure']): TextTask => ({
  kind: 'text',
  id: 'geo-1',
  level: 1,
  text,
  solution,
  competenceGoal: '',
  adaptation: 'Gjenkjenne figurer.',
  aiGenerated: false,
  reviewed: true,
  ...(figure && { figure }),
})
const triangleTask = () => task('Se på figuren. Hvor mange sider og hjørner har den?', '3 sider og 3 hjørner', triangle)
const angleTask = () => task('Vinkelen på figuren er 30°. Er den spiss, rett eller stump?', 'Spiss vinkel', { kind: 'angle', angleType: 'acute', degrees: 30 })

type Raw = Record<string, unknown>
const answer = (oppgavetekst: string, fasit: string, figur?: Raw): Raw => ({
  nivaa: 1,
  format: 'tekst',
  oppgavetekst,
  fasit,
  kompetansemaal: '',
  tilpasning: 'Gjenkjenne figurer.',
  ...(figur && { figur }),
})

/** Kjører «Juster med AI» med et forhåndsbestemt AI-svar. Gir resultatet, prompten og loggen. */
async function revise(original: TextTask, instruction: string, reply: Raw, topic = 'Geometri') {
  const prompts: string[] = []
  const logs: AiLogEntry[] = []
  const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    const body = JSON.stringify({ melding: 'Endret.', oppgaver: [reply] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-rev' })
  const result = await handler(
    { kind: 'revise', context: { subject: 'Matematikk', grade: '4. trinn', topic }, task: toDraft(original), instruction },
    { uid: 'l', classId: '4A' },
  )
  return { result, prompt: prompts[0], logs, applied: applyRevision(original, result) }
}

describe('figuren følger med i justeringen', () => {
  it('appen sender figuren med, og prompten beskriver den og regelen om å beholde den', async () => {
    assert.deepEqual(toDraft(triangleTask()).figure, triangle)
    assert.equal(toDraft(task('Hvor mange sider har en trekant?', '3 sider')).figure, undefined)
    const { prompt } = await revise(triangleTask(), 'Bruk enklere ord.', answer('Hvor mange sider og hjørner har figuren?', '3 sider og 3 hjørner'))
    assert.match(prompt, /Figur: trekant/)
    assert.match(prompt, /Behold figuren/)
  })

  it('tekstjustering beholder den eksisterende trekanten (også når AI-en ikke sender figuren tilbake)', async () => {
    const { applied } = await revise(triangleTask(), 'Bruk enklere ord.', answer('Se på figuren. Tell sidene og hjørnene.', '3 sider og 3 hjørner'))
    assert.deepEqual(applied.task?.figure, triangle)
    assert.equal(applied.task?.text, 'Se på figuren. Tell sidene og hjørnene.')
    assert.equal(applied.task?.reviewed, false)
  })

  it('endring av vanskelighetsgrad beholder figuren', async () => {
    const { applied } = await revise(
      triangleTask(),
      'Gjør oppgaven litt vanskeligere.',
      answer('Hvor mange sider og hjørner har figuren til sammen?', '6. Figuren er en trekant med 3 sider og 3 hjørner, og 3 + 3 = 6.', { type: 'figur', form: 'trekant' }),
    )
    assert.deepEqual(applied.task?.figure, triangle)
  })

  it('AI-en kan ikke bytte figur når læreren ikke har bedt om det – figuren beholdes', async () => {
    const { applied } = await revise(triangleTask(), 'Bruk enklere ord.', answer('Tell sidene og hjørnene på figuren.', '3 sider og 3 hjørner', { type: 'figur', form: 'femkant' }))
    assert.deepEqual(applied.task?.figure, triangle)
  })

  it('læreren kan be om å endre trekanten til en femkant', async () => {
    const { applied } = await revise(
      triangleTask(),
      'Bytt trekanten til en femkant.',
      answer('Se på figuren. Hvor mange sider og hjørner har den?', '5 sider og 5 hjørner', { type: 'figur', form: 'femkant' }),
    )
    assert.deepEqual(applied.task?.figure, pentagon)
    assert.equal(applied.task?.solution, '5 sider og 5 hjørner')
  })

  it('læreren kan uttrykkelig be om å fjerne figuren', async () => {
    const { applied } = await revise(
      triangleTask(),
      'Fjern figuren og beskriv figuren med ord i stedet.',
      answer('En figur har tre rette sider. Hvor mange hjørner har den?', '3 hjørner', { type: 'ingen' }),
    )
    assert.ok(applied.task)
    assert.equal(applied.task!.figure, undefined)
  })

  it('figuren kan fjernes når den justerte oppgaven ikke lenger trenger den', async () => {
    const { applied } = await revise(triangleTask(), 'Lag en oppgave om en sekskant i stedet.', answer('Hvor mange sider har en sekskant?', '6 sider', { type: 'ingen' }))
    assert.equal(applied.task?.figure, undefined)
  })
})

describe('den justerte oppgaven går gjennom figurkontrollene', () => {
  it('teksten viser til figuren, men figuren er fjernet uten at læreren ba om det → avvist', async () => {
    const { result, applied } = await revise(triangleTask(), 'Bruk enklere ord.', answer('Se på figuren. Tell hjørnene.', '3 hjørner', { type: 'ingen' }))
    assert.deepEqual(result.tasks, [])
    assert.match(result.warning ?? '', /Justeringen ble ikke brukt/)
    assert.match(result.warning ?? '', /opprinnelige oppgaven er beholdt/)
    assert.equal(applied.task, undefined)
    assert.match(applied.error ?? '', /Justeringen ble ikke brukt/)
  })

  it('figur, spørsmål og fasit som ikke stemmer → avvist', async () => {
    const wrong = await revise(triangleTask(), 'Bytt trekanten til en femkant.', answer('Hvor mange sider har figuren?', '6 sider', { type: 'figur', form: 'femkant' }))
    assert.deepEqual(wrong.result.tasks, [])
    assert.match(wrong.result.warning ?? '', /stemte ikke med figuren/)
    // Teksten endret til femkant, men figuren beholdt (læreren ba ikke om ny figur): fasiten motsier trekanten.
    const kept = await revise(triangleTask(), 'Bruk enklere ord.', answer('Hvor mange sider har figuren?', '5 sider'))
    assert.deepEqual(kept.result.tasks, [])
  })

  it('en figur appen ikke kan tegne → avvist', async () => {
    const { result } = await revise(triangleTask(), 'Bytt til en kube.', answer('Hvor mange flater har figuren?', '6 flater', { type: 'figur', form: 'kube' }))
    assert.deepEqual(result.tasks, [])
    assert.match(result.warning ?? '', /figur appen ikke kan tegne/)
  })

  it('en justering som ber eleven tegne → avvist', async () => {
    const { result } = await revise(triangleTask(), 'La eleven tegne selv.', answer('Tegn en trekant. Hvor mange hjørner har den?', '3 hjørner', { type: 'ingen' }))
    assert.deepEqual(result.tasks, [])
  })

  it('en mislykket justering endrer ikke den opprinnelige oppgaven', async () => {
    const original = triangleTask()
    const before = structuredClone(original)
    const { applied } = await revise(original, 'Bruk enklere ord.', answer('Hvor mange sider har figuren?', '4 sider', { type: 'figur', form: 'trekant' }))
    assert.equal(applied.task, undefined)
    assert.ok(applied.error)
    assert.deepEqual(original, before)
    // Komponenten kaller bare onRevised når justeringen ble godtatt, og viser feilen ellers.
    const form = readFileSync(new URL('../src/features/tasks/AiReviseForm.tsx', import.meta.url), 'utf8')
    assert.match(form, /applyRevision\(task, result\)/)
    assert.match(form, /if \(applied\.task\)/)
    assert.match(form, /setError\(applied\.error\)/)
  })
})

describe('vinkler', () => {
  it('vinkelen og gradtallet forblir konsistente – også når læreren ber om et nytt gradtall', async () => {
    const kept = await revise(angleTask(), 'Bruk enklere ord.', answer('Vinkelen på figuren er 30°. Er den spiss, rett eller stump?', 'Spiss'))
    assert.deepEqual(kept.applied.task?.figure, { kind: 'angle', angleType: 'acute', degrees: 30 })

    const changed = await revise(
      angleTask(),
      'Bruk 120 grader i stedet.',
      answer('Vinkelen på figuren er 120°. Er den spiss, rett eller stump?', 'Stump vinkel', { type: 'vinkel', vinkeltype: 'stump', grader: 120 }),
    )
    assert.deepEqual(changed.applied.task?.figure, { kind: 'angle', angleType: 'obtuse', degrees: 120 })

    // Nytt gradtall i teksten, men figuren er ikke oppdatert: figuren viser fortsatt 30° → avvist.
    const stale = await revise(angleTask(), 'Bruk 60 grader i stedet.', answer('Vinkelen på figuren er 60°. Er den spiss, rett eller stump?', 'Spiss'))
    assert.deepEqual(stale.result.tasks, [])
    // Vinkeltype som ikke passer gradtallet → avvist.
    const invalid = await revise(angleTask(), 'Gjør vinkelen stump.', answer('Hva slags vinkel er dette?', 'Stump', { type: 'vinkel', vinkeltype: 'stump', grader: 60 }))
    assert.deepEqual(invalid.result.tasks, [])
  })
})

describe('oppgaver uten figur og andre tema fungerer som før', () => {
  it('en oppgave uten figur justeres som før, og prompten er uendret', async () => {
    const plain = task('Hvor mange sider har en trekant?', '3 sider')
    const { applied, prompt } = await revise(plain, 'Bruk enklere ord.', answer('Hvor mange sider har en trekant? Tell dem.', '3 sider'))
    assert.equal(applied.task?.text, 'Hvor mange sider har en trekant? Tell dem.')
    assert.equal(applied.task?.figure, undefined)
    assert.ok(!prompt.includes('Figur:'))
    assert.ok(!prompt.includes('Behold figuren'))
    assert.equal(
      prompt,
      taskPrompt({ kind: 'revise', context: { subject: 'Matematikk', grade: '4. trinn', topic: 'Geometri' }, task: toDraft(plain), instruction: 'Bruk enklere ord.' }),
    )
  })

  it('en figur AI-en legger til på en oppgave uten figur – eller i et annet tema – tas ikke med', async () => {
    const plain = task('Hvor mange sider har en trekant?', '3 sider')
    const added = await revise(plain, 'Bruk enklere ord.', answer('Hvor mange sider har en trekant?', '3 sider', { type: 'figur', form: 'trekant' }))
    assert.equal(added.applied.task?.figure, undefined)
    const division = task('24 kort deles likt mellom 6 barn. Hvor mange får hvert barn?', '4 kort')
    const other = await revise(division, 'Bruk andre tall.', answer('30 kort deles likt mellom 6 barn. Hvor mange får hvert barn?', '5 kort', { type: 'figur', form: 'sirkel' }), 'Divisjon')
    assert.equal(other.applied.task?.figure, undefined)
    assert.equal(other.applied.task?.solution, '5 kort')
  })

  it('et svar uten oppgave (oppfølgingsspørsmål) er fortsatt et spørsmål, ikke en feil', () => {
    const question: TaskResult = { tasks: [], message: 'Hva mener du med enklere?' }
    assert.deepEqual(applyRevision(triangleTask(), question), { question: 'Hva mener du med enklere?' })
  })
})
