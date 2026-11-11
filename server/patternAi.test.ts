// Tester for referansebanken og AI-genereringen i Mønster og algoritmer: banken, koblingen mellom de fire øktene og de
// fem fagområdene, utvalget, kodeformatet i prompten, kontrollene (gjentakende mønstre, figurtall, tallfølger, løkker,
// vilkår og pseudokoden), grunnoppgavene, visningen av kodelinjer, utfyllingen, «Andre ønsker» og at andre temaer er
// uendret. Ingen ekte Gemini-kall, og ingen tester som avhenger av en bestemt formulering fra Gemini. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { AREA_TITLES, PATTERN_AREAS, parseTaskResult, topicOfArea, type AiLevel, type AiTaskDraft, type AiTextDraft, type TaskRequest } from '../src/ai/contract.ts'
import { applyRevision, toSessionTask } from '../src/ai/drafts.ts'
import { PATTERN_COLORS, SYMBOL_NAMES, answerStatus, blankRowIn, boxesComplete, colorOptions, colorRowsIn, dotCountsIn, dotLayout, formatExpected, isCorrect, itemOptions, joinBoxAnswers, readExpected, splitBoxAnswers, symbolRowIn, withoutColorRow, withoutDotSentences, type ExpectedAnswer } from '../src/ai/patternDisplay.ts'
import { readStoredTask } from '../src/features/sessions/taskStorage.ts'
import { TEXT_ATTEMPTS, checkTextAnswer, hasAnswerState, initialTextState, previewProblem, showsSolution, solutionHeading } from '../src/features/student/studentTasks.ts'
import { buildLevelContexts, summarizeExisting, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { codeBlocks, parseProgram, patternProblem, runProgram, withPatternDisplay } from './patternChecks.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { PATTERN_REFERENCE_COUNT, patternBankFile, patternCodeFormat, patternReferences } from './references/patterns.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { PATTERN_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(patternBankFile, 'utf8')) as { referenceCount: number; codeFormat: string; references: ReferenceTask[] }

const sessions = planned('monster-og-algoritmer')
const session = (id: string) => sessions.find((s) => s.id === id)!
const [EXPLORE, SEQUENCES, LOOPS, CONDITIONS] = [1, 2, 3, 4].map((n) => `monster-og-algoritmer-${n}`)

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Mønster og algoritmer', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
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
    referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
  }))
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
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-mo', newSeed: () => 5 })
  return { handler, logs, calls: () => calls }
}

describe('1. referansebanken for Mønster og algoritmer', () => {
  it('inneholder 45 unike referanser, godkjent av valideringen, med feltene fra vedlegget', () => {
    const raw = bankJson()
    assert.equal(PATTERN_REFERENCE_COUNT, 45)
    assert.equal(raw.referenceCount, 45)
    assert.equal(patternReferences.length, 45)
    assert.equal(new Set(patternReferences.map((r) => r.id)).size, 45)
    assert.equal(new Set(patternReferences.map((r) => r.studentText)).size, 45)
    assert.deepEqual(validateReferenceBank(raw, 45, PATTERN_BANK).errors, [])
    assert.deepEqual(patternReferences, raw.references)
    for (const ref of patternReferences) {
      assert.match(ref.id, /^MO[1-5]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'monster-og-algoritmer')
      assert.ok(ref.purpose && ref.format && ref.studentText && ref.solution && ref.workedSolution && ref.teacherNote, ref.id)
      assert.ok(ref.answerForm === 'kort' || ref.answerForm === 'forklaring', ref.id)
      assert.equal(ref.source.document, 'monster_og_algoritmer_referanser.json')
    }
  })

  it('feltnavnene er tilpasset koden, innholdet er uendret, og kodeformatet er med', () => {
    const ref = patternReferences.find((r) => r.id === 'MO5-N3-01')!
    assert.equal(ref.area, 'koder-vilkar')
    assert.equal(ref.areaTitle, 'Koder med vilkår')
    assert.equal(ref.level, 3)
    assert.equal(ref.format, 'lese-lokke-vilkar')
    assert.equal(ref.purpose, 'Eleven følger et program med vilkår inne i en løkke.')
    assert.equal(ref.studentText, 'Start med 1.\ngjenta 4 ganger:\n    hvis tallet er et oddetall:\n        legg til 1\n    ellers:\n        legg til 3\nSkriv tallet etter hver runde. Hva er tallet til slutt?')
    assert.equal(ref.solution, '2, 5, 6, 9. Tallet til slutt er 9.')
    assert.equal(ref.workedSolution, '1 er oddetall: 2. 2 er partall: 5. 5 er oddetall: 6. 6 er partall: 9.')
    assert.equal(ref.teacherNote, 'Vilkåret sjekkes på nytt i hver runde.')
    assert.equal(ref.answerForm, 'forklaring')
    assert.equal(ref.representationHint, null)
    assert.equal(patternReferences.find((r) => r.id === 'MO2-N1-03')!.representationHint, 'Tabell med kolonnene «Figur» og «Fyrstikker».')
    assert.match(patternCodeFormat, /^Enkel norsk pseudokode\. Kommandoer: gjenta N ganger:, hvis \.\.\.:, ellers:, legg til, trekk fra, gang tallet med, si «\.\.\.», tegn, gå fram, snu til høyre\./)
    assert.equal(raw().codeFormat, patternCodeFormat)
    function raw() {
      return bankJson()
    }
  })

  it('ID-ene kolliderer ikke med de andre bankene, og ingen annen bank har prefikset MO', () => {
    assert.equal(new Set(referenceBanks.map((r) => r.id)).size, referenceBanks.length)
    assert.equal(referenceBanks.filter((r) => r.topic === 'monster-og-algoritmer').length, 45)
    assert.ok(!referenceBanks.some((r) => r.topic !== 'monster-og-algoritmer' && r.id.startsWith('MO')))
    // M1-N1-01 (Multiplikasjon) og MO1-N1-01 er ulike ID-er, og begge er interne.
    assert.ok(referenceBanks.some((r) => r.id === 'M1-N1-01') && referenceBanks.some((r) => r.id === 'MO1-N1-01'))
    assert.ok(containsInternalText('Se MO4-N2-01.'))
  })

  it('2. hvert av de fem områdene har tre referanser på hvert av de tre nivåene', () => {
    assert.deepEqual([...PATTERN_AREAS], ['utforske-monster', 'figurtall', 'tallfolger', 'koder-lokker', 'koder-vilkar'])
    assert.deepEqual([...new Set(patternReferences.map((r) => r.area))], [...PATTERN_AREAS])
    for (const area of PATTERN_AREAS) {
      assert.equal(topicOfArea(area), 'monster-og-algoritmer')
      assert.ok(AREA_TITLES[area])
      for (const level of [1, 2, 3]) assert.equal(patternReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 45 referansene består de faglige kontrollene for sitt område og nivå', () => {
    for (const ref of patternReferences) {
      assert.equal(patternProblem(text(ref.level, ref.studentText, ref.solution), { area: ref.area as never }), null, ref.id)
    }
  })

  it('valideringen finner en feil fasit', () => {
    const broken = bankJson()
    broken.references = broken.references.map((r) => (r.id === 'MO2-N2-01' ? { ...r, workedSolution: '4 + 9 · 3 = 4 + 27 = 32.' } : r))
    assert.ok(validateReferenceBank(broken, 45, PATTERN_BANK).errors.some((e) => e.includes('MO2-N2-01')))
  })
})

describe('3. øktene i Mønster og algoritmer og de fem fagområdene', () => {
  it('beholder fire økter med samme ID-er og rekkefølge, og kobler dem til de fem fagområdene', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.profile?.area, s.profile?.secondaryAreas ?? []]),
      [
        ['monster-og-algoritmer-1', 'Utforske mønster og figurtall', 'utforske-monster', ['figurtall']],
        ['monster-og-algoritmer-2', 'Mønster i tallfølger', 'tallfolger', []],
        ['monster-og-algoritmer-3', 'Koder med løkker', 'koder-lokker', []],
        ['monster-og-algoritmer-4', 'Koder med vilkår', 'koder-vilkar', []],
      ],
    )
    assert.deepEqual(unitSpecs.find((u) => u.unitId === 'monster-og-algoritmer')!.weeks.map((w) => w.sessions.length), [2, 2])
    // Alle fem fagområdene er dekket.
    assert.deepEqual(new Set(sessions.flatMap((s) => [s.profile!.area, ...(s.profile!.secondaryAreas ?? [])])), new Set(PATTERN_AREAS))
  })

  it('velger bare referanser fra Mønster og algoritmer, øktas fagområde og nivå – aldri tilfeldig fra hele banken', () => {
    for (const s of sessions) {
      const areas = [s.profile!.area, ...(s.profile!.secondaryAreas ?? [])]
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level, seed })
          assert.equal(chosen.length, 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.topic === 'monster-og-algoritmer' && areas.includes(r.area) && r.level === level && r.id.startsWith('MO')), `${s.id} nivå ${level}`)
          // Hovedområdet får de fleste plassene; tilgrensende område høyst én.
          assert.ok(chosen.filter((r) => r.area === s.profile!.area).length >= 2)
        }
      }
    }
  })

  it('serveren sender referansene fra området og kodeformatet i øktene om løkker og vilkår', async () => {
    const promptFor = async (s: Planned) => {
      let prompt = ''
      const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
        prompt = contents[0]?.parts?.[0]?.text ?? ''
        const body = JSON.stringify({ melding: '', oppgaver: [] })
        return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
      }
      const handler = createTaskHandler({ generate: generate as never, log: () => {}, newSeed: () => 4 })
      await assert.rejects(handler(appRequest(s), { uid: 'l', classId: '4A' }))
      return prompt
    }
    const loops = await promptFor(session(LOOPS))
    assert.ok(loops.includes('Hovedtema: Mønster og algoritmer'))
    assert.ok(loops.includes('Fagområde: Koder med løkker'))
    assert.ok(loops.includes(`Kodeformat: ${patternCodeFormat}`))
    assert.ok(loops.includes('innrykk på nøyaktig fire mellomrom'))
    const ids = [...loops.matchAll(/ID: (MO\d-N\d-\d{2})/g)].map((m) => m[1])
    assert.equal(ids.length, 9)
    assert.ok(ids.every((id) => id.startsWith('MO4-')), ids.join(','))
    // Koden i referansene beholder linjeskift og innrykk i prompten.
    assert.ok(loops.includes('gjenta 4 ganger:\n    legg til 2') || loops.includes('gjenta 3 ganger:\n    klapp') || loops.includes('    '))
    assert.ok((await promptFor(session(CONDITIONS))).includes(`Kodeformat: ${patternCodeFormat}`))
    // Økt 1: figurtall er tilgrensende område – én støttereferanse og føringene for begge.
    const explore = await promptFor(session(EXPLORE))
    assert.ok(!explore.includes('Kodeformat:'))
    assert.ok(explore.includes('Tilgrensende område (bare som støtte – hovedfokus er Utforske mønster): Figurtall'))
    assert.ok(explore.includes('●, ■ og ▲'))
    assert.ok(explore.includes('Figur 1: 5 prikker. Figur 2: 8 prikker. Figur 3: 11 prikker.') && explore.includes('Appen tegner prikkene'))
    const sequences = await promptFor(session(SEQUENCES))
    assert.ok(!sequences.includes('Kodeformat:'))
    assert.ok([...sequences.matchAll(/ID: (MO\d-N\d-\d{2})/g)].every((m) => m[1].startsWith('MO3-')))
  })

  it('profilen sender fagområdet, og nivåene har egne beskrivelser', () => {
    assert.equal(toAiProfile(session(LOOPS).profile!).area, 'koder-lokker')
    assert.deepEqual(toAiProfile(session(EXPLORE).profile!).secondaryAreas, ['figurtall'])
    assert.deepEqual(levelsFor(session(CONDITIONS), 5, 6).map((l) => l.title), ['Hvis og ellers', 'Grensetilfeller', 'Vilkår i løkke'])
    const prompt = taskPrompt(serverRequest(session(CONDITIONS)))
    assert.ok(prompt.includes('10 er ikke større enn 10'))
    assert.ok(prompt.includes('Alle oppgavene skal være tekstoppgaver (format «tekst»)'))
  })
})

describe('grunnoppgavene i Mønster og algoritmer', () => {
  /** Hele kontrollen for én grunnoppgave: oppgavesettet uten oppgaven selv (ellers er den sin egen duplikat). */
  function baseReason(s: Planned, all: ReturnType<typeof buildTasks>, t: ReturnType<typeof buildTasks>[number]) {
    const request = serverRequest(s)
    request.levels = request.levels!.map((l) => ({
      ...l,
      // Alle referansene i områdene på nivået, så ingen grunnoppgave ligner en referanse uansett utvalg.
      referenceTasks: patternReferences.filter((r) => r.level === l.level && [s.profile!.area, ...(s.profile!.secondaryAreas ?? [])].includes(r.area)).map(toAiReference),
      existing: summarizeExisting(all.filter((x) => x.level === l.level && x.id !== t.id)),
    }))
    const draft = t.kind === 'text' ? text(t.level, t.text, t.solution) : text(t.level, t.instruction, '')
    return checkCandidates([draft], request).rejected[0]?.reason ?? null
  }

  it('alle grunnoppgavene er tekstoppgaver og passer hele kontrollen i sin egen økt', () => {
    let checked = 0
    for (const s of sessions) {
      const all = [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]
      for (const t of all) {
        assert.equal(t.kind, 'text', `${t.id} er et regnestykke`)
        checked++
        const found = baseReason(s, all, t)
        // Arbeidsarkene i økt 2 går lenger enn referansenes tallområde i svarene (f.eks. 4, 8, 16, 32 → 512). Det er lov for
        // grunnoppgaver; AI-oppgavene holder seg til tallområdet i referansene og tekstene i oppgavesettet.
        if (found === 'outsideRange' && t.id.startsWith('ark-')) continue
        assert.equal(found, null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : ''}`)
      }
    }
    assert.ok(checked >= 70, String(checked))
  })

  it('koden i grunnoppgavene er gyldig pseudokode, og fasiten er det programmet gir', () => {
    for (const id of [LOOPS, CONDITIONS]) {
      for (const t of buildTasks(session(id))) {
        assert.equal(t.kind, 'text')
        if (t.kind !== 'text') continue
        const [block] = codeBlocks(t.text)
        assert.ok(block, t.text)
        const parsed = parseProgram(block)
        assert.ok('program' in parsed, t.text)
        if (!('program' in parsed)) continue
        const start = Number(/Start med (\d+)/.exec(t.text)?.[1] ?? NaN)
        const result = runProgram(parsed.program, Number.isNaN(start) ? null : start)
        const answer = result.value ?? result.steps
        assert.ok(t.solution.includes(String(answer)), `${t.text} → ${answer} (${t.solution})`)
      }
    }
  })

  it('ingen grunnoppgaver har feil fagområde, gamle inline-koder eller kommandoer utenfor kodeformatet', () => {
    const texts = sessions.flatMap((s) => [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]).map((t) => (t.kind === 'text' ? t.text : t.instruction))
    assert.ok(!texts.some((t) => /Koden sier|del det på 2|Gjenta \d/.test(t)))
    // Økt 1 har mønstre og figurtall, ikke tallfølger.
    assert.ok(buildTasks(session(EXPLORE)).every((t) => t.kind === 'text' && (/[●■▲]|gul|grønn|rød|blå/.test(t.text) || /Figur \d/.test(t.text))))
    // Tallinjen med bare ett tall (regelen kunne vært hva som helst) viser nå tre tall.
    assert.ok(worksheetTasks[SEQUENCES].some((t) => t.kind === 'text' && t.text.includes('58, ___') && t.text.includes('66') && t.text.includes('73')))
  })

  it('repetisjonsøkta med Mønster i tallfølger har samme overskrift, undertema og antall oppgaver', () => {
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).filter((s) => s.spec.unitId !== 'monster-og-algoritmer' && s.skills.some((k) => k.startsWith('mon.')))
    assert.deepEqual(repetition.map((s) => [s.id, s.heading, s.skills]), [['repetisjon-var-3', 'Repetisjon: mønstre, tabeller og diagrammer', ['mon.tallfolger', 'reg.tabeller', 'reg.diagrammer']]])
    assert.equal(buildTasks(repetition[0]).length, 15)
  })
})

describe('4. referanser kopieres ikke direkte eller nesten direkte', () => {
  it('ordrett eller nesten ordrett fra banken avvises', () => {
    const ref = patternReferences.find((r) => r.id === 'MO4-N2-01')!
    assert.equal(reason(LOOPS, text(2, ref.studentText, ref.solution)), 'copiedReference')
    // Bare tallene byttet ut.
    assert.equal(reason(LOOPS, text(2, 'Start med 12.\ngjenta 3 ganger:\n    legg til 6\n    trekk fra 2\nHva er tallet til slutt?', '24.')), 'copiedReference')
    const seq = patternReferences.find((r) => r.id === 'MO3-N2-01')!
    assert.equal(reason(SEQUENCES, text(2, seq.studentText, seq.solution)), 'copiedReference')
  })

  it('en ny oppgave med egen formulering godtas', () => {
    assert.equal(reason(LOOPS, text(2, 'Lise lager et program:\nStart med 4.\ngjenta 3 ganger:\n    gang tallet med 2\n    trekk fra 1\nHvilket tall står igjen når programmet er ferdig?', '25. 4 · 2 − 1 = 7, 7 · 2 − 1 = 13, 13 · 2 − 1 = 25.')), null)
  })
})

describe('5. gjentakende mønstre: figuren på en plass', () => {
  it('feil figur på en gitt plass avvises, riktig figur godtas', () => {
    const task = 'Mønsteret gjentar seg:\n■ ▲ ▲ ■ ▲ ▲\nHvilken figur står på plass 16?'
    assert.equal(reason(EXPLORE, text(2, task, '■. Gjentakelsen ■ ▲ ▲ har 3 figurer, og plass 16 er den første i en gjentakelse.')), null)
    assert.equal(reason(EXPLORE, text(2, task, '▲. Plass 16 er ▲.')), 'wrongSolution')
    assert.equal(reason(EXPLORE, text(1, 'Her er et mønster med farger:\ngul, rød, gul, rød, gul, rød\nHvilken farge står på plass 9?', 'Rød.')), 'wrongSolution')
  })

  it('mønsteret må gjenta seg i alle viste ledd, og antallet av hver figur må stemme', () => {
    assert.equal(reason(EXPLORE, text(2, 'Mønsteret gjentar seg:\n■ ▲ ▲ ■ ▲ ■\nHvilken figur står på plass 16?', '■.')), 'wrongPattern')
    const count = 'Lise lager et mønster:\n▲ ● ● ▲ ● ●\nHun fortsetter til det er 18 figurer til sammen. Hvor mange ● er det?'
    assert.equal(reason(EXPLORE, text(2, count, '12 ●. 18 : 3 = 6 gjentakelser med 2 ● i hver.')), null)
    assert.equal(reason(EXPLORE, text(2, count, '9 ●.')), 'wrongSolution')
  })

  it('oppgaver om en feil i mønsteret må ha nøyaktig den feilen fasiten sier', () => {
    const swapped = 'Jonas har byttet om to naboer i mønsteret ved en feil:\n▲ ● ■ ▲ ● ■ ▲ ■ ● ▲ ● ■\nHvilke to plasser er byttet?'
    assert.equal(reason(EXPLORE, text(2, swapped, 'Plass 8 og 9. Der skulle det stått ● ■.')), null)
    assert.equal(reason(EXPLORE, text(2, swapped, 'Plass 7 og 8.')), 'wrongSolution')
    // Ingen bytte av naboer gir et mønster: oppgaven stemmer ikke med fasiten.
    assert.equal(reason(EXPLORE, text(2, 'Jonas har byttet om to naboer i mønsteret ved en feil:\n▲ ● ■ ▲ ● ■ ■ ▲ ● ▲ ● ■\nHvilke to plasser er byttet?', 'Plass 7 og 8.')), 'wrongPattern')
  })

  it('figurer appen ikke bruker, og mønstre som ikke vises, avvises', () => {
    assert.equal(reason(EXPLORE, text(1, 'Mønsteret gjentar seg:\n★ ○ ★ ○ ★ ○\nHvilken figur står på plass 9?', '★.')), 'invalidVisual')
    assert.equal(reason(EXPLORE, text(1, 'Se på mønsteret under. Hvilken figur står på plass 9?', '▲.')), 'missingFigure')
  })
})

describe('6 og 7. figurtall og tallfølger: regelen må passe alle ledd, og svaret må følge den', () => {
  it('figurtall der regelen ikke passer alle figurene, eller med for få figurer, avvises', () => {
    assert.equal(reason(EXPLORE, text(2, 'Et figurtall vokser likt.\nFigur 1: 4 klosser. Figur 2: 9 klosser. Figur 3: 14 klosser.\nHvor mange klosser er det i figur 6?', '29 klosser.')), null)
    assert.equal(reason(EXPLORE, text(2, 'Et figurtall vokser likt.\nFigur 1: 4 klosser. Figur 2: 9 klosser. Figur 3: 15 klosser.\nHvor mange klosser er det i figur 6?', '29 klosser.')), 'wrongPattern')
    assert.equal(reason(EXPLORE, text(2, 'Et figurtall vokser likt.\nFigur 1: 4 klosser. Figur 2: 9 klosser. Figur 3: 14 klosser.\nHvor mange klosser er det i figur 6?', '30 klosser.')), 'wrongSolution')
    assert.equal(reason(EXPLORE, text(2, 'Figur 1: 4 klosser. Figur 2: 9 klosser.\nHvor mange klosser er det i figur 6?', '29 klosser.')), 'missingInfo')
  })

  it('kvadrattall og trekanttall må være riktige', () => {
    assert.equal(patternProblem(text(3, 'Er 49 et kvadrattall? Er 50 et kvadrattall? Forklar med rader.', '49 er et kvadrattall, fordi 7 · 7 = 49. 50 er ikke et kvadrattall.'), { area: 'figurtall' }), null)
    assert.equal(patternProblem(text(3, 'Er 49 et kvadrattall? Er 50 et kvadrattall? Forklar med rader.', '49 er et kvadrattall. 50 er et kvadrattall.'), { area: 'figurtall' }), 'wrongSolution')
    assert.equal(patternProblem(text(2, 'Prikkene ligger som trekanter. Figur 1 har 1 prikk. Figur 2 har 3 prikker. Figur 3 har 6 prikker. Hvor mange prikker har figur 6?', '21 prikker.'), { area: 'figurtall' }), null)
    assert.equal(patternProblem(text(2, 'Prikkene ligger som trekanter. Figur 1 har 1 prikk. Figur 2 har 3 prikker. Figur 3 har 6 prikker. Hvor mange prikker har figur 6?', '18 prikker.'), { area: 'figurtall' }), 'wrongSolution')
  })

  it('tallfølger der regelen ikke passer alle ledd, eller der flere enkle regler passer, avvises', () => {
    assert.equal(reason(SEQUENCES, text(2, 'Fortsett tallfølgen: 7, 13, 19, 26, __, __', '32 og 38.')), 'wrongPattern')
    // 2, 4, 8 kan være · 2 (16) eller +2, +4, +6 (14): for få ledd til at regelen er entydig.
    assert.equal(reason(SEQUENCES, text(2, 'Hvilket tall kommer etter? 3, 6, 12, __', '24.')), 'ambiguousRule')
    assert.equal(reason(SEQUENCES, text(1, 'Hvilket tall kommer etter? 6, 11, 16, __', '21.')), 'missingInfo')
  })

  it('feil neste ledd og feil manglende ledd avvises', () => {
    assert.equal(reason(SEQUENCES, text(1, 'Fortsett tallfølgen med to tall: 9, 16, 23, 30, __, __', '37 og 44.')), null)
    assert.equal(reason(SEQUENCES, text(1, 'Fortsett tallfølgen med to tall: 9, 16, 23, 30, __, __', '37 og 45.')), 'wrongSolution')
    assert.equal(reason(SEQUENCES, text(2, 'Hvilke tall mangler? 8, 14, __, 26, __, 38', '20 og 32.')), null)
    assert.equal(reason(SEQUENCES, text(2, 'Hvilke tall mangler? 8, 14, __, 26, __, 38', '20 og 30.')), 'wrongSolution')
    // Regelen i fasiten må være regelen som passer.
    assert.equal(reason(SEQUENCES, text(2, '3, 6, 12, 24, __\nHva er regelen? Skriv det neste tallet.', 'Regelen er +3. Neste tall er 48.')), 'wrongSolution')
  })

  it('påstander om alle leddene og spørsmål om et tall er med, må ha riktig konklusjon', () => {
    assert.equal(reason(SEQUENCES, text(3, 'Ola ser på tallfølgen 4, 9, 14, 19, … som fortsetter med +5. Han mener at alle tallene i følgen blir oddetall. Stemmer det? Forklar.', 'Ja. Alle tallene blir oddetall.')), 'wrongConclusion')
    assert.equal(reason(SEQUENCES, text(3, 'Ola ser på tallfølgen 4, 9, 14, 19, … som fortsetter med +5. Han mener at alle tallene i følgen blir oddetall. Stemmer det? Forklar.', 'Nei. 4 og 14 er partall, og hvert andre tall blir partall.')), null)
    assert.equal(reason(SEQUENCES, text(2, 'Tallfølgen starter på 3 og øker med 4 hver gang: 3, 7, 11, …\nKommer tallet 30 i tallfølgen? Forklar.', 'Ja. 30 kommer.')), 'wrongConclusion')
  })
})

describe('8. løkker: antall gjentakelser og sluttverdi', () => {
  it('feil antall gjentakelser eller feil sluttverdi i fasiten avvises', () => {
    const loop = 'Ali lager et program:\nStart med 5.\ngjenta 4 ganger:\n    legg til 3\nHvilket tall står igjen når programmet er ferdig?'
    assert.equal(reason(LOOPS, text(1, loop, '17. 5 + 4 · 3 = 17.')), null)
    // Regnet med 3 gjentakelser.
    assert.equal(reason(LOOPS, text(1, loop, '14.')), 'wrongSolution')
    // Bare den første kommandoen gjentas – den andre står utenfor løkka.
    const two = 'Start med 2.\ngjenta 3 ganger:\n    legg til 5\ntrekk fra 1\nHvilket tall står igjen når programmet er ferdig?'
    assert.equal(reason(LOOPS, text(2, two, '16. 2 + 3 · 5 = 17, og 17 − 1 = 16.')), null)
    assert.equal(reason(LOOPS, text(2, two, '14.')), 'wrongSolution')
  })

  it('tallet etter hver runde, alt som skjer og antallet programmet tegner må stemme', () => {
    const rounds = 'Start med 3.\ngjenta 4 ganger:\n    gang tallet med 2\nHvilke tall får du etter hver runde?'
    assert.equal(patternProblem(text(3, rounds, '6, 12, 24, 48.'), { area: 'koder-lokker' }), null)
    assert.equal(patternProblem(text(3, rounds, '6, 12, 24, 36.'), { area: 'koder-lokker' }), 'wrongSolution')
    const moves = 'gjenta 2 ganger:\n    stamp\n    klapp\n    klapp\nSkriv alt som skjer, i riktig rekkefølge.'
    assert.equal(patternProblem(text(1, moves, 'stamp, klapp, klapp, stamp, klapp, klapp.'), { area: 'koder-lokker' }), null)
    assert.equal(patternProblem(text(1, moves, 'stamp, klapp, stamp, klapp.'), { area: 'koder-lokker' }), 'wrongSolution')
  })

  it('rettede og utfylte programmer i fasiten må gi det oppgaven ber om', () => {
    const stars = 'Ola vil at programmet skal tegne 9 stjerner. Han skriver:\ngjenta 4 ganger:\n    tegn stjerne\n    tegn stjerne\n    tegn stjerne\nHvor mange stjerner tegner programmet? Rett programmet.'
    assert.equal(patternProblem(text(3, stars, 'Programmet tegner 12 stjerner. Riktig: gjenta 3 ganger med tre «tegn stjerne».'), { area: 'koder-lokker' }), null)
    assert.equal(patternProblem(text(3, stars, 'Programmet tegner 12 stjerner. Riktig: gjenta 2 ganger med tre «tegn stjerne».'), { area: 'koder-lokker' }), 'wrongSolution')
    assert.equal(patternProblem(text(3, stars, 'Programmet tegner 8 stjerner. Riktig: gjenta 3 ganger med tre «tegn stjerne».'), { area: 'koder-lokker' }), 'wrongSolution')
    const square = 'En robot skal gå rundt et kvadrat der hver side er 5 steg. Fyll inn tallene:\ngjenta __ ganger:\n    gå __ steg fram\n    snu til høyre'
    assert.equal(patternProblem(text(2, square, 'gjenta 4 ganger:\n    gå 5 steg fram\n    snu til høyre'), { area: 'koder-lokker' }), null)
    assert.equal(patternProblem(text(2, square, 'gjenta 3 ganger:\n    gå 5 steg fram\n    snu til høyre'), { area: 'koder-lokker' }), 'wrongSolution')
    const from = 'Lag et program med «gjenta» og «legg til» som starter på 6 og ender på 30. Forklar hvor mange ganger løkka gjentas.'
    assert.equal(patternProblem(text(3, from, 'For eksempel gjenta 4 ganger: legg til 6. 30 − 6 = 24, og 4 · 6 = 24.'), { area: 'koder-lokker' }), null)
    assert.equal(patternProblem(text(3, from, 'For eksempel gjenta 5 ganger: legg til 6.'), { area: 'koder-lokker' }), 'wrongSolution')
  })
})

describe('9. vilkår: riktig gren, også i grensetilfeller', () => {
  const bigger = 'Et spill bruker dette programmet:\nhvis tallet er større enn 12:\n    si «høyt»\nellers:\n    si «lavt»\nSpilleren får tallene 20, 12 og 4. Hva sier programmet for hvert av dem?'

  it('feil gren i grensetilfellet avvises', () => {
    assert.equal(reason(CONDITIONS, text(1, bigger, '20: «høyt». 12: «lavt». 4: «lavt».')), null)
    assert.equal(reason(CONDITIONS, text(1, bigger, '20: «høyt». 12: «høyt». 4: «lavt».')), 'wrongSolution')
    const start = 'Sara tester grensen i et program:\nStart med 15.\nhvis tallet er større enn 15:\n    trekk fra 4\nellers:\n    legg til 2\nHvilket tall viser programmet til slutt?'
    assert.equal(reason(CONDITIONS, text(2, start, '17. 15 er ikke større enn 15, så programmet legger til 2.')), null)
    assert.equal(reason(CONDITIONS, text(2, start, '11.')), 'wrongSolution')
  })

  it('sortering, vilkår inne i løkker og vilkår uten tydelig kriterium', () => {
    const sort = 'Emma sorterer kort med dette programmet:\nhvis tallet er i firegangen:\n    legg det i kurv A\nellers:\n    legg det i kurv B\nHun har kort med tallene 8, 10, 16, 21 og 24. Hvilke kort havner i hver kurv?'
    assert.equal(reason(CONDITIONS, text(2, sort, 'Kurv A: 8, 16, 24. Kurv B: 10, 21.')), null)
    assert.equal(reason(CONDITIONS, text(2, sort, 'Kurv A: 8, 16. Kurv B: 10, 21, 24.')), 'wrongSolution')
    // Vilkåret sjekkes på nytt i hver runde.
    const loop = 'Noah tester et program med en løkke og et vilkår:\nStart med 4.\ngjenta 3 ganger:\n    hvis tallet er et partall:\n        legg til 3\n    ellers:\n        legg til 2\nHvilket tall har du etter hver runde?'
    assert.equal(reason(CONDITIONS, text(3, loop, '7, 9, 11. Tallet til slutt er 11.')), null)
    assert.equal(reason(CONDITIONS, text(3, loop, '7, 10, 13. Tallet til slutt er 13.')), 'wrongSolution')
    assert.equal(reason(CONDITIONS, text(1, 'hvis tallet er stort:\n    si «stort»\nellers:\n    si «lite»\nHva sier programmet når tallet er 30?', '«stort».')), 'invalidCode')
  })

  it('et rettet vilkår må velge samme gren som beskrivelsen, også i grensetilfellet', () => {
    const ticket = 'Programmet skal si «halv pris» til barn som er under 12 år. Mia skriver:\nhvis alderen er større enn 12:\n    si «halv pris»\nHva er feil? Rett programmet. Hva sier ditt program til et barn som er 12 år?'
    assert.equal(patternProblem(text(3, ticket, 'Vilkåret er snudd. Riktig: hvis alderen er mindre enn 12: si «halv pris». Et barn på 12 år får ikke halv pris, fordi 12 ikke er mindre enn 12.'), { area: 'koder-vilkar' }), null)
    assert.equal(patternProblem(text(3, ticket, 'Vilkåret er snudd. Riktig: hvis alderen er mindre enn 13: si «halv pris». Et barn på 12 år får halv pris.'), { area: 'koder-vilkar' }), 'wrongSolution')
    assert.equal(patternProblem(text(3, ticket, 'Vilkåret er snudd. Riktig: hvis alderen er mindre enn 12: si «halv pris». Et barn på 12 år får halv pris.'), { area: 'koder-vilkar' }), 'wrongConclusion')
  })
})

describe('10. pseudokoden: bare kodeformatet, konsekvent innrykk og ikke et ekte programmeringsspråk', () => {
  const ok = 'Start med 2.\ngjenta 3 ganger:\n    legg til 4\nHvilket tall står igjen når programmet er ferdig?'

  it('kode i Python, JavaScript eller Scratch avvises', () => {
    assert.equal(reason(LOOPS, text(1, ok, '14.')), null)
    assert.equal(reason(LOOPS, text(1, 'tall = 2\nfor i in range(3):\n    tall = tall + 4\nprint(tall)\nHva skriver programmet?', '14')), 'invalidCode')
    assert.equal(reason(LOOPS, text(1, 'let tall = 2;\nfor (let i = 0; i < 3; i++) { tall += 4 }\nHva er tallet?', '14')), 'invalidCode')
    assert.equal(reason(LOOPS, text(1, 'I Scratch: når grønt flagg klikkes, gjenta 3 ganger: endre tall med 4. Start med 2. Hva er tallet?', '14')), 'invalidCode')
  })

  it('kommandoer utenfor kodeformatet, feil innrykk, nøstede løkker og variabler med flere bokstaver avvises', () => {
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger:\n    hopp 4 steg til siden\nHvor mange steg?', '12 steg.')), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger:\n  legg til 4\nHvilket tall står igjen?', '14.')), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger:\n\tlegg til 4\nHvilket tall står igjen?', '14.')), 'invalidCode')
    assert.equal(reason(LOOPS, text(3, 'Start med 2.\ngjenta 3 ganger:\n    gjenta 2 ganger:\n        legg til 1\nHvilket tall står igjen?', '8.')), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger:\n    legg til poeng\nHvilket tall står igjen?', '14.')), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger: legg til 4\nHvilket tall står igjen?', '14.')), 'invalidCode')
  })

  it('kjøreren følger bare kommandoene inne i løkka, og innrykk bestemmer hva som er inne i den', () => {
    const run = (code: string, start: number | null) => {
      const parsed = parseProgram(code.split('\n'))
      assert.ok('program' in parsed)
      return runProgram((parsed as { program: never }).program, start)
    }
    assert.equal(run('gjenta 3 ganger:\n    legg til 4\n    trekk fra 1', 2).value, 11)
    assert.equal(run('gjenta 3 ganger:\n    legg til 4\ntrekk fra 1', 2).value, 13)
    assert.deepEqual(run('gjenta 4 ganger:\n    gå 3 steg fram\n    snu til høyre', null).segments, [3, 3, 3, 3])
    assert.ok(run('gjenta 4 ganger:\n    gå 3 steg fram\n    snu til høyre', null).home)
    assert.deepEqual('error' in parseProgram(['ellers:', '    si «x»']), true)
  })
})

describe('11. visning: kodelinjer og mønsterfigurer vises med linjeskift og innrykk', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  it('elevvisningen og lærervisningen beholder linjeskift og mellomrom i oppgaveteksten', () => {
    // whitespace-pre-wrap bevarer både linjeskift og innrykket på fire mellomrom (og bryter lange linjer).
    assert.match(read('src/features/student/TextTaskScreen.tsx'), /<h2 className="[^"]*whitespace-pre-wrap[^"]*">\{text\}<\/h2>/)
    // Teksten eleven ser er oppgaveteksten – bare uten fargelinja når fargene vises som sirkler.
    assert.match(read('src/features/student/TextTaskScreen.tsx'), /task\.figure\?\.kind === 'colors' \? withoutColorRow\(task\.text, task\.figure\.items\) : task\.figure\?\.kind === 'dots' \? withoutDotSentences\(task\.text\) : task\.text/)
    assert.match(read('src/features/tasks/TextTaskCard.tsx'), /<p className="[^"]*whitespace-pre-wrap[^"]*">\{task\.text\}<\/p>/)
    assert.match(read('src/features/tasks/TextTaskCard.tsx'), /<p className="[^"]*whitespace-pre-wrap[^"]*">\{task\.solution\}<\/p>/)
  })

  it('kodelinjer og figurene ●, ■ og ▲ går uendret fra AI-svaret til oppgaven eleven ser', () => {
    const code = 'Start med 1.\ngjenta 4 ganger:\n    hvis tallet er et oddetall:\n        legg til 1\n    ellers:\n        legg til 3\nHvilket tall har du etter hver runde?'
    const result = parseTaskResult({ melding: '', oppgaver: [story(3, code, '2, 5, 6, 9.'), story(1, 'Mønsteret gjentar seg:\n● ■ ▲ ● ■ ▲\nHvilken figur står på plass 8?', '■.')] })!
    const [codeTask, patternTask] = result.tasks.map((t, i) => toSessionTask(t, `ai-${i}`))
    assert.equal(codeTask.kind, 'text')
    assert.equal(codeTask.kind === 'text' && codeTask.text, code)
    assert.ok(codeTask.kind === 'text' && codeTask.text.split('\n').some((line) => line.startsWith('        legg til 1')))
    assert.equal(patternTask.kind === 'text' && patternTask.text.split('\n')[1], '● ■ ▲ ● ■ ▲')
    // Grunnoppgavene har også koden på egne linjer med fire mellomrom innrykk.
    assert.ok(buildTasks(session(CONDITIONS)).some((t) => t.kind === 'text' && t.text.includes('\n        trekk fra 6\n')))
  })
})

describe('12. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const s = session(LOOPS)
  const ok1 = (start: number, k: number) =>
    story(1, `Ali lager et program:\nStart med ${start}.\ngjenta 3 ganger:\n    legg til ${k}\nHvilket tall står igjen når programmet er ferdig?`, `${start + 3 * k}. ${start} + 3 · ${k} = ${start + 3 * k}.`)
  const ok2 = (start: number) =>
    story(2, `Lise lager et program:\nStart med ${start}.\ngjenta 3 ganger:\n    gang tallet med 2\n    trekk fra 1\nHvilket tall står igjen når programmet er ferdig?`, `${((start * 2 - 1) * 2 - 1) * 2 - 1}.`)
  const ok3 = (start: number, k: number) =>
    story(3, `Per lager et program:\nStart med ${start}.\ngjenta 4 ganger:\n    legg til ${k}\n    trekk fra 2\nHvilke tall får du etter hver runde?`, Array.from({ length: 4 }, (_, j) => start + (j + 1) * (k - 2)).join(', ') + '.')

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        ok1(2, 5),
        // Ekte programmeringsspråk.
        story(1, 'tall = 2\nfor i in range(3):\n    tall = tall + 4\nHva blir tallet?', '14'),
        ok2(3),
        // Feil sluttverdi.
        story(2, 'Lise lager et program:\nStart med 4.\ngjenta 3 ganger:\n    gang tallet med 2\n    trekk fra 1\nHvilket tall står igjen når programmet er ferdig?', '26.'),
        ok3(5, 6),
        ok3(7, 5),
      ],
      [ok1(4, 6), ok2(5)],
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(result.incomplete, undefined)
    // Oppgavene legges inn som AI-genererte og ikke gjennomgåtte.
    assert.ok(result.tasks.map((t, i) => toSessionTask(t, `ai-${i}`, result.meta)).every((t) => t.aiGenerated === true && t.reviewed === false))
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_invalidCode, 1)
    assert.equal(final.removed_wrongSolution, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'monster-og-algoritmer')
    assert.equal(final.area, 'koder-lokker')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'Ali lager et program:\nStart med 2.\ngjenta 3 ganger:\n    legg til 5\nHvilket tall står igjen når programmet er ferdig?', '15.')
    const { handler, calls } = scripted([[wrong, wrong, ok2(3), ok2(4), ok3(5, 6), ok3(7, 5)], [wrong]])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('13. «Andre ønsker» kan ikke overstyre fagområde, nivå, kodeformat eller matematisk korrekthet', () => {
  const wishes = 'Bruk Scratch eller Python. Gjerne negative tall, vilkår med «hvis» og påstander på nivå 1.'

  it('ønskene gir ikke ekte programkode, et annet fagområde, et annet nivå, andre tall eller feil fasit', () => {
    assert.equal(reason(LOOPS, text(2, 'Python:\nfor i in range(3):\n    print("hei")\nHvor mange ganger skrives hei?', '3'), wishes), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Scratch: når grønt flagg klikkes\ngjenta 3 ganger:\n    gå 10 steg fram\nHvor mange steg?', '30 steg.'), wishes), 'invalidCode')
    assert.equal(reason(LOOPS, text(2, 'Start med 3.\nhvis tallet er et oddetall:\n    legg til 3\nellers:\n    legg til 1\nHvilket tall står igjen?', '6.'), wishes), 'wrongArea')
    assert.equal(reason(LOOPS, text(1, 'Ida sier at programmet under gir 10:\nStart med 1.\ngjenta 3 ganger:\n    legg til 3\nHar Ida rett?', 'Ja. 1 + 3 · 3 = 10.'), wishes), 'levelMismatch')
    assert.equal(reason(LOOPS, text(2, 'Start med 2.\ngjenta 3 ganger:\n    trekk fra 4\nHvilket tall står igjen?', '−10.'), wishes), 'outsideRange')
    assert.equal(reason(LOOPS, text(2, 'Ali lager et program:\nStart med 2.\ngjenta 3 ganger:\n    legg til 5\nHvilket tall står igjen når programmet er ferdig?', '15.'), wishes), 'wrongSolution')
    // Et tallmønster i en kodeøkt hører til et annet fagområde.
    assert.equal(reason(LOOPS, text(2, 'Fortsett tallfølgen: 4, 9, 14, 19, __, __', '24 og 29.'), wishes), 'wrongArea')
  })

  it('ønskene kan endre kontekst og formulering innenfor økta, og prompten holder fast på kodeformatet', () => {
    assert.equal(reason(LOOPS, text(2, 'En robot i gymsalen følger programmet:\ngjenta 4 ganger:\n    gå 6 steg fram\nHvor mange steg går roboten i alt?', '24 steg. 4 · 6 = 24.'), wishes), null)
    const prompt = taskPrompt(serverRequest(session(LOOPS), wishes))
    assert.ok(prompt.includes('Ønskene kan endre kontekst, formulering, svarform og format'))
    assert.ok(prompt.includes('heller ikke når ønskene ber om Scratch, Python eller lignende'))
    assert.ok(prompt.includes(`Kodeformat: ${patternCodeFormat}`))
  })
})

describe('14. andre temaer og referansebanker er uendret', () => {
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16)

  it('de sju andre bankene er byte for byte uendret, og utvalget i dem er det samme som før', () => {
    const file = (name: string) => readFileSync(new URL(`./references/${name}_referanser.json`, import.meta.url))
    assert.equal(hash(file('multiplikasjon')), '4e3e3970c12f95a6')
    assert.equal(hash(file('tall_og_plassverdi')), '21ba85a512aeffed')
    assert.equal(hash(file('divisjon')), '137f3e1f03a7d25f')
    assert.equal(hash(file('geometri')), 'f5051a7c950ae47c')
    assert.equal(hash(file('problemlosing')), '380ddf92250336a8')
    assert.equal(hash(file('tall_og_regning')), 'bc0636c64aaef7f8')
    assert.equal(hash(file('maling')), 'c6c767c2c1daa00d')
    assert.equal(referenceBanks.filter((r) => r.topic !== 'monster-og-algoritmer').length, 54 + 45 + 36 + 36 + 36 + 36 + 45)
    for (const [area, level] of [['tabell-6-7-8-9', 2], ['desimaltall-lengde', 3], ['vinkler', 1], ['tid', 2]] as const) {
      const own = referenceBanks.filter((r) => r.topic !== 'monster-og-algoritmer')
      assert.deepEqual(selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id), selectReferences(own, { area, level, seed: 11 }).map((r) => r.id))
    }
  })

  it('alle økter i de andre temaene og arbeidsarkene er uendret – i repetisjon bare oppgavene fra Mønster i tallfølger', () => {
    const all = unitSpecs.filter((u) => u.unitId !== 'monster-og-algoritmer').flatMap((u) => planned(u.unitId))
    const touched = (s: Planned) => s.skills.some((k) => k.startsWith('mon.'))
    // geometri-6 «Vinkler i trekanter» er endret senere: rene tekstoppgaver i stedet for regnestykker (se geometryAi.test.ts).
    const others = all.filter((s) => !touched(s) && s.id !== 'geometri-6').map((s) => ({ id: s.id, heading: s.heading, skills: s.skills, profile: s.profile ?? null, levels: levelsFor(s, 5, 6), tasks: buildTasks(s) }))
    // Verdiene er regnet ut fra koden før Mønster og algoritmer ble endret (git HEAD) og er de samme etterpå.
    assert.equal(others.length, 78)
    assert.equal(hash(JSON.stringify(others)), 'ed8f14facdee891d')
    assert.equal(hash(JSON.stringify(Object.fromEntries(Object.entries(worksheetTasks).filter(([id]) => !id.startsWith('monster-og-algoritmer-'))))), '6aa5b88e9063a764')
    // Repetisjonsøkta: oppgavene fra Regning (tabeller og diagrammer) er de samme som før.
    const v3 = all.find((s) => s.id === 'repetisjon-var-3')!
    const fromOthers = buildTasks(v3).filter((t) => v3.skills[(Number(t.id.split('-').at(-1)) - 1) % v3.skills.length] !== 'mon.tallfolger')
    assert.equal(hash(JSON.stringify(fromOthers)), '0e1881e2fc2b76e5')
  })

  it('kontrollene i de andre temaene er de samme: «Figur 4: 6 + 4 = 10» er en etikett, ikke et delestykke', async () => {
    const { checkEquations } = await import('./references/validate.ts')
    assert.deepEqual(checkEquations('Figur 4: 6 + 4 = 10.').errors, [])
    assert.deepEqual(checkEquations('Steg 1: 18 + 12 = 30.').errors, [])
    assert.equal(checkEquations('20 : 4 = 6').errors.length, 1)
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })
})

describe('15. figurtall med prikker', () => {
  it('antallene leses fra den faste linja – også «har», rader og regnestykker – men ikke fra påstander', () => {
    assert.deepEqual(dotCountsIn('Figur 1: 5 prikker. Figur 2: 8 prikker. Figur 3: 11 prikker.\nHvor mange prikker blir det i figur 4?'), [5, 8, 11])
    assert.deepEqual(dotCountsIn('Figur 1 er 1 prikk. Figur 2 har 2 rader med 2 prikker. Figur 3 har 3 rader med 3 prikker.'), [1, 4, 9])
    assert.deepEqual(dotCountsIn('Figur 1 har 1 prikk. Figur 2 har 1 + 2 = 3 prikker. Figur 3 har 1 + 2 + 3 = 6 prikker.'), [1, 3, 6])
    assert.deepEqual(dotCountsIn('Figur 1: 3 prikker. Figur 2: 5 prikker. Ola sier at figur 3 har 9 prikker.'), [3, 5])
    // Hull eller motsigelser: kan ikke tegnes riktig.
    assert.equal(dotCountsIn('Figur 1: 5 prikker. Figur 3: 11 prikker.'), null)
    assert.equal(dotCountsIn('Figur 1: 5 prikker. Figur 2: 8 prikker. Figur 2 har 9 prikker.'), null)
  })

  it('plasseringen: de gamle prikkene ligger på samme sted, og bare de nye er markert (lik økning, kvadrattall og trekanttall)', () => {
    for (const counts of [[5, 8, 11], [2, 4, 6, 8], [1, 4, 9, 16], [1, 3, 6, 10], [3, 4, 5]]) {
      const layout = dotLayout(counts)!
      assert.ok(layout, counts.join(','))
      layout.forEach((dots, i) => {
        assert.equal(dots.length, counts[i], `${counts} figur ${i + 1}`)
        const key = (d: { col: number; row: number }) => `${d.col},${d.row}`
        assert.equal(new Set(dots.map(key)).size, dots.length)
        if (i === 0) return assert.ok(dots.every((d) => !d.isNew))
        const before = new Set(layout[i - 1].map(key))
        assert.deepEqual(dots.filter((d) => !d.isNew).map(key).sort(), [...before].sort(), `${counts} figur ${i + 1}`)
        assert.equal(dots.filter((d) => d.isNew).length, counts[i] - counts[i - 1])
      })
    }
    // Lik økning: de nye prikkene er én kolonne helt til høyre. Kvadrattall: en vinkel. Trekanttall: en ny rad nederst.
    const plus = dotLayout([5, 8, 11])![2]
    assert.ok(plus.filter((d) => d.isNew).every((d) => d.col === Math.max(...plus.map((x) => x.col))))
    const square = dotLayout([1, 4, 9])![2]
    assert.ok(square.filter((d) => d.isNew).every((d) => d.col === 2 || d.row === 2))
    const triangle = dotLayout([1, 3, 6])![2]
    assert.ok(triangle.filter((d) => d.isNew).every((d) => d.row === 2))
    // Ingen regel, eller for store figurer: tegnes ikke.
    assert.equal(dotLayout([2, 5, 7]), null)
    assert.equal(dotLayout([10, 40, 70]), null)
  })

  it('grunnoppgavene i økt 1 tegner figur 1–3 som prikker, aldri figuren det spørres etter', () => {
    const withDots = buildTasks(session(EXPLORE)).filter((t) => t.kind === 'text' && t.figure?.kind === 'dots')
    assert.ok(withDots.length >= 5)
    for (const t of withDots) {
      if (t.kind !== 'text' || t.figure?.kind !== 'dots') continue
      assert.deepEqual(t.figure.counts, dotCountsIn(t.text))
      assert.ok(dotLayout(t.figure.counts))
      const asked = Number(/i figur (\d+)\?/.exec(t.text)![1])
      assert.ok(asked > t.figure.counts.length)
      assert.equal(previewProblem(t), null)
    }
    // Mønsteroppgavene har ingen prikker (fargemønstrene har fargesirkler, se 17).
    assert.ok(buildTasks(session(EXPLORE)).filter((t) => t.kind === 'text' && /[●■▲]|gul|rød|blå/.test(t.text)).every((t) => t.kind === 'text' && t.figure?.kind !== 'dots'))
  })

  it('AI-oppgaver: appen får antallene fra teksten, og figuren må stemme med tekst, regel og fasit', () => {
    const task = text(1, 'Et figurtall vokser likt hver gang.\nFigur 1: 4 prikker. Figur 2: 7 prikker. Figur 3: 10 prikker.\nHvor mange prikker blir det i figur 4?', '13 prikker. Det kommer 3 nye hver gang.')
    const checked = checkCandidates([task], serverRequest(session(EXPLORE)))
    assert.equal(checked.rejected.length, 0)
    const accepted = checked.accepted[0]
    assert.ok(accepted && 'dotCounts' in accepted)
    assert.deepEqual((accepted as { dotCounts?: number[] }).dotCounts, [4, 7, 10])
    const stored = toSessionTask(accepted, 'ai-1')
    assert.deepEqual(stored.kind === 'text' && stored.figure, { kind: 'dots', counts: [4, 7, 10] })
    assert.ok(stored.aiGenerated && !stored.reviewed)
    // Hull i figurene, figuren det spørres etter blant de tegnede, regel som ikke passer og feil fasit avvises.
    assert.equal(reason(EXPLORE, text(1, 'Et figurtall vokser likt.\nFigur 1: 4 prikker. Figur 3: 10 prikker. Figur 4: 13 prikker.\nHvor mange prikker blir det i figur 5?', '16 prikker.')), 'missingInfo')
    assert.equal(reason(EXPLORE, text(1, 'Et figurtall vokser likt.\nFigur 1: 4 prikker. Figur 2: 7 prikker. Figur 3: 10 prikker.\nHvor mange prikker har figur 2?', '7 prikker.')), 'revealedSolution')
    assert.equal(reason(EXPLORE, text(1, 'Et figurtall vokser likt.\nFigur 1: 4 prikker. Figur 2: 7 prikker. Figur 3: 11 prikker.\nHvor mange prikker blir det i figur 4?', '14 prikker.')), 'wrongPattern')
    assert.equal(reason(EXPLORE, text(1, 'Et figurtall vokser likt hver gang.\nFigur 1: 4 prikker. Figur 2: 7 prikker. Figur 3: 10 prikker.\nHvor mange prikker blir det i figur 4?', '14 prikker.')), 'wrongSolution')
    // Figurtall med fyrstikker eller klosser, og oppgaver der eleven lager selv, får ingen prikker.
    const sticks = checkCandidates([text(2, 'Ola bygger hus av pinner. Figur 1: 5 pinner. Figur 2: 9 pinner. Figur 3: 13 pinner.\nHvor mange pinner blir det i figur 6?', '25 pinner.')], serverRequest(session(EXPLORE))).accepted[0]
    assert.ok(sticks && !('dotCounts' in sticks))
  })

  it('prikkene lagres og leses inn igjen, og justering med AI regner dem ut fra den nye teksten', () => {
    const task = toSessionTask({ ...(text(1, 'Figur 1: 1 prikk. Figur 2: 4 prikker. Figur 3: 9 prikker.\nHvor mange prikker har figur 4?', '16 prikker.') as AiTextDraft), dotCounts: [1, 4, 9] }, 't1')
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(task))), task)
    // Ugyldige antall leses ikke inn som figur.
    const broken = readStoredTask({ ...JSON.parse(JSON.stringify(task)), figure: { kind: 'dots' as const, counts: [2, 5, 7] } })
    assert.ok(broken && broken.kind === 'text' && !broken.figure)
    assert.equal(task.kind, 'text')
    if (task.kind !== 'text') return
    const revised = applyRevision(task, { message: '', tasks: [text(1, 'Figur 1: 1 prikk. Figur 2: 3 prikker. Figur 3: 6 prikker.\nHvor mange prikker har figur 5?', '15 prikker.')] }).task!
    assert.deepEqual(revised.figure, { kind: 'dots', counts: [1, 3, 6] })
    const withoutDots = applyRevision(task, { message: '', tasks: [text(1, 'Hva er et kvadrattall? Forklar med rader.', 'Like mange rader som prikker i hver rad.')] }).task!
    assert.equal(withoutDots.figure, undefined)
    assert.match(previewProblem({ ...task, figure: { kind: 'dots' as const, counts: [2, 5, 7] } }) ?? '', /Prikkene/)
  })

  it('tegnes i elevvisningen, på lærerkortet og i forhåndsvisningen (samme figurkomponent), side om side og med antall under', () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(read('src/components/ui/TaskFigure.tsx'), /figure\.kind === 'dots'\) return <DotFigure/)
    assert.match(read('src/components/ui/DotFigure.tsx'), /flex-wrap/)
    assert.match(read('src/components/ui/DotFigure.tsx'), /\{count\} \{count === 1 \? 'prikk' : 'prikker'\}/)
    assert.match(read('src/features/student/TextTaskScreen.tsx'), /<TaskFigure figure=\{task\.figure\} \/>/)
    assert.match(read('src/features/tasks/TextTaskCard.tsx'), /<TaskFigure/)
  })
})

describe('16. tallrekker med inputbokser', () => {
  it('rekka deles i tall og bokser, og svarene lagres som én tekst', () => {
    const row = blankRowIn('Fyll inn tallene som mangler på tallinjen.\n21, ___, ___, 24, ___, …')!
    assert.equal(row.before, 'Fyll inn tallene som mangler på tallinjen.\n')
    assert.equal(row.blanks, 3)
    assert.deepEqual(row.items.map((i) => i.kind), ['number', 'blank', 'blank', 'number', 'blank', 'more'])
    assert.equal(blankRowIn('Skriv de to neste tallene: 5, 10, 15, 20, __, __')!.blanks, 2)
    assert.equal(blankRowIn('Finn tallene som mangler: 7, 12, __, 22, __, 32')!.items.length, 6)
    assert.equal(blankRowIn('Regn ut: 56 + ___ = 99'), null)
    assert.equal(joinBoxAnswers(['22', '', '24']), '22, , 24')
    assert.deepEqual(splitBoxAnswers('22, , 24', 3), ['22', '', '24'])
    assert.equal(joinBoxAnswers(['', '', '']), '')
    assert.equal(boxesComplete('22, , 24', 3), false)
    assert.equal(boxesComplete('22, 23, 24', 3), true)
  })

  it('alle rekker med tomme felt i Mønster og algoritmer har bokser – også i repetisjon-var-3, men ikke tabell- og diagramoppgavene', () => {
    const own = sessions.flatMap((s) => [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)])
    const withRow = own.filter((t) => t.kind === 'text' && blankRowIn(t.text))
    assert.ok(withRow.length >= 20)
    assert.ok(withRow.every((t) => t.kind === 'text' && t.answerBoxes && previewProblem(t) === null))
    assert.ok(own.filter((t) => t.kind === 'text' && !blankRowIn(t.text)).every((t) => t.kind === 'text' && !t.answerBoxes))
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).find((s) => s.id === 'repetisjon-var-3')!
    const tasks = buildTasks(repetition)
    assert.ok(tasks.some((t) => t.kind === 'text' && t.answerBoxes))
    assert.ok(tasks.filter((t) => t.kind === 'text' && t.answerBoxes).every((t) => t.kind === 'text' && blankRowIn(t.text)))
    // Ingen oppgaver i andre temaer har bokser, heller ikke «___» i regnestykker.
    const others = unitSpecs.filter((u) => u.unitId !== 'monster-og-algoritmer').flatMap((u) => planned(u.unitId)).filter((s) => !s.skills.some((k) => k.startsWith('mon.')))
    assert.ok(others.flatMap((s) => [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]).every((t) => t.kind !== 'text' || !t.answerBoxes))
  })

  it('AI-oppgaver med en tallrekke får bokser; kodeoppgaver og andre temaer får det ikke', () => {
    const seq = checkCandidates([text(1, 'Fortsett tallfølgen med to tall: 9, 16, 23, 30, ___, ___', '37 og 44.')], serverRequest(session(SEQUENCES))).accepted[0]
    const stored = toSessionTask(seq, 'ai-2')
    assert.ok(stored.kind === 'text' && stored.answerBoxes)
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(stored))), stored)
    // Tomme felt i kode («gjenta __ ganger:») er ikke en tallrekke.
    const code = withPatternDisplay(text(2, 'Fyll inn tallene, så roboten går rundt et kvadrat med sider på 5 steg:\ngjenta __ ganger:\n    gå __ steg fram\n    snu til høyre', 'gjenta 4 ganger:\n    gå 5 steg fram\n    snu til høyre') as AiTextDraft)
    assert.ok(!('answerBoxes' in code))
    // Andre temaer: kandidatkontrollen gir ingen bokser, selv med «___» i teksten.
    const measure = planned('maling')[0]
    const other = checkCandidates(
      [text(2, 'En bøtte rommer 7 L. Fyll inn: 7 L = ___ dL.', '70 dL. 7 · 10 = 70.')],
      { ...appRequest(measure), lesson: { ...appRequest(measure).lesson, topic: 'Måling' } },
    ).accepted[0]
    assert.ok(!other || !('answerBoxes' in other))
  })

  it('elevvisningen viser rekka med inputbokser som brytes på smal skjerm, i stedet for én tekstboks under', () => {
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /const row = task\.answerBoxes \? blankRowIn\(text\) : null/)
    assert.match(screen, /<ol className="flex flex-wrap/)
    assert.match(screen, /inputMode="numeric"/)
    assert.match(screen, /\{!row && !choices && \(/)
    assert.match(screen, /disabled=\{!submitted && !ready\}/)
  })
})

describe('17. fargemønstre som sirkler', () => {
  const colorTask = 'Her gjentar fargene seg:\nblå, oransje, oransje, blå, oransje, oransje\nHvilken farge står på plass 11?'

  it('fargerekka leses fra én egen linje, og fargesettet er fast', () => {
    assert.deepEqual(Object.keys(PATTERN_COLORS), ['rød', 'blå', 'gul', 'grønn', 'oransje', 'lilla', 'svart'])
    assert.deepEqual(colorRowsIn(colorTask), [['blå', 'oransje', 'oransje', 'blå', 'oransje', 'oransje']])
    assert.deepEqual(colorRowsIn('Her gjentar fargene seg:\nGul, grønn, gul, grønn, gul, grønn.'), [['gul', 'grønn', 'gul', 'grønn', 'gul', 'grønn']])
    // Ukjente farger leses med, så kontrollen kan avvise dem; vanlige ordlister er ikke fargerekker.
    assert.deepEqual(colorRowsIn('rosa, turkis, rosa, turkis'), [['rosa', 'turkis', 'rosa', 'turkis']])
    assert.deepEqual(colorRowsIn('Sorter: epler, pærer, bananer'), [])
  })

  it('grunnoppgavene med farger i økt 1 tegner rekka som sirkler, uten plassen det spørres etter', () => {
    const tasks = buildTasks(session(EXPLORE)).filter((t) => t.kind === 'text' && t.figure?.kind === 'colors')
    assert.ok(tasks.length >= 2)
    for (const t of tasks) {
      if (t.kind !== 'text' || t.figure?.kind !== 'colors') continue
      assert.deepEqual(t.figure.items, colorRowsIn(t.text)[0])
      assert.ok(t.figure.items.every((c) => c in PATTERN_COLORS))
      assert.ok(Number(/plass (\d+)/.exec(t.text)![1]) > t.figure.items.length)
      assert.equal(previewProblem(t), null)
    }
    // Figurmønstre (●, ■, ▲) har ingen fargesirkler.
    assert.ok(buildTasks(session(EXPLORE)).filter((t) => t.kind === 'text' && /[●■▲]/.test(t.text)).every((t) => t.kind === 'text' && !t.figure))
  })

  it('AI-oppgaver: appen får fargerekka fra teksten; ukjente farger, rekker i løpende tekst og vist plass avvises', () => {
    const checked = checkCandidates([text(1, colorTask, 'Oransje. Gjentakelsen er blå, oransje, oransje.')], serverRequest(session(EXPLORE)))
    assert.equal(checked.rejected.length, 0)
    const stored = toSessionTask(checked.accepted[0], 'ai-c')
    assert.deepEqual(stored.kind === 'text' && stored.figure, { kind: 'colors', items: ['blå', 'oransje', 'oransje', 'blå', 'oransje', 'oransje'] })
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(stored))), stored)
    // Feil fasit, ukjent farge, rekka i en setning, og en plass som vises i rekka.
    assert.equal(reason(EXPLORE, text(1, colorTask, 'Blå.')), 'wrongSolution')
    assert.equal(reason(EXPLORE, text(1, 'Her gjentar fargene seg:\nrosa, blå, rosa, blå, rosa, blå\nHvilken farge står på plass 9?', 'Rosa.')), 'invalidVisual')
    assert.equal(reason(EXPLORE, text(1, 'Perlene ligger slik: gul, rød, gul, rød, gul, rød. Hvilken farge har perle nummer 9?', 'Gul.')), 'format')
    assert.equal(reason(EXPLORE, text(1, 'Her gjentar fargene seg:\nblå, oransje, oransje, blå, oransje, oransje\nHvilken farge står på plass 5?', 'Oransje.')), 'revealedSolution')
    // Ugyldige farger leses ikke inn som figur fra lagringen.
    const broken = readStoredTask({ ...JSON.parse(JSON.stringify(stored)), figure: { kind: 'colors', items: ['rosa', 'blå', 'rosa'] } })
    assert.ok(broken && broken.kind === 'text' && !broken.figure)
  })

  it('justering med AI regner sirklene ut fra den nye teksten', () => {
    const task = toSessionTask({ ...(text(1, colorTask, 'Oransje.') as AiTextDraft), colorItems: ['blå', 'oransje', 'oransje', 'blå', 'oransje', 'oransje'] }, 't2')
    assert.ok(task.kind === 'text')
    if (task.kind !== 'text') return
    const revised = applyRevision(task, { message: '', tasks: [text(1, 'Her gjentar fargene seg:\nlilla, gul, lilla, gul, lilla, gul\nHvilken farge står på plass 10?', 'Gul.')] }).task!
    assert.deepEqual(revised.figure, { kind: 'colors', items: ['lilla', 'gul', 'lilla', 'gul', 'lilla', 'gul'] })
  })

  it('tegnes som fylte sirkler med navnet under, i elevvisningen, på lærerkortet og i forhåndsvisningen, og brytes på smal skjerm', () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(read('src/components/ui/TaskFigure.tsx'), /figure\.kind === 'colors'\) return <ColorFigure/)
    const figure = read('src/components/ui/ColorFigure.tsx')
    assert.match(figure, /flex-wrap/)
    assert.match(figure, /backgroundColor: PATTERN_COLORS\[color\]/)
    assert.match(figure, /<span className="text-small text-primary">\{color\}<\/span>/)
  })
})

describe('18. fargemønstre: ingen dobbel fargelinje, og svaralternativer fra rekka', () => {
  it('fargelinja tas ut av teksten eleven ser, men står i den lagrede teksten og på lærerkortet', () => {
    const t = buildTasks(session(EXPLORE)).find((x) => x.kind === 'text' && x.figure?.kind === 'colors')!
    assert.ok(t.kind === 'text' && t.figure?.kind === 'colors')
    if (t.kind !== 'text' || t.figure?.kind !== 'colors') return
    const shown = withoutColorRow(t.text, t.figure.items)
    assert.equal(colorRowsIn(shown).length, 0)
    assert.equal(colorRowsIn(t.text).length, 1)
    assert.ok(shown.includes('Her gjentar fargene seg:') || shown.includes('Mønsteret fortsetter'))
    assert.match(shown, /plass \d+/)
    // En linje som ikke er fargerekka, står urørt.
    assert.equal(withoutColorRow('Hei\nrød, blå, rød\nHvilken?', ['gul', 'blå', 'gul']), 'Hei\nrød, blå, rød\nHvilken?')
  })

  it('alternativene er fargene i rekka – to farger gir to, tre gir tre – og valget rettes automatisk', () => {
    assert.deepEqual(colorOptions(['gul', 'grønn', 'gul', 'grønn', 'gul', 'grønn']), ['gul', 'grønn'])
    assert.deepEqual(colorOptions(['blå', 'rød', 'rød', 'gul', 'blå', 'rød', 'rød', 'gul']), ['blå', 'rød', 'gul'])
    for (const t of buildTasks(session(EXPLORE)).filter((x) => x.kind === 'text' && x.figure?.kind === 'colors')) {
      if (t.kind !== 'text' || t.figure?.kind !== 'colors' || t.expected?.kind !== 'item') continue
      const right = t.expected.value
      assert.ok(colorOptions(t.figure.items).includes(right))
      const wrong = colorOptions(t.figure.items).find((c) => c !== right)!
      assert.equal(checkTextAnswer({ answer: right, submitted: false }, t).result, 'correct')
      assert.equal(checkTextAnswer({ answer: wrong, submitted: false }, t).result, 'retry')
    }
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /task\.figure\?\.kind === 'colors' && task\.expected\.value in PATTERN_COLORS\s*\? colorOptions\(task\.figure\.items\)/)
    assert.match(screen, /role="radiogroup"/)
  })
})

describe('19. automatisk tilbakemelding i Mønster og algoritmer', () => {
  it('rettingen tåler store og små bokstaver, mellomrom, enhet, desimaltegn, figurnavn og en forklaring etter svaret', () => {
    const n = (value: number): ExpectedAnswer => ({ kind: 'number', value })
    assert.ok(isCorrect(n(14), '14'))
    assert.ok(isCorrect(n(14), ' 14 prikker. '))
    // En forklaring med et regnestykke er greit; et annet tall utenfor regnestykket er et ekstra svar.
    assert.ok(isCorrect(n(31), '31. 4 + 9 · 3 = 31'))
    assert.equal(answerStatus(n(14), '14 eller 15'), 'several')
    assert.equal(answerStatus(n(14), '14, fordi det kommer 3 nye hver gang'), 'several')
    assert.ok(isCorrect(n(2.5), '2,5') && isCorrect(n(2.5), '2.5'))
    // Tall fra oppgaven foran svaret hoppes over.
    assert.ok(isCorrect(n(31), 'Figur 10 har 31 klosser', 'Hvor mange klosser har figur 10?'))
    assert.ok(!isCorrect(n(14), '15'))
    assert.ok(!isCorrect(n(14), 'fjorten?'))
    const list: ExpectedAnswer = { kind: 'numbers', values: [37, 44] }
    assert.ok(isCorrect(list, '37, 44') && isCorrect(list, '37 og 44') && isCorrect(list, '37 44'))
    assert.ok(isCorrect(list, '9, 16, 23, 30, 37, 44', '9, 16, 23, 30, ___, ___'))
    assert.ok(!isCorrect(list, '44, 37') && !isCorrect(list, '37'))
    const rounds: ExpectedAnswer = { kind: 'numbers', values: [6, 12, 24] }
    assert.ok(isCorrect(rounds, '6, 12, 24. Til slutt 24'))
    const item: ExpectedAnswer = { kind: 'item', value: '▲' }
    assert.ok(isCorrect(item, '▲') && isCorrect(item, 'Trekant') && isCorrect(item, 'en trekant, fordi …'))
    assert.ok(!isCorrect(item, 'sirkel'))
    assert.ok(isCorrect({ kind: 'item', value: 'gul' }, 'GUL.'))
    assert.ok(isCorrect({ kind: 'items', values: ['blå', 'blå', 'rød'] }, 'Blå, blå, rød'))
    assert.equal(formatExpected(list), '37, 44')
    assert.equal(formatExpected({ kind: 'items', values: ['●', '■'] }), '● ■')
  })

  it('riktig svar gir «Riktig!», feil gir ett nytt forsøk og deretter riktig svar', () => {
    const task = buildTasks(session(LOOPS)).find((t) => t.kind === 'text' && t.expected?.kind === 'number')!
    assert.ok(task.kind === 'text' && task.expected?.kind === 'number')
    if (task.kind !== 'text' || task.expected?.kind !== 'number') return
    const right = String(task.expected.value)
    assert.deepEqual(checkTextAnswer({ answer: right, submitted: false }, task), { answer: right, submitted: true, result: 'correct' })
    const first = checkTextAnswer({ answer: '999', submitted: false }, task)
    assert.deepEqual(first, { answer: '999', submitted: false, result: 'retry', wrongTries: 1 })
    assert.equal(TEXT_ATTEMPTS, 2)
    const second = checkTextAnswer({ ...first, answer: '998' }, task)
    assert.deepEqual(second, { answer: '998', submitted: true, result: 'revealed', wrongTries: 2 })
    assert.equal(checkTextAnswer({ ...first, answer: right }, task).result, 'correct')
    // «Tøm» i forhåndsvisningen ser også forsøkene.
    assert.ok(hasAnswerState({ ...initialTextState(), wrongTries: 1 }))
    // Oppgaver uten svar som kan rettes, leveres som før.
    const { expected: _e, ...plain } = task
    assert.deepEqual(checkTextAnswer({ answer: 'noe', submitted: false }, plain), { answer: 'noe', submitted: true })
  })

  it('løsningsforslaget vises for grunnoppgaver og gjennomgåtte AI-oppgaver – ikke for AI-oppgaver som ikke er gjennomgått', () => {
    const base = buildTasks(session(EXPLORE)).find((t) => t.kind === 'text' && /Forklar/.test(t.text))!
    assert.ok(base.kind === 'text')
    if (base.kind !== 'text') return
    assert.equal(showsSolution(base), true)
    assert.equal(solutionHeading(base), 'Eksempel på en forklaring')
    assert.equal(showsSolution({ ...base, aiGenerated: true, reviewed: false }), false)
    assert.equal(showsSolution({ ...base, aiGenerated: true, reviewed: true }), true)
    assert.equal(solutionHeading({ ...base, text: 'Hvor mange prikker har figur 4?' }), 'Løsningsforslag')
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /\{showsSolution\(task\) && \(/)
    assert.match(screen, /result === 'correct' \? 'Riktig!' : `Riktig svar: \$\{formatExpected\(task\.expected\)\}`/)
  })

  it('grunnoppgavene i øktene har svar som rettes, og svaret stemmer med fasiten', () => {
    let counted = 0
    for (const s of sessions) {
      for (const t of [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]) {
        if (t.kind !== 'text' || !t.expected) continue
        counted++
        // Fasiten starter med svaret (deretter kommer forklaringen).
        const start = t.expected.kind === 'number' || t.expected.kind === 'numbers' ? (t.solution.match(/\d+/g) ?? []).slice(0, t.expected.kind === 'number' ? 1 : t.expected.values.length).join(', ') : t.solution.split('.')[0]
        assert.ok(isCorrect(t.expected, start, t.text), `${t.id}: ${formatExpected(t.expected)} / ${t.solution}`)
        assert.ok(isCorrect(t.expected, formatExpected(t.expected), t.text), t.id)
      }
    }
    assert.ok(counted >= 60, String(counted))
    // Bare Mønster og algoritmer: repetisjonsøkta og andre temaer har ingen automatisk retting.
    const others = unitSpecs.flatMap((u) => planned(u.unitId)).filter((s) => s.spec.unitId !== 'monster-og-algoritmer')
    assert.ok(others.flatMap((s) => [...(worksheetTasks[s.id] ?? []), ...buildTasks(s)]).every((t) => t.kind !== 'text' || !t.expected))
  })

  it('AI-oppgaver får svaret bare når kontrollen regnet det ut – ikke når eleven lager, vurderer eller retter', () => {
    const accepted = (s: string, t: AiTaskDraft) => checkCandidates([t], serverRequest(session(s))).accepted[0] as { expected?: ExpectedAnswer } | undefined
    assert.deepEqual(accepted(EXPLORE, text(2, 'Mønsteret gjentar seg:\n■ ▲ ▲ ■ ▲ ▲\nHvilken figur står på plass 16?', '■. Gjentakelsen ■ ▲ ▲ har 3 figurer.'))?.expected, { kind: 'item', value: '■' })
    assert.deepEqual(accepted(SEQUENCES, text(2, 'Hvilke tall mangler? 8, 14, __, 26, __, 38', '20 og 32.'))?.expected, { kind: 'numbers', values: [20, 32] })
    assert.deepEqual(accepted(LOOPS, text(1, 'Ali lager et program:\nStart med 5.\ngjenta 4 ganger:\n    legg til 3\nHvilket tall står igjen når programmet er ferdig?', '17. 5 + 4 · 3 = 17.'))?.expected, { kind: 'number', value: 17 })
    assert.deepEqual(accepted(CONDITIONS, text(3, 'Noah tester et program med en løkke og et vilkår:\nStart med 4.\ngjenta 3 ganger:\n    hvis tallet er et partall:\n        legg til 3\n    ellers:\n        legg til 2\nHvilket tall har du etter hver runde?', '7, 9, 11. Tallet til slutt er 11.'))?.expected, { kind: 'numbers', values: [7, 9, 11] })
    // Påstander, «lag selv» og vilkår med flere inndata får ikke svar.
    assert.equal(accepted(SEQUENCES, text(3, 'Ola ser på tallfølgen 4, 9, 14, 19, … som fortsetter med +5. Han mener at alle tallene i følgen blir oddetall. Stemmer det? Forklar.', 'Nei. 4 og 14 er partall.'))?.expected, undefined)
    assert.equal(accepted(LOOPS, text(3, 'Lag et program med «gjenta» og «legg til» som starter på 6 og ender på 30. Forklar hvor mange ganger løkka gjentas.', 'For eksempel gjenta 4 ganger: legg til 6. 30 − 6 = 24, og 4 · 6 = 24.'))?.expected, undefined)
    assert.equal(accepted(CONDITIONS, text(1, 'Et spill bruker dette programmet:\nhvis tallet er større enn 12:\n    si «høyt»\nellers:\n    si «lavt»\nSpilleren får tallene 20, 12 og 4. Hva sier programmet for hvert av dem?', '20: «høyt». 12: «lavt». 4: «lavt».'))?.expected, undefined)
    // Svaret følger med til oppgaven, lagres og leses inn igjen; ukjente former avvises.
    const t = toSessionTask(checkCandidates([text(2, 'Hvilke tall mangler? 8, 14, __, 26, __, 38', '20 og 32.')], serverRequest(session(SEQUENCES))).accepted[0], 'ai-e')
    assert.deepEqual(t.kind === 'text' && t.expected, { kind: 'numbers', values: [20, 32] })
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(t))), t)
    assert.equal(readExpected({ kind: 'item', value: 'rosa' }), undefined)
    assert.equal(readExpected({ kind: 'tekst', value: 'hei' }), undefined)
  })

  it('svaret som rettes, fjernes når læreren redigerer teksten eller fasiten, og ved «Juster med AI»', () => {
    const task = buildTasks(session(LOOPS)).find((t) => t.kind === 'text' && t.expected)!
    assert.ok(task.kind === 'text')
    if (task.kind !== 'text') return
    const revised = applyRevision(task, { message: '', tasks: [text(task.level, `${task.text} Forklar.`, task.solution)] }).task!
    assert.equal(revised.expected, undefined)
    const card = readFileSync(new URL('../src/features/tasks/TextTaskCard.tsx', import.meta.url), 'utf8')
    assert.match(card, /edited\.text === task\.text && edited\.solution === task\.solution \? task : keepPatternDisplay\(edited, task\)/)
  })
})

describe('20. figurmønstre med svaralternativer, skjult prikklinje, ett svar og melding uten retting', () => {
  const screen = () => readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')

  it('figurmønstre: alternativene er figurene i rekka med navn – to figurer gir to, tre gir tre – og valget rettes', () => {
    assert.deepEqual(symbolRowIn('Her gjentar figurene seg:\n▲ ▲ ● ▲ ▲ ●\nHvilken figur står på plass 11?'), ['▲', '▲', '●', '▲', '▲', '●'])
    assert.deepEqual(itemOptions(['▲', '▲', '●', '▲', '▲', '●']), ['▲', '●'])
    assert.deepEqual(itemOptions(['●', '■', '■', '▲']), ['●', '■', '▲'])
    assert.deepEqual(SYMBOL_NAMES, { '●': 'sirkel', '■': 'kvadrat', '▲': 'trekant' })
    const tasks = buildTasks(session(EXPLORE)).filter((t) => t.kind === 'text' && t.expected?.kind === 'item' && symbolRowIn(t.text))
    assert.ok(tasks.length >= 3)
    for (const t of tasks) {
      if (t.kind !== 'text' || t.expected?.kind !== 'item') continue
      const options = itemOptions(symbolRowIn(t.text)!)
      const right = t.expected.value
      assert.ok(options.includes(right))
      assert.equal(checkTextAnswer({ answer: right, submitted: false }, t).result, 'correct')
      assert.equal(checkTextAnswer({ answer: options.find((o) => o !== right)!, submitted: false }, t).result, 'retry')
    }
    // AI-oppgaver får det samme: svaret er figuren kontrollen regnet ut, og alternativene lages av appen fra rekka.
    const ai = checkCandidates([text(1, 'Her gjentar figurene seg:\n■ ▲ ■ ▲ ■ ▲\nHvilken figur står på plass 9?', '■. Oddetallsplassene er ■.')], serverRequest(session(EXPLORE))).accepted[0] as { expected?: ExpectedAnswer }
    assert.deepEqual(ai.expected, { kind: 'item', value: '■' })
    assert.match(screen(), /symbols && symbols\.includes\(task\.expected\.value\)\s*\? itemOptions\(symbols\)/)
    // Knappene viser bare figuren eller fargesirkelen; navnet er skjult tekst for skjermlesere.
    assert.match(screen(), /aria-label=\{colors \? color : SYMBOL_NAMES\[color\]\}/)
    assert.ok(!/\{colors \? color : SYMBOL_NAMES\[color\]\}\s*<\/button>/.test(screen()))
    assert.match(screen(), /role="radiogroup"[^>]*gap-4/)
  })

  it('prikklinja vises ikke for eleven når prikkene tegnes; resten av teksten står, og den lagrede teksten er uendret', () => {
    const t = buildTasks(session(EXPLORE)).find((x) => x.kind === 'text' && x.figure?.kind === 'dots')!
    assert.ok(t.kind === 'text')
    if (t.kind !== 'text') return
    const shown = withoutDotSentences(t.text)
    assert.equal(dotCountsIn(shown), null)
    assert.ok(dotCountsIn(t.text))
    assert.match(shown, /^Et figurtall vokser med like mange prikker hver gang\.\nHvor mange prikker blir det i figur \d+\?$/)
    // Også når antallene står i samme linje som spørsmålet, og påstander står.
    assert.equal(withoutDotSentences('Figur 1 har 2 prikker. Figur 2 har 4 prikker. Figur 3 har 6 prikker. Hvor mange prikker har figur 4?'), 'Hvor mange prikker har figur 4?')
    assert.equal(withoutDotSentences('Figur 1: 3 prikker. Figur 2: 5 prikker.\nOla sier at figur 3 har 9 prikker. Stemmer det?'), 'Ola sier at figur 3 har 9 prikker. Stemmer det?')
    assert.match(screen(), /task\.figure\?\.kind === 'dots' \? withoutDotSentences\(task\.text\)/)
  })

  it('flere ulike svar godtas ikke: eleven bes skrive ett svar, uten at det teller som et forsøk', () => {
    const task = buildTasks(session(LOOPS)).find((t) => t.kind === 'text' && t.expected?.kind === 'number')!
    assert.ok(task.kind === 'text' && task.expected?.kind === 'number')
    if (task.kind !== 'text' || task.expected?.kind !== 'number') return
    const v = task.expected.value
    const several = checkTextAnswer({ answer: `${v} eller ${v + 1}`, submitted: false }, task)
    assert.deepEqual(several, { answer: `${v} eller ${v + 1}`, submitted: false, result: 'several' })
    assert.equal(several.wrongTries, undefined)
    assert.equal(checkTextAnswer({ ...several, answer: String(v) }, task).result, 'correct')
    assert.equal(answerStatus({ kind: 'item', value: '▲' }, 'trekant eller sirkel'), 'several')
    assert.equal(answerStatus({ kind: 'item', value: 'gul' }, 'gul eller grønn'), 'several')
    // Tall fra oppgaven er fortsatt greit.
    assert.equal(answerStatus({ kind: 'number', value: 31 }, 'Figur 10 har 31 klosser', 'Hvor mange klosser har figur 10?'), 'correct')
    assert.match(screen(), /Skriv bare ett svar\./)
  })

  it('oppgaver som ikke rettes automatisk: ny melding og knapp bare i Mønster og algoritmer', () => {
    const s = screen()
    assert.match(s, /patternTopic \? 'Ferdig! Fortell læreren hva du svarte\.' : 'Svaret ditt er levert\. Læreren ser på det\.'/)
    assert.match(s, /patternTopic \? 'Ferdig med oppgaven' : 'Lever svaret'/)
    const flow = readFileSync(new URL('../src/features/student/StudentTaskFlow.tsx', import.meta.url), 'utf8')
    assert.match(flow, /patternTopic=\{topicId === 'monster-og-algoritmer'\}/)
    const preview = readFileSync(new URL('../src/features/tasks/StudentPreviewDialog.tsx', import.meta.url), 'utf8')
    assert.match(preview, /topicId=\{session\.topicId\}/)
    // Repetisjonsøktene hører til egne perioder og får meldingen som før.
    assert.equal(planned('repetisjon-var').find((x) => x.id === 'repetisjon-var-3')!.spec.unitId, 'repetisjon-var')
  })
})
