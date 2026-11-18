// Regnestykke-malene i Multiplikasjon: hvilke oppgaver som får maler, og hvordan hver linje rettes ut fra figuren.
// Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTasks, planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import {
  changeLine,
  checkEquations,
  decodeLine,
  emptyLine,
  encodeLine,
  equationSpec,
  equationsReady,
  exampleLine,
  gridGroups,
  lineAt,
  lineCorrect,
  operationGiven,
  requestedLines,
  sumGroups,
  type EquationLine,
  type EquationSpec,
} from '../src/features/student/equationTemplates.ts'
import { finalResultOf, initialTextState } from '../src/features/student/studentTasks.ts'
import type { TextTask } from '../src/types/index.ts'

const text = (body: string, figure?: TextTask['figure'], extra: Partial<TextTask> = {}): TextTask => ({
  kind: 'text',
  id: 'x',
  level: 1,
  text: body,
  solution: '',
  competenceGoal: '',
  adaptation: '',
  aiGenerated: false,
  reviewed: false,
  ...(figure && { figure }),
  ...extra,
})
const TWO_BY_FOUR = { kind: 'grid' as const, rows: ['####', '####'] }
const PICTURE = 'Se på figuren. Lag to regnestykker: ett med pluss og ett med gange.'
const line = (terms: number[], operator: string, result: number): EquationLine => ({ terms: terms.map(String), operator, result: String(result) })

describe('hvilke oppgaver får regnestykke-maler', () => {
  it('«Lag to regnestykker: ett med pluss og ett med gange» med rutefigur: to linjer, lest fra figuren', () => {
    assert.deepEqual(equationSpec(text(PICTURE, TWO_BY_FOUR)), { lines: ['plus', 'times'], fixedOperators: true, groups: 2, size: 4, total: 8 })
  })

  it('«Skriv som gangestykke» med et plusstykke i teksten: én gange-linje', () => {
    assert.deepEqual(equationSpec(text('Skriv som gangestykke, og regn ut.\n3 + 3 + 3 = ___')), { lines: ['times'], fixedOperators: true, groups: 3, size: 3, total: 9 })
  })

  it('kjenner igjen hva oppgaven ber om', () => {
    assert.deepEqual(requestedLines(PICTURE), ['plus', 'times'])
    assert.deepEqual(requestedLines('Skriv som et plusstykke.'), ['plus'])
    assert.deepEqual(requestedLines('Lag et regnestykke til figuren.'), ['times'])
    assert.deepEqual(requestedLines('Hvor mange ruter er det?'), [])
  })

  it('figur som ikke kan leses, eller plusstykke med ulike ledd: vanlig skrivefelt', () => {
    assert.equal(gridGroups({ kind: 'grid', rows: ['###.', '####'] }), null)
    assert.equal(gridGroups({ kind: 'grid', rows: ['###', '####'] }), null)
    assert.equal(gridGroups({ kind: 'clock', time: '08:00' }), null)
    assert.equal(equationSpec(text(PICTURE, { kind: 'grid', rows: ['##.', '###'] })), null)
    assert.equal(sumGroups('2 + 3 = ___'), null)
    assert.equal(equationSpec(text(PICTURE)), null, 'ingen figur og ikke noe plusstykke')
  })

  it('oppgaver med eget svar som rettes automatisk, eller tallrekke med bokser, beholder det de har', () => {
    assert.equal(equationSpec(text(PICTURE, TWO_BY_FOUR, { expected: { kind: 'number', value: 8 } as TextTask['expected'] })), null)
    assert.equal(equationSpec(text(PICTURE, TWO_BY_FOUR, { answerBoxes: true })), null)
  })

  it('AI-oppgaver behandles likt: malene og fasiten lages av appen ut fra figuren og teksten', () => {
    const ai = text('Se på rutene. Skriv et plusstykke og et gangestykke som passer.', { kind: 'grid', rows: ['###', '###', '###', '###'] }, { aiGenerated: true })
    assert.deepEqual(equationSpec(ai), { lines: ['plus', 'times'], fixedOperators: true, groups: 4, size: 3, total: 12 })
  })

  it('alle oppgavene i Multiplikasjon økt 1 (arbeidsark og grunnoppgaver) får maler', () => {
    const tasks = [...(worksheetTasks['multiplikasjon-1'] ?? []), ...buildTasks(planned('multiplikasjon')[0])].filter((t) => t.kind === 'text')
    assert.ok(tasks.length >= 10)
    for (const task of tasks) assert.ok(task.kind === 'text' && equationSpec(task), task.kind === 'text' ? task.text : '')
  })
})

describe('retting av hver linje', () => {
  const spec = equationSpec(text(PICTURE, TWO_BY_FOUR)) as EquationSpec

  it('pluss: 4 + 4 = 8 og 2 + 2 + 2 + 2 = 8 er riktige; ulike ledd, feil antall eller feil sum er feil', () => {
    assert.equal(lineCorrect('plus', line([4, 4], '+', 8), spec), true)
    assert.equal(lineCorrect('plus', line([2, 2, 2, 2], '+', 8), spec), true)
    assert.equal(lineCorrect('plus', line([3, 5], '+', 8), spec), false, 'ledd ikke like')
    assert.equal(lineCorrect('plus', line([2, 2, 2], '+', 6), spec), false, 'passer ikke med figuren')
    assert.equal(lineCorrect('plus', line([4, 4], '+', 9), spec), false, 'feil sum')
    assert.equal(lineCorrect('plus', line([1, 1, 1, 1, 1, 1, 1, 1], '+', 8), spec), false, 'ledd må være en rad eller kolonne')
  })

  it('gange: 2 · 4 = 8 og 4 · 2 = 8 er riktige; 1 · 8 = 8 passer ikke med figuren', () => {
    assert.equal(lineCorrect('times', line([2, 4], '·', 8), spec), true)
    assert.equal(lineCorrect('times', line([4, 2], '·', 8), spec), true)
    assert.equal(lineCorrect('times', line([1, 8], '·', 8), spec), false)
    assert.equal(lineCorrect('times', line([2, 4], '·', 6), spec), false)
  })

  it('regnetegnet må stemme med linjen', () => {
    assert.equal(lineCorrect('plus', line([4, 4], '·', 8), spec), false)
    assert.equal(lineCorrect('times', line([2, 4], '+', 8), spec), false)
    assert.equal(lineCorrect('times', line([2, 4], '', 8), spec), false)
  })

  it('hver linje rettes for seg: ett nytt forsøk, så eksempel på riktig svar; riktig gir «Riktig!» og levert', () => {
    let state = changeLine(initialTextState(), spec, 0, line([4, 4], '+', 8))
    state = changeLine(state, spec, 1, line([2, 3], '·', 8))
    assert.equal(equationsReady(state, spec), true)
    state = checkEquations(state, spec)
    assert.deepEqual(state.partResults, [true, false])
    assert.equal(state.result, 'retry')
    assert.equal(finalResultOf(state), null)

    // Endring etter «Ikke riktig.» fjerner beskjeden; andre forsøk riktig.
    state = changeLine(state, spec, 1, line([4, 2], '·', 8))
    assert.equal(state.result, undefined)
    const correct = checkEquations(state, spec)
    assert.equal(correct.result, 'correct')
    assert.deepEqual(finalResultOf(correct), { correct: true, attempts: 2 })
    assert.match(correct.answer, /Med pluss: 4 \+ 4 = 8\nMed gange: 4 · 2 = 8/)

    // Feil igjen på andre forsøk: eksempel på riktig svar, og oppgaven er levert som feil.
    const revealed = checkEquations(changeLine(state, spec, 1, line([1, 8], '·', 8)), spec)
    assert.equal(revealed.result, 'revealed')
    assert.equal(revealed.submitted, true)
    assert.deepEqual(finalResultOf(revealed), { correct: false, attempts: 2 })
    assert.equal(exampleLine('plus', spec), '4 + 4 = 8')
    assert.equal(exampleLine('times', spec), '2 · 4 = 8')
  })

  it('ikke klar før alle bokser og regnetegnet er fylt ut', () => {
    assert.equal(equationsReady(initialTextState(), spec), false)
    const half = changeLine(initialTextState(), spec, 0, line([4, 4], '+', 8))
    assert.equal(equationsReady(half, spec), false)
  })

  it('linjene lagres og leses likt (også flere ledd), og bare tall i boksene', () => {
    const many = line([2, 2, 2, 2], '+', 8)
    assert.deepEqual(decodeLine(encodeLine(many)), many)
    assert.deepEqual(decodeLine(undefined), emptyLine())
    assert.deepEqual(decodeLine('2a,x|+|8b').terms, ['2', ''])
  })
})

describe('regnetegnet: låst når oppgaven bestemmer regnearten, valgbart ellers', () => {
  const fixed = equationSpec(text(PICTURE, TWO_BY_FOUR)) as EquationSpec
  const choose = equationSpec(text('Se på figuren. Lag et regnestykke til figuren.', TWO_BY_FOUR)) as EquationSpec

  it('1. «ett med pluss og ett med gange» og «Skriv som gangestykke» har ferdig utfylte, låste regnetegn', () => {
    assert.equal(operationGiven(PICTURE), true)
    assert.equal(fixed.fixedOperators, true)
    assert.equal(equationSpec(text('Skriv som gangestykke, og regn ut.\n3 + 3 + 3 = ___'))!.fixedOperators, true)
    // Tom linje: regnetegnet står allerede der.
    assert.equal(lineAt(initialTextState(), fixed, 0).operator, '+')
    assert.equal(lineAt(initialTextState(), fixed, 1).operator, '·')
    // Eleven kan ikke endre det: et annet tegn i linjen blir linjens eget tegn igjen.
    const state = changeLine(initialTextState(), fixed, 0, line([4, 4], '·', 8))
    assert.equal(lineAt(state, fixed, 0).operator, '+')
    // Klar når bare tallene er fylt ut – eleven velger ikke regnetegn.
    const filled = changeLine(changeLine(initialTextState(), fixed, 0, { terms: ['4', '4'], operator: '', result: '8' }), fixed, 1, { terms: ['2', '4'], operator: '', result: '8' })
    assert.equal(equationsReady(filled, fixed), true)
    assert.equal(checkEquations(filled, fixed).result, 'correct')
  })

  it('2. plusslinjen støtter flere ledd: 2 + 2 + 2 + 2 = 8 med låst pluss', () => {
    let state = changeLine(initialTextState(), fixed, 0, { terms: ['2', '2', '2', '2'], operator: '', result: '8' })
    state = changeLine(state, fixed, 1, { terms: ['4', '2'], operator: '', result: '8' })
    assert.deepEqual(lineAt(state, fixed, 0), line([2, 2, 2, 2], '+', 8))
    const checked = checkEquations(state, fixed)
    assert.deepEqual(checked.partResults, [true, true])
    assert.match(checked.answer, /Med pluss: 2 \+ 2 \+ 2 \+ 2 = 8/)
  })

  it('3. hver linje får umiddelbar og korrekt tilbakemelding', () => {
    let state = changeLine(initialTextState(), fixed, 0, { terms: ['2', '2', '2', '2'], operator: '', result: '8' })
    state = changeLine(state, fixed, 1, { terms: ['2', '3'], operator: '', result: '8' })
    const first = checkEquations(state, fixed)
    assert.deepEqual(first.partResults, [true, false])
    assert.equal(first.result, 'retry')
    const second = checkEquations(changeLine(first, fixed, 1, { terms: ['2', '4'], operator: '', result: '8' }), fixed)
    assert.deepEqual(second.partResults, [true, true])
    assert.equal(second.result, 'correct')
  })

  it('4. oppgaver der eleven skal velge regneart, beholder valgbare regnetegn', () => {
    assert.equal(operationGiven('Se på figuren. Lag et regnestykke til figuren.'), false)
    assert.equal(choose.fixedOperators, false)
    assert.equal(lineAt(initialTextState(), choose, 0).operator, '')
    // Ikke klar før regnetegnet er valgt, og feil regnetegn er feil.
    const noSign = changeLine(initialTextState(), choose, 0, { terms: ['2', '4'], operator: '', result: '8' })
    assert.equal(equationsReady(noSign, choose), false)
    const wrongSign = changeLine(initialTextState(), choose, 0, line([2, 4], '+', 8))
    assert.deepEqual(checkEquations(wrongSign, choose).partResults, [false])
    const rightSign = changeLine(initialTextState(), choose, 0, line([2, 4], '·', 8))
    assert.equal(checkEquations(rightSign, choose).result, 'correct')
  })
})
