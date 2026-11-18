// «Legg til oppgaver»: én knapp og én popup med «Lag med AI» og «Lag selv». Skjemalogikken testes direkte; oppsettet av
// komponentene sjekkes i kildekoden (Node kan ikke vise TSX). Nettleserflyten testes i e2e/addTasks.spec.ts. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { buildManualTask, emptyManualDraft, manualTaskProblem } from '../src/features/tasks/manualTask.ts'
import { readStoredTask } from '../src/features/sessions/taskStorage.ts'

const read = (file: string) => readFileSync(new URL(`../src/features/tasks/${file}`, import.meta.url), 'utf8')

describe('6. «Legg til oppgaver» åpner popupen', () => {
  it('redigeringssiden har én knapp «Legg til oppgaver» i stedet for de to gamle inngangene', () => {
    const page = read('EditTasksPage.tsx')
    assert.match(page, /Legg til oppgaver\n/)
    assert.match(page, /onClick=\{\(\) => setAdding\(true\)\}/)
    assert.match(page, /aria-haspopup="dialog"/)
    assert.match(page, /\{adding && \(\s*<AddTasksDialog/)
    // De gamle inngangene er borte: generatoren rett på siden og «+ Legg til oppgave».
    assert.doesNotMatch(page, /<AiTaskGenerator/)
    assert.doesNotMatch(page, /Legg til oppgave\n/)
    assert.doesNotMatch(read('AiTaskGenerator.tsx'), /Lag oppgaver med AI/)
  })

  it('popupen bruker den felles Modal-komponenten (Escape lukker) og har tydelige knapper', () => {
    const dialog = read('AddTasksDialog.tsx')
    assert.match(dialog, /<Modal open onClose=\{onClose\} labelledBy="legg-til-oppgaver-tittel"/)
    assert.match(dialog, /<ModalCloseButton onClick=\{onClose\} \/>/)
    assert.match(read('ManualTaskForm.tsx'), /Avbryt[\s\S]*Lagre oppgave/)
    assert.match(read('AiTaskGenerator.tsx'), /'Lukk' : 'Avbryt'/)
  })
})

describe('7. læreren kan bytte mellom «Lag med AI» og «Lag selv»', () => {
  it('to faner med WAI-ARIA-rollene og piltaster', () => {
    const dialog = read('AddTasksDialog.tsx')
    assert.match(dialog, /\{ id: 'ai', label: 'Lag med AI'/)
    assert.match(dialog, /\{ id: 'manual', label: 'Lag selv'/)
    assert.match(dialog, /role="tablist"/)
    assert.match(dialog, /role="tab"/)
    assert.match(dialog, /aria-selected=\{tab === id\}/)
    assert.match(dialog, /role="tabpanel"/)
    assert.match(dialog, /'ArrowLeft', 'ArrowRight', 'Home', 'End'/)
    assert.match(dialog, /tab === 'ai' \? \(\s*<AiTaskGenerator[\s\S]*: \(\s*<ManualTaskForm/)
  })
})

describe('8. manuell opprettelse har ikke AI-assistentfelt', () => {
  it('skjemaet «Lag selv» bruker ingen AI', () => {
    const form = read('ManualTaskForm.tsx')
    assert.doesNotMatch(form, /AiAssistant|AiReviseForm|ai\/client|requestTasks|sendChat|AI-assistent/)
    assert.doesNotMatch(read('manualTask.ts'), /ai\/client|requestTasks|sendChat/)
    // «Juster med AI» på eksisterende oppgavekort er beholdt.
    assert.match(read('TextTaskCard.tsx'), /<AiReviseForm/)
  })

  it('regnestykke: fasiten regnes ut av appen, og ugyldige tall avvises', () => {
    const draft = { ...emptyManualDraft(2), a: '7', operator: '*' as const, b: '8' }
    assert.equal(manualTaskProblem(draft), null)
    assert.deepEqual(buildManualTask(draft, 'ny-1'), { id: 'ny-1', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8, source: 'teacher' })
    assert.match(manualTaskProblem({ ...draft, a: 'sju' })!, /hele tall/)
    assert.match(manualTaskProblem({ ...draft, operator: '/', a: '7', b: '2' })!, /Delingen går ikke opp/)
    assert.match(manualTaskProblem({ ...draft, operator: '-', a: '3', b: '8' })!, /negativt/)
    assert.match(manualTaskProblem({ ...draft, instruction: ' ' })!, /oppgaveteksten/)
    assert.equal(buildManualTask({ ...draft, a: '' }, 'x'), null)
  })

  it('tekstoppgave: tekst, fasit, nivå og valgfri figur – lagres som lærerens egen oppgave', () => {
    const draft = { ...emptyManualDraft(1), kind: 'text' as const, level: 3 as const, text: ' Se på figuren. Hvor mange hjørner har figuren? ', solution: '6 hjørner', figure: 'shape' as const, shape: 'hexagon' as const }
    const task = buildManualTask(draft, 'ny-2')
    assert.deepEqual(task, {
      kind: 'text',
      id: 'ny-2',
      level: 3,
      text: 'Se på figuren. Hvor mange hjørner har figuren?',
      solution: '6 hjørner',
      competenceGoal: '',
      adaptation: '',
      aiGenerated: false,
      reviewed: false,
      source: 'teacher',
      figure: { kind: 'shape', shape: 'hexagon' },
    })
    // Den lagrede oppgaven leses inn igjen uendret.
    assert.deepEqual(readStoredTask(JSON.parse(JSON.stringify(task))), task)
    assert.match(manualTaskProblem({ ...draft, solution: '' })!, /fasit/i)
    assert.match(manualTaskProblem({ ...draft, text: '' })!, /oppgaveteksten/)
    // Vinkel: gradtallet må passe vinkeltypen.
    const angle = { ...draft, figure: 'angle' as const, angleType: 'acute' as const, degrees: '120' }
    assert.match(manualTaskProblem(angle)!, /Gradtallet passer ikke/)
    assert.deepEqual((buildManualTask({ ...angle, degrees: '30' }, 'v') as { figure: unknown }).figure, { kind: 'angle', angleType: 'acute', degrees: 30 })
    // Ingen figur: feltet mangler.
    assert.equal('figure' in (buildManualTask({ ...draft, figure: 'none' }, 'n') as object), false)
  })

  it('etter lagring legges oppgaven på nivået den hører til, uten at valgt nivå på siden endres', () => {
    const page = read('EditTasksPage.tsx')
    assert.match(page, /const addManualTask = \(task: SessionTask\) => \{/)
    assert.match(page, /saveTasks\(session\.id, next\)/)
    assert.match(page, /Oppgaven er lagt til på nivå \$\{task\.level\}/)
    const body = page.slice(page.indexOf('const addManualTask'), page.indexOf('closeAdding()', page.indexOf('const addManualTask')))
    assert.doesNotMatch(body, /setSearchParams|selectLevel|scrollTo/)
  })
})

describe('9. AI-opprettelse beholder eksisterende funksjonalitet', () => {
  it('kompetansemål, andre ønsker, nivåvalg, antall per nivå og alt-eller-ingenting', () => {
    const ai = read('AiTaskGenerator.tsx')
    for (const label of ['Kompetansemål (valgfritt)', 'Andre ønsker (valgfritt)', 'Velg nivå', 'Antall per nivå']) assert.ok(ai.includes(label), label)
    assert.match(ai, /kind: 'general'/)
    assert.match(ai, /buildLevelContexts\(session\.levels, currentTasks, profile\)/)
    assert.match(ai, /const complete = isCompletePackage\(tasks, perLevel, levels\)/)
    assert.match(ai, /if \(complete\) onAdd\(tasks\.map\(\(t\) => toSessionTask\(t, newTaskId\(session\.id\), meta\)\)\)/)
    assert.match(ai, /merket som AI-generert og ikke\s+gjennomgått/)
    // AI-oppgavene legges i utkastet (lagres med «Lagre endringer»), som før.
    assert.match(read('EditTasksPage.tsx'), /const addAiTasks = \(tasks: SessionTask\[\]\) => \{\s*update\(\[\.\.\.draft, \.\.\.tasks\]\)/)
  })
})
