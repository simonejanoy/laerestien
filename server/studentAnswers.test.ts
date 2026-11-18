// Elevvisningen: strukturerte svar, umiddelbar tilbakemelding, nye forsøk, åpne svar til læreren, og at svar og resultat
// lagres for lærerens øktvisning. Rene funksjoner og createElement-komponenter, testet i Node. Kjør: npm test
// (Nettleserflyten testes i e2e/answers.spec.ts.)

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { asksForEquations, autoAnswerOf, equationsFromSolution, numberFromSolution, parseEquation } from '../src/ai/autoAnswer.ts'
import { equationBoxCount, equationsStatus, formatExpected, readExpected, type EquationAnswer } from '../src/ai/patternDisplay.ts'
import { EquationFields, cleanNumber } from '../src/components/ui/EquationFields.ts'
import { createLocalLiveBackend } from '../src/features/live/localLiveBackend.ts'
import { MAX_ANSWER_LENGTH, classOverview, deliveryOf, newLiveSession, readProgressDoc, runIdOf, shownAnswer } from '../src/features/live/liveProgress.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { equationSpec } from '../src/features/student/equationTemplates.ts'
import {
  FEEDBACK,
  TEXT_ATTEMPTS,
  checkMathAnswer,
  checkTextAnswer,
  feedbackOf,
  finalResultOf,
  initialMathState,
  initialTextState,
  retryMathAnswer,
} from '../src/features/student/studentTasks.ts'
import type { Task, TextTask } from '../src/types/index.ts'

const text = (t: string, solution: string, extra: Partial<TextTask> = {}): TextTask => ({
  kind: 'text', id: 'x', level: 1, text: t, solution, competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false, ...extra,
})
const math: Task = { id: 'm', level: 1, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8 }
const plusAndTimes = text('Se på figuren. Lag to regnestykker: ett med pluss og ett med gange.', '4 + 4 = 8 og 2 · 4 = 8  (eller 2 + 2 + 2 + 2 = 8 og 4 · 2 = 8)', {
  figure: { kind: 'grid', rows: ['####', '####'] },
})
/** Svaret i boksene, slik TextTaskScreen lagrer det. */
const boxes = (...values: (number | string)[]) => values.join(', ')

describe('hvilke oppgaver som rettes automatisk (autoAnswerOf)', () => {
  it('regnestykker eleven skriver selv: fasiten må bare bestå av riktige regnestykker', () => {
    assert.ok(asksForEquations(plusAndTimes.text))
    assert.deepEqual(autoAnswerOf(plusAndTimes), {
      kind: 'equations',
      equations: [
        { sign: '+', operands: [4, 4], result: 8 },
        { sign: '·', operands: [2, 4], result: 8 },
      ],
    })
    assert.deepEqual(parseEquation('2 x 4 = 8'), { sign: '·', operands: [2, 4], result: 8 })
    assert.deepEqual(parseEquation('18 ÷ 3 = 6'), { sign: ':', operands: [18, 3], result: 6 })
    // Feil regnet, blandede regnetegn eller tekst i fasiten: ingen automatisk retting.
    assert.equal(parseEquation('2 · 4 = 9'), null)
    assert.equal(parseEquation('2 + 3 · 4 = 14'), null)
    assert.equal(equationsFromSolution('3 · 4 = 12 og 4 · 3 = 12. Begge gir 12 fordi rekkefølgen ikke betyr noe.'), null)
    assert.equal(autoAnswerOf(text('Skriv to gangestykker som passer til rutenettet. Forklar hvorfor begge gir samme antall.', '3 · 4 = 12 og 4 · 3 = 12')), undefined)
  })

  it('ett spørsmål med ett tall som fasit (også med enhet), ellers åpent svar', () => {
    assert.deepEqual(autoAnswerOf(text('Se på figuren. Hvor mange hjørner har figuren?', '6 hjørner', { figure: { kind: 'shape', shape: 'hexagon' } })), { kind: 'number', value: 6 })
    assert.equal(numberFromSolution('90°'), 90)
    assert.equal(numberFromSolution('Svar: 12 epler.'), 12)
    assert.equal(numberFromSolution('3 sider og 3 hjørner'), null)
    assert.equal(numberFromSolution('14:30'), null)
    // To spørsmål, forklaring, tegning eller ord som svar: åpent.
    assert.equal(autoAnswerOf(text('Hvor mange hjørner har en trekant, og hvor mange sider har den? Hvor mange har en firkant?', '3 og 4')), undefined)
    assert.equal(autoAnswerOf(text('Hvor mange sider har en sekskant? Forklar.', '6')), undefined)
    assert.equal(autoAnswerOf(text('Tegn en figur med 4 hjørner. Hvor mange sider har den?', '4')), undefined)
    assert.equal(autoAnswerOf(text('Er vinkelen spiss eller stump?', 'Spiss')), undefined)
  })

  it('oppgaver med et kort svar fra oppgavereglene beholder det', () => {
    const t = text('Hvilket tall mangler? 2, 4, ___, 8', '6', { expected: { kind: 'numbers', values: [6] } })
    assert.deepEqual(autoAnswerOf(t), { kind: 'numbers', values: [6] })
  })

  it('grunnoppgaven med pluss og gange i Multiplikasjon økt 1 rettes automatisk', () => {
    const picture = worksheetTasks['multiplikasjon-1'].find((t) => t.kind === 'text' && t.text.startsWith('Se på figuren. Lag to regnestykker'))
    assert.ok(picture?.kind === 'text')
    assert.equal(autoAnswerOf(picture!)?.kind, 'equations')
  })

  it('svaret lagres og leses som andre svar (lagring og AI-kontrakt)', () => {
    const expected = autoAnswerOf(plusAndTimes)!
    assert.deepEqual(readExpected(JSON.parse(JSON.stringify(expected))), expected)
    // Et feil regnet stykke leses ikke inn.
    assert.equal(readExpected({ kind: 'equations', equations: [{ sign: '·', operands: [2, 4], result: 9 }] }), undefined)
    assert.equal(formatExpected(expected), '4 + 4 = 8 og 2 · 4 = 8')
  })
})

describe('1. automatisk kontrollerbart svar gir riktig/feil tilbakemelding', () => {
  it('regnestykker: riktig gir «Riktig!», feil gir «Ikke helt – prøv igjen»', () => {
    const right = checkTextAnswer({ ...initialTextState(), answer: boxes(4, 4, 8, 2, 4, 8) }, plusAndTimes)
    assert.equal(right.result, 'correct')
    assert.equal(feedbackOf(right), 'Riktig!')
    const wrong = checkTextAnswer({ ...initialTextState(), answer: boxes(4, 4, 8, 2, 4, 9) }, plusAndTimes)
    assert.equal(wrong.result, 'retry')
    assert.equal(wrong.submitted, false)
    assert.equal(feedbackOf(wrong), 'Ikke helt – prøv igjen.')
  })

  it('byttede faktorer og ledd godtas (2 · 4 = 8 og 4 · 2 = 8), men ikke byttet rekkefølge i minus og deling', () => {
    const plus: EquationAnswer = { sign: '+', operands: [3, 5], result: 8 }
    const times: EquationAnswer = { sign: '·', operands: [2, 4], result: 8 }
    assert.equal(equationsStatus([plus, times], boxes(5, 3, 8, 4, 2, 8)), 'correct')
    assert.equal(equationsStatus([{ sign: '−', operands: [8, 3], result: 5 }], boxes(3, 8, 5)), 'wrong')
    assert.equal(equationsStatus([{ sign: ':', operands: [18, 3], result: 6 }], boxes(3, 18, 6)), 'wrong')
    // Radene med samme regnetegn kan komme i hvilken som helst rekkefølge.
    const divisions: EquationAnswer[] = [
      { sign: ':', operands: [18, 3], result: 6 },
      { sign: ':', operands: [18, 6], result: 3 },
    ]
    assert.equal(equationsStatus(divisions, boxes(18, 6, 3, 18, 3, 6)), 'correct')
    // To ulike stykker i fasiten må være to ulike stykker hos eleven.
    const both: EquationAnswer[] = [
      { sign: '·', operands: [3, 4], result: 12 },
      { sign: '·', operands: [4, 3], result: 12 },
    ]
    assert.equal(equationsStatus(both, boxes(3, 4, 12, 3, 4, 12)), 'wrong')
    assert.equal(equationsStatus(both, boxes(4, 3, 12, 3, 4, 12)), 'correct')
    // Tomme bokser eller tegn er aldri riktig.
    assert.equal(equationsStatus([times], boxes(2, '', 8)), 'wrong')
  })

  it('ett tall: riktig og feil', () => {
    const t = text('Se på figuren. Hvor mange hjørner har figuren?', '6 hjørner')
    assert.equal(checkTextAnswer({ ...initialTextState(), answer: '6' }, t).result, 'correct')
    assert.equal(checkTextAnswer({ ...initialTextState(), answer: '5' }, t).result, 'retry')
  })

  it('regnestykke (Task): «Riktig!» med en gang, og dialogen «Ikke helt – prøv igjen» ved feil', () => {
    const right = checkMathAnswer({ ...initialMathState(), answer: '56' }, math)
    assert.equal(feedbackOf(right), FEEDBACK.correct)
    const wrong = checkMathAnswer({ ...initialMathState(), answer: '54' }, math)
    assert.equal(wrong.dialogOpen, true)
    assert.equal(feedbackOf(wrong), FEEDBACK.retry)
    const dialog = readFileSync(new URL('../src/features/student/WrongAnswerDialog.tsx', import.meta.url), 'utf8')
    assert.match(dialog, /\{FEEDBACK\.retry\}/)
  })
})

describe('2. eleven kan prøve igjen etter feil svar', () => {
  it('tekstoppgaver: nytt forsøk etter feil, og riktig svar vises først etter siste forsøk', () => {
    let state = checkTextAnswer({ ...initialTextState(), answer: boxes(4, 4, 9, 2, 4, 8) }, plusAndTimes)
    assert.equal(state.result, 'retry')
    assert.equal(finalResultOf(state), null)
    state = checkTextAnswer({ ...state, answer: boxes(4, 4, 8, 4, 2, 8) }, plusAndTimes)
    assert.equal(state.result, 'correct')
    assert.deepEqual(finalResultOf(state), { correct: true, attempts: 2 })
    // Feil på alle forsøkene: da (og bare da) vises riktig svar.
    let wrong = initialTextState()
    for (let i = 0; i < TEXT_ATTEMPTS; i++) wrong = checkTextAnswer({ ...wrong, answer: boxes(1, 1, 2, 1, 1, 1) }, plusAndTimes)
    assert.equal(wrong.result, 'revealed')
    assert.deepEqual(finalResultOf(wrong), { correct: false, attempts: TEXT_ATTEMPTS })
  })

  it('regnestykker (Task): nytt forsøk tømmer svaret og beholder tellingen', () => {
    const wrong = checkMathAnswer({ ...initialMathState(), answer: '54' }, math)
    const retry = retryMathAnswer(wrong, false)
    assert.equal(retry.answer, '')
    assert.equal(retry.phase, 'answering')
    assert.equal(retry.attemptsLeft, 2)
    assert.equal(checkMathAnswer({ ...retry, answer: '56' }, math).phase, 'correct')
  })
})

describe('3. elevens svar og resultat lagres for lærerens øktvisning', () => {
  it('leveringen har svaret, resultatet og antall forsøk', () => {
    const right = checkMathAnswer({ ...initialMathState(), answer: '56' }, math)
    assert.deepEqual(deliveryOf(right, 10), { correct: true, attempts: 1, at: 10, answer: '56' })
    const equations = checkTextAnswer({ ...initialTextState(), answer: boxes(4, 4, 8, 4, 2, 8) }, plusAndTimes)
    assert.deepEqual(deliveryOf(equations, 11), { correct: true, attempts: 1, at: 11, answer: '4, 4, 8, 4, 2, 8' })
    // Læreren ser regnestykkene, ikke bare tallene.
    assert.equal(shownAnswer(plusAndTimes, '4, 4, 8, 4, 2, 8'), '4 + 4 = 8; 4 · 2 = 8')
    assert.equal(shownAnswer(math, '56'), '7 · 8 = 56')
    // Veldig lange svar forkortes.
    const long = checkTextAnswer({ ...initialTextState(), answer: 'a'.repeat(5000) }, text('Forklar hva en vinkel er.', 'Eksempel …'))
    assert.equal(deliveryOf(long)!.answer!.length, MAX_ANSWER_LENGTH)
  })

  it('svaret kommer fram hos læreren gjennom backenden og leses inn igjen', async () => {
    const store = new Map<string, string>()
    const backend = createLocalLiveBackend({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) })
    await backend.startLiveSession('4A', 'okt-x')
    let live = null as ReturnType<typeof newLiveSession> | null
    backend.subscribeLiveSession('4A', (l) => (live = l), () => {})
    const runId = runIdOf(live!)
    const open = checkTextAnswer({ ...initialTextState(), answer: 'En vinkel er der to linjer møtes.' }, text('Forklar hva en vinkel er.', 'Eksempel …'))
    const base = { studentId: 'uid-amalie', runId, sessionId: 'okt-x', level: 1 as const, total: 2 }
    assert.equal(await backend.saveDelivery('4A', base, 'x', deliveryOf(open, 5)!), true)
    assert.equal(await backend.saveDelivery('4A', base, 'm', deliveryOf(checkMathAnswer({ ...initialMathState(), answer: '56' }, math), 6)!), true)
    let docs: ReturnType<typeof readProgressDoc>[] = []
    backend.subscribeRunProgress('4A', runId, (d) => (docs = d), () => {})
    const [row] = classOverview([{ id: 'amalie', name: 'Amalie Berg', level: 1, uid: 'uid-amalie' }], docs.filter((d) => d !== null), runId, [], true)
    assert.deepEqual(row.delivered.x, { correct: null, attempts: 1, at: 5, answer: 'En vinkel er der to linjer møtes.' })
    assert.deepEqual(row.delivered.m, { correct: true, attempts: 1, at: 6, answer: '56' })
    assert.equal(row.summary.ungraded, 1)
    assert.equal(row.summary.correct, 1)
  })

  it('eldre leveringer uten svar leses fortsatt, og ugyldige svar ignoreres', () => {
    const doc = readProgressDoc({ studentId: 's', runId: 'r', sessionId: 'o', level: 1, total: 1, updatedAt: 1, delivered: { a: { correct: true, attempts: 1, at: 1 }, b: { correct: null, attempts: 1, at: 2, answer: 42 } } })
    assert.deepEqual(doc!.delivered, { a: { correct: true, attempts: 1, at: 1 }, b: { correct: null, attempts: 1, at: 2 } })
  })

  it('lærerens øktvisning viser svarene, og sikkerhetsreglene er uendret (bare læreren i klassen kan lese)', () => {
    const row = readFileSync(new URL('../src/features/live/StudentProgressRow.tsx', import.meta.url), 'utf8')
    assert.match(row, /Se svarene til \{student\.name\}/)
    assert.match(row, /shownAnswer\(task, d\.answer\)/)
    assert.match(row, /'Vurderes av deg'/)
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    const progress = rules.slice(rules.indexOf('match /progress/{docId}'))
    assert.match(progress, /allow read: if teacherOfClass\(classId\)/)
  })
})

describe('4. åpne svar merkes som sendt til læreren og vurderes ikke automatisk', () => {
  it('forklaringer og oppgaver uten entydig fasit leveres uten retting', () => {
    for (const t of [
      text('Forklar hvorfor 3 · 4 og 4 · 3 gir samme svar.', '12 begge ganger, fordi …'),
      text('Hva er likt, og hva er ulikt, ved et kvadrat og et rektangel?', 'Begge har fire rette vinkler …'),
      text('Tegn en trekant med en rett vinkel.', 'En trekant der …'),
    ]) {
      assert.equal(autoAnswerOf(t), undefined)
      const sent = checkTextAnswer({ ...initialTextState(), answer: 'Mitt svar' }, t)
      assert.equal(sent.submitted, true)
      assert.equal(sent.result, undefined)
      assert.equal(finalResultOf(sent), null)
      assert.equal(feedbackOf(sent), 'Svaret er sendt til læreren.')
      assert.equal(deliveryOf(sent, 1)!.correct, null)
    }
  })

  it('elevvisningen sier ærlig at svaret er sendt, og knappen heter «Send til læreren»', () => {
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /submitted && !auto && \(/)
    assert.match(screen, /\{FEEDBACK\.sent\}/)
    assert.match(screen, /auto \? 'Sjekk svaret mitt' : 'Send til læreren'/)
    // Ingen generativ AI i rettingen.
    for (const file of ['../src/ai/autoAnswer.ts', '../src/features/student/studentTasks.ts']) {
      assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /requestTasks|sendChat|gemini/i)
    }
  })
})

describe('5. strukturerte matematikkfelt viser symbolene og lar eleven skrive tall', () => {
  it('én rad per regnestykke med regnetegn og =, og en tallboks for hvert tall', () => {
    const expected = autoAnswerOf(plusAndTimes)
    assert.ok(expected?.kind === 'equations')
    const total = equationBoxCount(expected.equations)
    assert.equal(total, 6)
    const html = renderToStaticMarkup(createElement(EquationFields, { equations: expected.equations, values: ['4', '', '', '', '', ''], readOnly: false, onChange: () => {} }))
    assert.match(html, /aria-label="Regnestykkene dine"/)
    assert.match(html, /aria-label="Regnestykke 1 med pluss"/)
    assert.match(html, /aria-label="Regnestykke 2 med gange"/)
    assert.equal((html.match(/<input/g) ?? []).length, 6)
    assert.equal((html.match(/inputMode="numeric"/g) ?? []).length, 6)
    assert.match(html, />\+<\/span>/)
    assert.match(html, />·<\/span>/)
    assert.equal((html.match(/>=<\/span>/g) ?? []).length, 2)
    assert.match(html, /value="4"/)
    // Tre ledd i pluss-raden gir tre bokser før =.
    const three = renderToStaticMarkup(createElement(EquationFields, { equations: [{ sign: '+', operands: [8, 8, 8], result: 24 }], values: [], readOnly: true, onChange: () => {} }))
    assert.equal((three.match(/<input/g) ?? []).length, 4)
    assert.match(three, /readOnly=""/)
  })

  it('boksene tar bare tall (høyst seks sifre)', () => {
    assert.equal(cleanNumber('4a+'), '4')
    assert.equal(cleanNumber('12 345 678'), '123456')
    assert.equal(cleanNumber('−3'), '3')
  })

  it('elevvisningen bruker feltene for regnestykker, og én tallboks når svaret er ett tall', () => {
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /<EquationFields/)
    assert.match(screen, /<NumberInput value=\{answer\} label="Ditt svar"/)
    // Regnestykker (Task) har fortsatt tallene og regnetegnet ferdig, og ett svarfelt som bare tar sifre.
    const mathScreen = readFileSync(new URL('../src/features/student/TaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(mathScreen, /\{formatNumber\(task\.a\)\} \{operatorSymbol\(task\.operator\)\} \{formatNumber\(task\.b\)\} =/)
    assert.match(mathScreen, /cleanMathAnswer\(e\.target\.value\)/)
  })
})

describe('5. de generelle regnestykkefeltene brukes der Multiplikasjon-malene ikke passer', () => {
  it('divisjon, minus og oppgaver uten figur som kan leses: ferdige regnetegn fra fasiten', () => {
    const division = text('Skriv ett gangestykke og ett divisjonsstykke som hører sammen.', '3 · 6 = 18 og 18 : 3 = 6')
    assert.equal(equationSpec(division), null)
    assert.deepEqual(autoAnswerOf(division), {
      kind: 'equations',
      equations: [
        { sign: '·', operands: [3, 6], result: 18 },
        { sign: ':', operands: [18, 3], result: 6 },
      ],
    })
    const minus = text('Skriv et minusstykke som passer: Ola har 9 epler og spiser 4.', '9 − 4 = 5')
    assert.equal(equationSpec(minus), null)
    assert.equal(autoAnswerOf(minus)?.kind, 'equations')
  })

  it('malene går foran bare i Multiplikasjon; ellers brukes autoAnswerOf', () => {
    const screen = readFileSync(new URL('../src/features/student/TextTaskScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /const equation = equationLines \? equationSpec\(task\) : null/)
    assert.match(screen, /const expected = equation \? undefined : autoAnswerOf\(task\)/)
    assert.match(screen, /\{equations && \(\s*<EquationFields/)
    const flow = readFileSync(new URL('../src/features/student/StudentTaskFlow.tsx', import.meta.url), 'utf8')
    assert.match(flow, /equationLines=\{topicId === 'multiplikasjon'\}/)
    // Den samme figuroppgaven får malen i Multiplikasjon og de generelle feltene ellers.
    assert.ok(equationSpec(plusAndTimes))
    assert.equal(autoAnswerOf(plusAndTimes)?.kind, 'equations')
  })
})
