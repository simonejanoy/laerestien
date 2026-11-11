import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  MAX_ATTEMPTS,
  checkMathAnswer,
  cleanMathAnswer,
  hasAnswerState,
  initialMathState,
  initialTextState,
  previewProblem,
  retryMathAnswer,
  verbFor,
  type MathTaskState,
} from '../src/features/student/studentTasks.ts'
import {
  MIN_PREVIEW_SCALE,
  STUDENT_VIEW_WIDTH,
  fitScale,
  initialPreviewState,
  previewControls,
  previewReducer,
  type PreviewAction,
  type PreviewState,
} from '../src/features/tasks/studentPreviewState.ts'
import type { Task, TextTask } from '../src/types/index.ts'

// Elevvisningen for læreren: felles regler med elevvisningen, feilmeldinger for oppgaver som
// ikke kan vises riktig, og at forhåndsvisningen aldri lagrer noe.

const math = (a: number, operator: Task['operator'], b: number, extra: Partial<Task> = {}): Task => ({
  id: 'm',
  level: 1,
  type: 'Hoderegning',
  instruction: 'Regn ut.',
  a,
  operator,
  b,
  ...extra,
})

const text = (extra: Partial<TextTask> = {}): TextTask => ({
  kind: 'text',
  id: 't',
  level: 1,
  text: 'Hvor mange?',
  solution: '4',
  competenceGoal: '',
  adaptation: '',
  aiGenerated: false,
  reviewed: false,
  ...extra,
})

describe('elevvisning: felles regler', () => {
  it('hilsenen følger regneartene på nivået, som i elevvisningen', () => {
    assert.equal(verbFor([math(3, '*', 4), text()]), 'Vi ganger')
    assert.equal(verbFor([math(8, '/', 2), math(3, '*', 4)]), 'Vi deler')
    assert.equal(verbFor([math(5, '-', 2)]), 'Vi trekker fra')
    assert.equal(verbFor([math(5, '+', 2)]), 'Vi legger sammen')
    assert.equal(verbFor([text()]), 'Nå setter vi i gang')
    assert.equal(verbFor([]), 'Nå setter vi i gang')
  })
})

describe('elevvisning: oppgaver som ikke kan vises riktig', () => {
  it('vanlige regnestykker og tekstoppgaver med figur er i orden', () => {
    assert.equal(previewProblem(math(6, '*', 7)), null)
    assert.equal(previewProblem(math(56, '/', 8)), null)
    assert.equal(previewProblem(text({ figure: { kind: 'grid', rows: ['##.', '###'] } })), null)
    assert.equal(previewProblem(text({ figure: { kind: 'clock', time: '09:45' } })), null)
  })

  it('regnestykker eleven ikke kan svare riktig på, gir en forklaring', () => {
    assert.match(previewProblem(math(7, '/', 2)) ?? '', /Delingen går ikke opp \(7 : 2\)/)
    assert.match(previewProblem(math(2, '-', 5)) ?? '', /negativt/)
    assert.match(previewProblem(math(1000, '*', 1000)) ?? '', /flere enn 6 sifre/)
    assert.match(previewProblem(math(1.5, '+', 1)) ?? '', /ikke et helt tall/)
    assert.match(previewProblem(math(2, '+', 2, { instruction: ' ' })) ?? '', /Instruksjonen er tom/)
  })

  it('tomme tekstoppgaver og figurer som ikke kan tegnes, gir en forklaring', () => {
    assert.match(previewProblem(text({ text: '  ' })) ?? '', /Oppgaveteksten er tom/)
    assert.match(previewProblem(text({ figure: { kind: 'grid', rows: ['...'] } })) ?? '', /Rutefiguren er tom/)
    assert.match(previewProblem(text({ figure: { kind: 'clock', time: 'kvart over' } })) ?? '', /kan ikke vises på klokka/)
    const unknown = { kind: 'tallinje' } as unknown as TextTask['figure']
    assert.match(previewProblem(text({ figure: unknown })) ?? '', /format elevvisningen ikke kan vise/)
  })
})

describe('elevvisning: ingenting lagres', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  /** Koden uten kommentarer (kommentarene forklarer nettopp at ingenting lagres). */
  const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const isolated = [
    'src/features/tasks/StudentPreviewDialog.tsx',
    'src/features/student/StudentTaskFlow.tsx',
    'src/features/student/TaskScreen.tsx',
    'src/features/student/TextTaskScreen.tsx',
    'src/features/student/studentTasks.ts',
    'src/features/student/useTaskState.ts',
    'src/features/tasks/studentPreviewState.ts',
  ]

  it('forhåndsvisningen og oppgaveskjermene bruker ikke lagring, Firebase eller økta', () => {
    for (const path of isolated) {
      const source = code(path)
      for (const forbidden of ['localStorage', 'sessionStorage', 'firebase', 'firestore', 'useSessions', 'saveTasks', 'liveSession', 'useAuth']) {
        assert.ok(!source.includes(forbidden), `${path} bruker ${forbidden}`)
      }
    }
  })

  it('elevens lagrede framdrift ligger bare i elevvisningen, ikke i den felles flyten', () => {
    assert.match(read('src/features/student/StudentHomePage.tsx'), /<StudentTaskFlow /)
    assert.match(read('src/features/tasks/StudentPreviewDialog.tsx'), /<StudentTaskFlow\s/)
    assert.ok(code('src/features/student/StudentHomePage.tsx').includes('localStorage'))
  })

  it('den virkelige elevflyten er uendret: egen tilstand i skjermene og lagret framdrift', () => {
    const home = code('src/features/student/StudentHomePage.tsx')
    // Eleven sender ikke forhåndsvisningstilstand – hver oppgaveskjerm holder sin egen.
    // Temaet sendes med (Mønster og algoritmer har egen melding for tekstsvar), men ingen forhåndsvisningstilstand.
    assert.match(home, /<StudentTaskFlow tasks=\{tasks\} index=\{index\} onNext=\{\(\) => setIndex\(index \+ 1\)\} topicId=\{session\.topicId\} \/>/)
    assert.ok(!home.includes('preview'))
    assert.match(home, /useSavedIndex\(/)
    // Uten `controlled` brukes skjermens egen useState.
    assert.match(code('src/features/student/useTaskState.ts'), /const state = controlled \? controlled\.state : own/)
  })

  it('forhåndsvisningen starter tom hver gang: egen tilstand som forsvinner når popupen lukkes', () => {
    assert.match(code('src/features/tasks/EditTasksPage.tsx'), /\{previewOpen && <StudentPreviewDialog /)
    assert.match(code('src/features/tasks/StudentPreviewDialog.tsx'), /useReducer\(previewReducer, undefined, initialPreviewState\)/)
  })

  it('ingen globale hurtigtaster på piltastene (de brukes i svarfeltene)', () => {
    const source = code('src/features/tasks/StudentPreviewDialog.tsx')
    assert.ok(!/Arrow(Left|Right)/.test(source))
    assert.ok(!source.includes('addEventListener'))
  })
})

// ---------------------------------------------------------------------------------------------

const run = (actions: PreviewAction[], from: PreviewState = initialPreviewState()) => actions.reduce(previewReducer, from)
const ids = ['a', 'b', 'c']
const typed = (answer: string): MathTaskState => ({ ...initialMathState(), answer })

describe('elevvisning: navigering med chevrons', () => {
  it('fram uten å svare, og tilbake', () => {
    const forward = run([{ type: 'next', total: 3 }, { type: 'next', total: 3 }])
    assert.equal(forward.index, 2)
    assert.deepEqual(forward.answers, {})
    assert.equal(run([{ type: 'previous' }], forward).index, 1)
  })

  it('grensene: venstre av på første, høyre av på siste', () => {
    const first = initialPreviewState()
    assert.deepEqual(
      [previewControls(first, ids).canGoBack, previewControls(first, ids).canGoForward],
      [false, true],
    )
    assert.equal(run([{ type: 'previous' }]).index, 0)
    const last = run([{ type: 'next', total: 3 }, { type: 'next', total: 3 }])
    assert.deepEqual([previewControls(last, ids).canGoBack, previewControls(last, ids).canGoForward], [true, false])
  })

  it('elevens «Ferdig» går til avslutningen, og venstre chevron tilbake til siste oppgave', () => {
    const done = run([{ type: 'next', total: 3 }, { type: 'next', total: 3 }, { type: 'next', total: 3 }])
    assert.equal(done.index, 3)
    assert.equal(run([{ type: 'next', total: 3 }], done).index, 3, 'ikke forbi avslutningen')
    const controls = previewControls(done, ids)
    assert.deepEqual([controls.canGoBack, controls.canGoForward, controls.canClear, controls.currentTaskId], [true, false, false, undefined])
    assert.equal(run([{ type: 'previous' }], done).index, 2)
  })

  it('uten oppgaver: ingen navigering', () => {
    assert.equal(run([{ type: 'next', total: 0 }]).index, 0)
    assert.deepEqual(previewControls(initialPreviewState(), []), { canGoBack: false, canGoForward: false, canClear: false, currentTaskId: undefined })
  })
})

describe('elevvisning: svar beholdes per oppgave', () => {
  it('svar på hver oppgave beholdes ved fram- og tilbakenavigering', () => {
    const wrong = checkMathAnswer(typed('9'), { id: 'b', level: 1, type: 'Hoderegning', instruction: '', a: 2, operator: '+', b: 2 })
    const state = run([
      { type: 'answer', taskId: 'a', state: typed('12') },
      { type: 'next', total: 3 },
      { type: 'answer', taskId: 'b', state: retryMathAnswer(wrong, true) },
      { type: 'next', total: 3 },
      { type: 'answer', taskId: 'c', state: { answer: 'Fordi 3 + 3 = 6', submitted: true } },
      { type: 'previous' },
      { type: 'previous' },
    ])
    assert.equal(state.index, 0)
    assert.deepEqual(state.answers.a, typed('12'))
    assert.deepEqual(state.answers.b, { ...initialMathState(), attemptsLeft: MAX_ATTEMPTS - 1, showHint: true })
    assert.deepEqual(state.answers.c, { answer: 'Fordi 3 + 3 = 6', submitted: true })
  })

  it('knyttet til oppgavens ID, ikke plassen i lista', () => {
    const state = run([{ type: 'answer', taskId: 'b', state: typed('7') }])
    // Samme oppgave på en annen plass (f.eks. etter at en oppgave foran er slettet) har fortsatt svaret.
    assert.equal(previewControls({ ...state, index: 0 }, ['b', 'c']).canClear, true)
    assert.equal(previewControls({ ...state, index: 1 }, ['a', 'b', 'c']).canClear, true)
    assert.equal(previewControls({ ...state, index: 1 }, ['a', 'c']).canClear, false)
  })

  it('«Tøm svar» nullstiller bare oppgaven læreren står på', () => {
    const answered = run([
      { type: 'answer', taskId: 'a', state: { ...typed('5'), phase: 'correct' } },
      { type: 'answer', taskId: 'b', state: { ...initialMathState(), attemptsLeft: 0, phase: 'revealed', showHint: true } },
      { type: 'next', total: 3 },
    ])
    const cleared = run([{ type: 'clear', taskId: 'b' }], answered)
    assert.equal(cleared.answers.b, undefined, 'tilbake til starttilstand: tomt svar, alle forsøk, uten hint og fasit')
    assert.deepEqual(cleared.answers.a, answered.answers.a)
    assert.equal(cleared.index, 1)
    assert.equal(previewControls(cleared, ids).canClear, false)
  })

  it('«Start på nytt» nullstiller alle oppgaver og går til første', () => {
    const answered = run([
      { type: 'answer', taskId: 'a', state: typed('5') },
      { type: 'answer', taskId: 'c', state: { answer: 'x', submitted: true } },
      { type: 'next', total: 3 },
      { type: 'next', total: 3 },
    ])
    const restarted = run([{ type: 'restart' }], answered)
    assert.deepEqual([restarted.index, restarted.answers], [0, {}])
    assert.equal(restarted.round, answered.round + 1, 'alt i visningen tegnes på nytt')
  })

  it('ny åpning gir tom tilstand (ingenting deles mellom åpninger)', () => {
    const first = initialPreviewState()
    run([{ type: 'answer', taskId: 'a', state: typed('5') }], first)
    assert.deepEqual(initialPreviewState(), { index: 0, answers: {}, round: 0 })
    assert.deepEqual(first.answers, {}, 'reduceren endrer ikke den gamle tilstanden')
  })

  it('«Tøm svar» er bare aktiv når oppgaven er påbegynt', () => {
    assert.equal(hasAnswerState(undefined), false)
    assert.equal(hasAnswerState(initialMathState()), false)
    assert.equal(hasAnswerState(initialTextState()), false)
    assert.equal(hasAnswerState(typed('3')), true)
    assert.equal(hasAnswerState({ ...initialMathState(), showHint: true }), true)
    assert.equal(hasAnswerState({ answer: '', submitted: true }), true)
  })
})

describe('elevvisning: samme svarlogikk som eleven', () => {
  const task = { id: 'm', level: 1 as const, type: 'Hoderegning' as const, instruction: 'Regn ut.', a: 6, operator: '*' as const, b: 7 }

  it('riktig svar markeres riktig', () => {
    assert.equal(checkMathAnswer(typed('42'), task).phase, 'correct')
  })

  it('feil svar gir «prøv igjen» til forsøkene er brukt opp, så vises svaret', () => {
    const first = checkMathAnswer(typed('40'), task)
    assert.deepEqual([first.phase, first.attemptsLeft, first.dialogOpen], ['answering', 2, true])
    const second = checkMathAnswer({ ...retryMathAnswer(first, false), answer: '41' }, task)
    assert.deepEqual([second.attemptsLeft, second.dialogOpen], [1, true])
    const third = checkMathAnswer({ ...retryMathAnswer(second, true), answer: '43' }, task)
    assert.deepEqual([third.phase, third.attemptsLeft], ['revealed', 0])
  })

  it('nytt forsøk tømmer svaret, og hint blir stående når det er åpnet', () => {
    const withHint = retryMathAnswer({ ...typed('40'), dialogOpen: true }, true)
    assert.deepEqual([withHint.answer, withHint.dialogOpen, withHint.showHint], ['', false, true])
    assert.equal(retryMathAnswer({ ...withHint, dialogOpen: true }, false).showHint, true)
  })

  it('svarfeltet tar bare sifre, høyst seks', () => {
    assert.equal(cleanMathAnswer('12a3-4567'), '123456')
  })
})

describe('elevvisning: tilpasset skjermen', () => {
  it('aldri større enn hos eleven', () => {
    assert.equal(fitScale(2000, 1400, 700), 1)
  })

  it('krymper så oppgaven får plass i høyden og bredden', () => {
    assert.equal(fitScale(1190, 650, 733), 0.88)
    assert.equal(fitScale(STUDENT_VIEW_WIDTH * 0.9, 2000, 500), 0.9)
  })

  it('aldri så liten at teksten blir vanskelig å lese – da ruller visningen i stedet', () => {
    assert.equal(fitScale(1190, 650, 2000), MIN_PREVIEW_SCALE)
  })

  it('før popupen er målt: full størrelse', () => {
    assert.equal(fitScale(0, 0, 0), 1)
  })
})
