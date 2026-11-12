// Tester for AI-oppsettet i multiplikasjon: referansebanken, utvalget, oppsummeringen av
// oppgavesettet, prompten, kontrollene etter Gemini-svaret og sporbarheten.
// Ingen ekte Gemini-kall: modellen erstattes av testfunksjoner. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ApiError, GenerateContentResponse, type GenerateContentParameters } from '@google/genai'
import { aiConfig } from '../src/ai/config.ts'
import { MULTIPLICATION_AREAS, isTaskResult, readMeta, type AiTaskDraft, type TaskRequest, type TaskResult } from '../src/ai/contract.ts'
import { aiMetaFor, toSessionTask, toTextTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, summarizeExisting, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, mergeTasks, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { Level, SessionTask, Task, TextTask } from '../src/types/index.ts'
import { createGenerate, type AiLogEntry, type GenerateResult } from './gemini.ts'
import { REFERENCE_RULE, taskPrompt } from './prompts.ts'
import { MULTIPLICATION_REFERENCE_COUNT, multiplicationBankFile, multiplicationReferences } from './references/multiplication.ts'
import { selectReferences } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { checkReferenceMath, evaluate, validateReferenceBank } from './references/validate.ts'
import { TEXT_SIMILARITY_THRESHOLD, checkGeneralResult, textSimilarity } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(multiplicationBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }
const systemPrompt = readFileSync(new URL('../src/ai/systemPrompt.md', import.meta.url), 'utf8')

const allPlans = unitSpecs.flatMap((u) => planned(u.unitId))
const plan = (id: string) => {
  const found = allPlans.find((p) => p.id === id)
  assert.ok(found, `fant ikke ${id}`)
  return found
}
const tasksOf = (p: Planned) => mergeTasks(worksheetTasks[p.id] ?? [], buildTasks(p))

/** Bestillingen slik appen sender den (før serveren har valgt referanser). */
function appRequest(p: Planned, tasks: SessionTask[] = tasksOf(p), wishes = ''): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: p.spec.topic, sessionHeading: p.heading, sessionDescription: p.spec.description, sessionGoals: p.spec.goals },
    perLevel: 2,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(p, 5, 6), tasks, p.profile),
    ...(p.profile && { profile: toAiProfile(p.profile) }),
  }
}

const base = { competenceGoal: '', adaptation: '' }
const math = (level: Level, a: number, b: number, extra: Partial<Extract<AiTaskDraft, { format: 'math' }>> = {}): AiTaskDraft => ({
  ...base,
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction: 'Regn ut.',
  a,
  operator: '*',
  b,
  ...extra,
})
const textDraft = (level: Level, studentText: string): AiTaskDraft => ({ ...base, level, studentText, solution: 'fasit' })

/** Gemini-svar i skjemaformatet. */
const geminiJson = (tasks: Record<string, unknown>[]) =>
  JSON.stringify({
    melding: '',
    oppgaver: tasks.map((t) => ({ format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', regneart: '·', oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '', ...t })),
  })

/** Handler med falsk Gemini som svarer `json`. Fanger prompten og loggen. */
function fakeHandler(json: string, fallbackUsed = false) {
  const prompts: string[] = []
  const traces: AiLogEntry[] = []
  const logs: AiLogEntry[] = []
  const generate = async (_use: string, contents: { parts?: { text?: string }[] }[], _schema?: unknown, trace: AiLogEntry = {}): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    traces.push(trace)
    return { text: json, content: { role: 'model', parts: [{ text: json }] }, model: fallbackUsed ? aiConfig.fallbackModel : aiConfig.primaryModel, fallbackUsed }
  }
  const handler = createTaskHandler({
    generate: generate as never,
    log: (e) => logs.push(e),
    newRequestId: () => 'req-test-1',
    newSeed: () => 42,
    now: () => new Date('2026-11-10T09:00:00.000Z'),
  })
  return { handler, prompts, traces, logs }
}
const teacher = { uid: 'lærer', classId: '4A' }

// ---------------------------------------------------------------------------------------------

describe('referansebanken', () => {
  it('har 54 gyldige referanser: unike ID-er, ni per fagområde, alle nivåer og påkrevde felt', () => {
    const raw = bankJson()
    const check = validateReferenceBank(raw, MULTIPLICATION_REFERENCE_COUNT)
    assert.deepEqual(check.errors, [])
    assert.equal(raw.references.length, 54)
    assert.equal(new Set(raw.references.map((r) => r.id)).size, 54)
    for (const area of MULTIPLICATION_AREAS) {
      const inArea = raw.references.filter((r) => r.area === area)
      assert.equal(inArea.length, 9, area)
      for (const level of [1, 2, 3]) assert.equal(inArea.filter((r) => r.level === level).length, 3, `${area} nivå ${level}`)
    }
    for (const ref of raw.references) {
      for (const field of ['id', 'topic', 'area', 'level', 'format', 'purpose', 'studentText', 'solution', 'source'] as const) {
        assert.ok(ref[field], `${ref.id} mangler ${field}`)
      }
      assert.ok('representationHint' in ref, ref.id)
    }
    assert.ok(raw.references.some((r) => r.area === 'tabell-2-3-4-5-10' && /2 x|2 \+ 2/.test(r.studentText)), '2-gangen er med')
  })

  it('fasiter som kan regnes ut maskinelt, er riktige – og bevisste feil i feilanalyser er lov', () => {
    const check = validateReferenceBank(bankJson(), 54)
    assert.ok(check.checkedEquations >= 50, `bare ${check.checkedEquations} kontrollert`)
    assert.equal(evaluate('4 x 20 + 4 x 6'), 104)
    assert.equal(evaluate('(10 x 6) - (1 x 6)'), 54)
    assert.equal(evaluate('54 : 6'), 9)
    assert.equal(evaluate('4 x'), null)
    // Feilanalysen «9 x 8 = 10 x 8 - 8 = 82» er meningen og gir ingen feil.
    const errorAnalysis = bankJson().references.find((r) => r.id === 'M2-N2-03')!
    assert.deepEqual(checkReferenceMath(errorAnalysis).errors, [])
  })

  it('validering oppdager feil i dataene', () => {
    const broken = bankJson()
    broken.references[1].id = broken.references[0].id
    broken.references[3].solution = '12, 30, 70, 18, 33'
    broken.references[5].purpose = ''
    broken.references[10].level = 3
    const errors = validateReferenceBank(broken, 54).errors.join('\n')
    assert.match(errors, /ID-en er brukt før/)
    assert.match(errors, /svar 5 skal være 32, ikke 33/)
    assert.match(errors, /mangler «purpose»/)
    assert.match(errors, /ID-en passer ikke med nivå 3/)

    const fewer = bankJson()
    fewer.references.pop()
    assert.match(validateReferenceBank(fewer, 54).errors.join('\n'), /Banken har 53 referanser, ikke 54/)
    assert.match(validateReferenceBank(fewer, 54).errors.join('\n'), /kombinasjoner har 8 referanser/)
  })

  it('Planetpsyd er ikke en del av referansebanken', () => {
    assert.ok(multiplicationReferences.every((r) => r.source.kind === 'gruppen' && !/planetpsyd/i.test(r.source.document)))
  })
})

describe('utvalg av referanser', () => {
  it('bare riktig fagområde og nivå, og høyst tre', () => {
    for (const area of MULTIPLICATION_AREAS) {
      for (const level of [1, 2, 3] as const) {
        const chosen = selectReferences(multiplicationReferences, { area, level, seed: 7 })
        assert.ok(chosen.length > 0 && chosen.length <= 3)
        assert.ok(chosen.every((r) => r.area === area && r.level === level))
      }
    }
  })

  it('samme frø gir samme utvalg, og ulike frø kan gi en annen rekkefølge', () => {
    const select = (seed: number) => selectReferences(multiplicationReferences, { area: 'dele-opp', level: 2, seed }).map((r) => r.id)
    assert.deepEqual(select(123), select(123))
    const orders = new Set(Array.from({ length: 20 }, (_, seed) => select(seed).join()))
    assert.ok(orders.size > 1)
  })

  it('sprer seg over ulike formål og formater når banken har flere å velge mellom', () => {
    const ref = (id: string, purpose: string, format: string) =>
      ({ ...multiplicationReferences[0], id, purpose, format }) as ReferenceTask
    const bank = [ref('a', 'Hensikt A', 'Hoderegning'), ref('b', 'Hensikt A', 'Hoderegning'), ref('c', 'Hensikt A', 'Tallinje'), ref('d', 'Hensikt B', 'Rutenett'), ref('e', 'Hensikt C', 'Feilanalyse')]
    for (let seed = 0; seed < 30; seed++) {
      const chosen = selectReferences(bank, { area: 'tabell-2-3-4-5-10', level: 1, seed })
      assert.equal(new Set(chosen.map((r) => r.purpose)).size, 3, `frø ${seed}`)
      assert.equal(new Set(chosen.map((r) => r.format)).size, 3, `frø ${seed}`)
    }
  })

  it('handleren velger referanser fra banken – ikke fra elevoppgavene i økta – og frøet gjenskaper utvalget', async () => {
    const { handler, prompts } = fakeHandler(geminiJson([{ nivaa: 1, tall1: 3, tall2: 7 }]))
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    for (const level of [1, 2, 3] as const) {
      const expected = selectReferences(multiplicationReferences, { area: 'tabell-6-7-8-9', level, seed: 42 }).map((r) => r.id)
      assert.deepEqual(result.meta?.referenceIds?.[String(level) as '1'], expected)
      for (const id of expected) assert.ok(prompts[0].includes(`ID: ${id}`))
    }
    assert.ok(!prompts[0].includes('Representative eksisterende oppgaver'))

    // Med lagret frø blir utvalget det samme.
    const again = fakeHandler(geminiJson([{ nivaa: 1, tall1: 3, tall2: 7 }]))
    const repeated = await again.handler({ ...appRequest(plan('multiplikasjon-6')), referenceSeed: 42 }, teacher)
    assert.deepEqual(repeated.meta?.referenceIds, result.meta?.referenceIds)
  })
})

describe('oppsummering av oppgavesettet', () => {
  const unreviewed: TextTask = { kind: 'text', id: 'ai-1', level: 1, text: 'Ny AI-oppgave om 6 esker', solution: '24', competenceGoal: '', adaptation: '', aiGenerated: true, reviewed: false }

  it('tar med alle oppgavene på nivået, også ikke-gjennomgåtte AI-oppgaver – uten ID, fasit eller status', () => {
    const p = plan('multiplikasjon-5')
    const tasks = [...tasksOf(p), unreviewed]
    const contexts = buildLevelContexts(levelsFor(p, 5, 6), tasks, p.profile)
    const level1 = contexts[0]
    assert.equal(level1.existing?.length, tasks.filter((t) => t.level === 1).length)
    assert.ok(level1.existing?.some((t) => t.text === 'Ny AI-oppgave om 6 esker'))
    // AI-oppgaven er med i duplikatlista, men aldri som kvalitetsreferanse.
    assert.deepEqual(level1.referenceTasks, [])
    const json = JSON.stringify(level1.existing)
    assert.ok(!json.includes('ai-1') && !json.includes('reviewed') && !json.includes('"24"'))
  })

  it('regnestykker oppsummeres som tall, tekstoppgaver med figur merkes', () => {
    const fig: TextTask = { ...unreviewed, id: 'f', aiGenerated: false, text: 'Se på figuren', figure: { kind: 'grid', rows: ['##'] } }
    const sum = summarizeExisting([{ id: 'm', level: 1, type: 'Hoderegning', instruction: 'Regn ut.', a: 6, operator: '*', b: 7 } as Task, fig])
    assert.deepEqual(sum, [
      { taskType: 'Hoderegning', instruction: 'Regn ut.', a: 6, operator: '*', b: 7 },
      { taskType: 'Tekstoppgave', text: 'Se på figuren', figure: true },
    ])
  })

  it('prompten viser oppgavesettet kort og uten elevdata', async () => {
    const { handler, prompts } = fakeHandler(geminiJson([{ nivaa: 1, tall1: 6, tall2: 9 }]))
    await handler(appRequest(plan('multiplikasjon-5')), teacher)
    assert.match(prompts[0], /Oppgavene som allerede finnes på nivået \(\d+: \d+ Hoderegning\):/)
    assert.match(prompts[0], /- Hoderegning «Regn ut\.»: (\d+ · \d+, )+/)
    assert.ok(!/elev:|anonym ID/i.test(prompts[0]))
  })
})

describe('prompt for multiplikasjon', () => {
  it('har hovedtema, fagområde, øktfokus, nivå, referanser med ID, hensikt og format, oppgavesettet og lærerens ønsker', async () => {
    const { handler, prompts } = fakeHandler(geminiJson([{ nivaa: 1, tall1: 3, tall2: 7 }]))
    await handler(appRequest(plan('multiplikasjon-8'), undefined, 'Bruk tall under 50'), teacher)
    const prompt = prompts[0]
    for (const phrase of [
      'Hovedtema: Multiplikasjon',
      'Fagområde: Dele opp og multiplisere',
      'Øktfokus: Dele opp et tosifret tall',
      'Nivå 1\nTittel: Dele opp med støtte',
      'Nivå 3\nTittel: Dele opp – selvstendig',
      'ID: M4-N1-',
      'Faglig hensikt: ',
      'Format: ',
      'Oppgavene som allerede finnes på nivået',
      'Ekstra ønsker fra læreren: Bruk tall under 50',
      'Lærerens ekstra ønsker går foran referansene og oppgavesettet når ønskene er faglig korrekte',
    ]) {
      assert.ok(prompt.includes(phrase), phrase)
    }
    assert.ok(prompt.includes(REFERENCE_RULE))
    assert.equal(
      REFERENCE_RULE,
      'Referansene er faglige og strukturelle eksempler. De skal ikke returneres direkte. Lag en ny oppgave med selvstendig formulering og passende verdier. Oppgaven skal samsvare med fagområdet, nivået og resten av oppgavesettet.',
    )
    // Øktene bruker ikke temaets generelle nivåtekster.
    assert.ok(!/Like grupper\nUndertittel: Gange med 2, 5 og 10|Store gangestykker/.test(prompt))
  })

  it('byttede faktorer omtales etter øktprofilen', async () => {
    const swapped = fakeHandler(geminiJson([{ nivaa: 1, tall1: 1, tall2: 7 }]))
    await swapped.handler(appRequest(plan('multiplikasjon-2')), teacher)
    assert.ok(swapped.prompts[0].includes('Byttede faktorer (f.eks. 3 · 7 og 7 · 3) er ulike oppgaver i denne økta'))
    const normal = fakeHandler(geminiJson([{ nivaa: 1, tall1: 3, tall2: 7 }]))
    await normal.handler(appRequest(plan('multiplikasjon-4')), teacher)
    assert.ok(normal.prompts[0].includes('Byttede faktorer (f.eks. 3 · 7 og 7 · 3) regnes som samme oppgave.'))
  })

  it('andre tema bruker dagens prompt uten referansebank', () => {
    const p = allPlans.find((x) => x.profile && !x.profile.area && x.spec.unitId !== 'multiplikasjon')!
    const prompt = taskPrompt(appRequest(p))
    assert.ok(!prompt.includes('Hovedtema:') && !prompt.includes(REFERENCE_RULE))
    assert.ok(prompt.includes('Representative eksisterende oppgaver:'))
  })

  it('systemprompten (regelversjon 8) har regelen om referansebanken og oppgavesettet', () => {
    assert.equal(aiConfig.rulesVersion, '9')
    assert.ok(systemPrompt.includes('Lag nye oppgaver med selvstendig formulering og passende verdier'))
    assert.ok(systemPrompt.includes('skal du ikke lage oppgaver som er identiske med dem'))
  })
})

describe('kontroller etter Gemini-svaret', () => {
  const check = (p: Planned, tasks: AiTaskDraft[], existing: SessionTask[] = tasksOf(p), wishes = '', perLevel = 5) => {
    const request = { ...appRequest(p, existing, wishes), perLevel }
    request.levels = request.levels!.map((l) => ({
      ...l,
      referenceTasks: selectReferences(multiplicationReferences, { area: p.profile!.area!, level: l.level, seed: 1 }).map((r) => ({ id: r.id, taskType: r.format, studentText: r.studentText, solution: r.solution })),
    }))
    return checkGeneralResult({ tasks, message: '' } as TaskResult, request)
  }
  const existing7times8: SessionTask[] = [{ id: 'x', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8, source: 'teacher' }]

  it('fjerner identiske oppgaver i samme svar', () => {
    const checked = check(plan('multiplikasjon-6'), [math(2, 7, 9), math(2, 7, 9), math(2, 8, 6)], [])
    assert.deepEqual(checked.result.tasks.map((t) => (t.format === 'math' ? `${t.a}·${t.b}` : '')), ['7·9', '8·6'])
    assert.equal(checked.removed.duplicateInResponse, 1)
    assert.match(checked.warning ?? '', /1 som var like en annen oppgave i samme svar/)
  })

  it('fjerner identiske oppgaver mot oppgavesettet – også med en annen «regn ut»-formulering', () => {
    const checked = check(plan('multiplikasjon-6'), [math(2, 7, 8, { instruction: 'Hva er' }), math(2, 9, 6)], existing7times8)
    assert.equal(checked.removed.duplicateInSet, 1)
    assert.equal(checked.result.tasks.length, 1)
    assert.match(checked.warning ?? '', /var like en oppgave som allerede finnes/)
  })

  it('byttede faktorer er duplikat – med mindre øktprofilen tillater dem', () => {
    const swapped = check(plan('multiplikasjon-6'), [math(2, 8, 7)], existing7times8)
    assert.equal(swapped.removed.swappedFactors, 1)
    const inResponse = check(plan('multiplikasjon-6'), [math(2, 9, 7), math(2, 7, 9)], [])
    assert.equal(inResponse.removed.duplicateInResponse, 1)

    const zeroOne: SessionTask[] = [{ id: 'y', level: 1, type: 'Hoderegning', instruction: 'Regn ut.', a: 1, operator: '*', b: 7 }]
    const allowed = check(plan('multiplikasjon-2'), [math(1, 7, 1), math(1, 1, 8), math(1, 8, 1)], zeroOne)
    assert.equal(allowed.result.tasks.length, 3)
    assert.equal(allowed.removed.swappedFactors + allowed.removed.duplicateInResponse, 0)
  })

  it('tillater samme faktum med annet format, annen representasjon eller annen faglig hensikt', () => {
    const checked = check(
      plan('multiplikasjon-6'),
      [
        math(2, 7, 8, { taskType: 'Oppstilling' }),
        math(2, 7, 8, { instruction: 'Bruk 5-gangen og 2-gangen: 5 · 8 + 2 · 8.' }),
        textDraft(2, 'Det er 7 bokser med 8 kaker i hver. Hvor mange kaker er det?'),
      ],
      [...existing7times8, { kind: 'text', id: 't', level: 2, text: 'Se på figuren. Skriv gangestykket.', solution: '7 · 8', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false, figure: { kind: 'grid', rows: ['########'] } }],
    )
    assert.equal(checked.result.tasks.length, 3)
    assert.ok(Object.values(checked.removed).every((n) => n === 0))
    assert.ok(!/tatt bort/.test(checked.warning ?? ''))
  })

  it('avviser gangetabeller utenfor økta, men ikke når læreren uttrykkelig ber om dem', () => {
    const outside = check(plan('multiplikasjon-6'), [math(1, 6, 4), math(1, 7, 4)], [])
    assert.equal(outside.removed.outsideTables, 1)
    assert.match(outside.warning ?? '', /brukte gangetabeller utenfor økta/)
    assert.equal(check(plan('multiplikasjon-6'), [math(1, 6, 4)], [], 'Ta med 6-gangen').result.tasks.length, 1)
  })

  it('avviser tekstoppgaver som kopierer formuleringen i en referanse, også med nye tall', () => {
    const p = plan('multiplikasjon-10')
    const ref = selectReferences(multiplicationReferences, { area: 'kombinasjoner', level: 2, seed: 1 }).find((r) => r.id === 'M6-N2-02')!
    const copy = ref.studentText.replace('5 farger', '6 farger').replace('2 typer', '3 typer')
    const own = 'På kafeen kan du velge mellom 4 slags juice og 3 slags boller. Hvor mange ulike frokoster kan du sette sammen?'
    assert.ok(textSimilarity(copy, ref.studentText) >= TEXT_SIMILARITY_THRESHOLD)
    assert.ok(textSimilarity(own, ref.studentText) < TEXT_SIMILARITY_THRESHOLD)
    const checked = check(p, [textDraft(2, copy), textDraft(2, own)], [])
    assert.equal(checked.removed.copiedReference, 1)
    assert.deepEqual(checked.result.tasks.map((t) => (t.format === 'math' ? '' : t.studentText)), [own])
    assert.match(checked.warning ?? '', /kopierte formuleringen i en referanseoppgave/)
  })

  it('likhetsgrensen er en navngitt konstant på 0,75', () => {
    assert.equal(TEXT_SIMILARITY_THRESHOLD, 0.75)
    assert.equal(textSimilarity('Det er 3 rader med 4 prikker.', 'Det er 7 rader med 9 prikker.'), 1)
  })

  it('når alle forslag tas bort, prøves utfylling høyst to ganger – og ingen oppgaver legges til', async () => {
    const { handler, prompts } = fakeHandler(geminiJson([{ nivaa: 2, tall1: 7, tall2: 8 }]))
    const result = await handler(appRequest(plan('multiplikasjon-6'), existing7times8), teacher)
    assert.equal(prompts.length, 3)
    assert.equal(result.tasks.length, 0)
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /klarte ikke å lage alle de 6 oppgavene du bestilte.*Ingen oppgaver ble lagt til\. Prøv igjen\./)
  })
})

describe('sporbarhet', () => {
  it('hver AI-oppgave får modell, regelversjon, referanse-ID-er, requestId, tidspunkt, fagområde, nivå, format og fallback', async () => {
    const { handler, traces } = fakeHandler(
      geminiJson([
        { nivaa: 1, tall1: 3, tall2: 7 },
        { nivaa: 1, tall1: 4, tall2: 7 },
        { nivaa: 2, tall1: 6, tall2: 8 },
        { nivaa: 2, tall1: 5, tall2: 9 },
        { nivaa: 3, format: 'tekst', oppgavetekst: 'Hvor mange?', fasit: '21' },
        { nivaa: 3, tall1: 8, tall2: 9 },
      ]),
    )
    // Tomt oppgavesett, så ingen av oppgavene tas bort som duplikater.
    const result = await handler(appRequest(plan('multiplikasjon-6'), []), teacher)
    assert.ok(isTaskResult(result))
    // Slik appen leser svaret.
    const meta = readMeta(JSON.parse(JSON.stringify(result)))
    const tasks = result.tasks.map((t, i) => toSessionTask(t, `ny-${i}`, meta))
    const first = tasks[0]
    const second = tasks.find((t) => t.kind === 'text')!
    assert.deepEqual(first.aiMeta, {
      model: aiConfig.primaryModel,
      rulesVersion: aiConfig.rulesVersion,
      referenceIds: meta?.referenceIds?.['1'],
      requestId: 'req-test-1',
      createdAt: '2026-11-10T09:00:00.000Z',
      area: 'tabell-6-7-8-9',
      level: 1,
      format: 'regnestykke',
      fallbackUsed: false,
      referenceSeed: 42,
    })
    assert.equal(first.aiMeta?.referenceIds.length, 3)
    assert.equal(second.aiMeta?.format, 'tekst')
    assert.equal(second.aiMeta?.level, 3)
    assert.deepEqual(second.aiMeta?.referenceIds, meta?.referenceIds?.['3'])
    assert.deepEqual(traces[0], { requestId: 'req-test-1', attempt: 0 })
  })

  it('reservemodellen merkes på oppgavene', async () => {
    const full = [3, 4].flatMap((g) => [1, 2, 3].map((nivaa) => ({ nivaa, tall1: g + nivaa, tall2: 7 })))
    const { handler } = fakeHandler(geminiJson(full), true)
    const result = await handler(appRequest(plan('multiplikasjon-6'), []), teacher)
    const task = toSessionTask(result.tasks[0], 'x', readMeta(JSON.parse(JSON.stringify(result))))
    assert.equal(task.aiMeta?.fallbackUsed, true)
    assert.equal(task.aiMeta?.model, aiConfig.fallbackModel)
  })

  it('fallback gjennom den ekte generate-funksjonen gir riktig metadata og requestId i loggen', async () => {
    const json = geminiJson([{ nivaa: 1, tall1: 3, tall2: 7 }])
    const callModel = async (params: GenerateContentParameters) => {
      if (params.model === aiConfig.primaryModel) throw new ApiError({ message: 'status 503', status: 503 })
      return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: 'model', parts: [{ text: json }] }, finishReason: 'STOP' }] })
    }
    const logs: AiLogEntry[] = []
    const generate = createGenerate({ callModel, timeoutMs: { primary: 50, fallback: 50 }, log: (e) => logs.push(e) })
    const handler = createTaskHandler({ generate, log: (e) => logs.push(e), newRequestId: () => 'req-fb' })
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(result.meta?.fallbackUsed, true)
    assert.equal(result.meta?.model, aiConfig.fallbackModel)
    assert.ok(logs.length >= 3 && logs.every((e) => e.requestId === 'req-fb'))
  })

  it('loggen har bare tekniske data – ikke lærerens fritekst, oppgavetekster, systemprompten eller elevdata', async () => {
    const SECRET = 'HEMMELIG-LÆRERØNSKE-Kari-Nordmann'
    const TASK_TEXT = 'HEMMELIG-OPPGAVETEKST om bokser'
    const { handler, logs } = fakeHandler(geminiJson([{ nivaa: 1, format: 'tekst', oppgavetekst: TASK_TEXT, fasit: '1' }]))
    await handler(appRequest(plan('multiplikasjon-6'), undefined, SECRET), teacher)
    const logged = JSON.stringify(logs)
    assert.ok(!logged.includes(SECRET))
    assert.ok(!logged.includes(TASK_TEXT))
    assert.ok(!logged.includes(systemPrompt.slice(0, 60)))
    const entry = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(entry.requestId, 'req-test-1')
    assert.equal(entry.rulesVersion, aiConfig.rulesVersion)
    assert.equal(entry.area, 'tabell-6-7-8-9')
    assert.equal(entry.referenceSeed, 42)
    assert.match(String(entry.referenceIds), /^M2-N1-\d\d(,M2-N\d-\d\d)+$/)
  })

  it('ugyldig JSON fra Gemini logges uten oppgavetekst', async () => {
    const { handler, logs } = fakeHandler('{"oppgaver": [HEMMELIG')
    await assert.rejects(handler(appRequest(plan('multiplikasjon-6')), teacher))
    assert.ok(!JSON.stringify(logs).includes('HEMMELIG'))
    assert.equal(logs[0].event, 'invalid_json')
  })

  it('eldre svar uten sporingsdata gir ingen metadata, og metadata vises aldri i elevvisningen', () => {
    assert.equal(aiMetaFor(math(1, 3, 4), { model: 'm', fallbackUsed: false }), undefined)
    assert.equal(toTextTask(math(1, 3, 4), 'x').aiMeta, undefined)
    for (const file of ['../src/features/student/TaskScreen.tsx', '../src/features/student/TextTaskScreen.tsx', '../src/features/student/StudentTaskFlow.tsx']) {
      assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes('aiMeta'), file)
    }
  })
})

describe('øktene i multiplikasjon', () => {
  const sessions = allPlans.filter((p) => p.spec.unitId === 'multiplikasjon')

  it('alle ti øktene har et fagområde og egne nivåtekster', () => {
    assert.equal(sessions.length, 10)
    for (const p of sessions) {
      assert.ok(p.profile?.area, p.id)
      for (const level of [1, 2, 3] as const) {
        const own = p.profile!.levels[level]
        assert.ok(own.title && own.subtitle && own.description, `${p.id} nivå ${level} mangler egne nivåtekster`)
      }
    }
  })

  it('alle nivåene i en økt bruker de samme gangetabellene', () => {
    for (const p of allPlans.filter((x) => x.profile?.levels[1].factors && x.profile.operations.join() === '*')) {
      const [one, two, three] = ([1, 2, 3] as const).map((l) => p.profile!.levels[l].factors?.join())
      assert.ok(one === two && two === three, `${p.id}: ${one} / ${two} / ${three}`)
    }
  })

  it('«Dele opp og multiplisere» øver oppdeling på alle nivåer i de genererte oppgavene', () => {
    const generated = buildTasks(plan('multiplikasjon-8'))
    assert.ok(generated.every((t) => t.kind !== 'text' && t.type === 'Hoderegning' && /Del opp/.test(t.instruction)))
  })
})
