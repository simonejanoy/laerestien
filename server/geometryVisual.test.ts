// Tester for figurer i geometrioppgaver: SVG-figurene programmet tegner selv (2D-figurer og vinkler),
// at de vises i lærerens oppgavekort, lærerens elevvisning og elevvisningen, AI-feltet «figur»,
// kvalitetskontrollen, grunnoppgavene, lagringen og at andre tema er uendret.
// Ingen ekte Gemini-kall og ingen nettleser. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { aiConfig } from '../src/ai/config.ts'
import { DEFAULT_ANGLE_DEGREES, SHAPE_KINDS, parseTaskResult, readVisual, type AiLevel, type AiTaskDraft, type AiVisual, type ShapeKind, type TaskRequest } from '../src/ai/contract.ts'
import { toSessionTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { GeometryFigure, angleRays } from '../src/components/ui/GeometryFigure.ts'
import { parseTaskSets, serializeTaskSets } from '../src/features/sessions/taskStorage.ts'
import { buildTasks, levelsFor, mergeTasks, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { previewProblem } from '../src/features/student/studentTasks.ts'
import type { SessionTask, TextTask } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import { taskSchema } from './taskSchema.ts'
import { checkCandidates } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'
import { visualProblem } from './visualChecks.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const svg = (figure: AiVisual, size?: 'sm' | 'md') => renderToStaticMarkup(createElement(GeometryFigure, { figure, size }))
const count = (markup: string, needle: string) => markup.split(needle).length - 1

const sessions = planned('geometri')
const session = (id: string) => sessions.find((s) => s.id === id)!

function appRequest(s: Planned, wishes = '', perLevel = 2, tasks: SessionTask[] = buildTasks(s)): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: s.spec.topic, sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(s, 5, 6), tasks, s.profile),
    profile: toAiProfile(s.profile!),
  }
}

function serverRequest(s: Planned, wishes = '') {
  const request = appRequest(s, wishes)
  const { area, secondaryAreas, divisionType } = s.profile!
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: area!, secondaryAreas, divisionType, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

const text = (level: AiLevel, studentText: string, solution: string, figure?: AiVisual): AiTaskDraft => ({
  level,
  studentText,
  solution,
  competenceGoal: '',
  adaptation: '',
  ...(figure && { figure }),
})
const shape = (s: ShapeKind): AiVisual => ({ kind: 'shape', shape: s })
const angle = (angleType: 'acute' | 'right' | 'obtuse', degrees?: number): AiVisual => ({ kind: 'angle', angleType, ...(degrees !== undefined && { degrees }) })
/** Årsaken hele kandidatkontrollen gir, eller null når oppgaven godtas. */
const reason = (id: string, task: AiTaskDraft, wishes = '') => checkCandidates([task], serverRequest(session(id), wishes)).rejected[0]?.reason ?? null

type Raw = Record<string, unknown>
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string, figur?: Raw): Raw => ({
  nivaa,
  format: 'tekst',
  oppgavetekst,
  fasit,
  kompetansemaal: '',
  tilpasning: 'Nivå med støtte.',
  ...(figur && { figur }),
})

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const prompts: string[] = []
  const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-fig', newSeed: () => 2 })
  return { handler, logs, prompts, calls: () => calls }
}

describe('1–3. SVG-figurene programmet tegner', () => {
  it('1. alle åtte 2D-figurene tegnes som synlig SVG med tilgjengelig navn', () => {
    const corners = { triangle: 3, square: 4, rectangle: 4, quadrilateral: 4, pentagon: 5, hexagon: 6, octagon: 8, circle: 0 } as const
    const names = { triangle: 'Trekant', square: 'Kvadrat', rectangle: 'Rektangel', quadrilateral: 'Firkant', pentagon: 'Femkant', hexagon: 'Sekskant', octagon: 'Åttekant', circle: 'Sirkel' }
    assert.deepEqual([...SHAPE_KINDS].sort(), Object.keys(corners).sort())
    for (const kind of SHAPE_KINDS) {
      const markup = svg(shape(kind))
      assert.match(markup, /^<svg[^>]*role="img"/, kind)
      assert.match(markup, new RegExp(`aria-label="${names[kind]}"`), kind)
      assert.match(markup, new RegExp(`<title>${names[kind]}</title>`), kind)
      assert.ok(markup.includes(`data-shape="${kind}"`), kind)
      // Synlig omriss (ikke bare tekst), og ett markert hjørne per hjørne.
      assert.ok(/<(polygon|circle)[^>]*data-part="outline"/.test(markup), kind)
      assert.equal(count(markup, 'data-part="corner"'), corners[kind], kind)
      // Formen kommer fra strek og omriss, ikke farge alene.
      assert.ok(markup.includes('stroke="currentColor"'), kind)
    }
  })

  it('kvadrat og rektangel er synlig forskjellige, og den generelle firkanten har ingen rette vinkler eller like sider', () => {
    const points = (kind: 'square' | 'rectangle' | 'quadrilateral') =>
      /points="([^"]+)"/
        .exec(svg(shape(kind)))![1]
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number) as [number, number])
    const sides = (pts: [number, number][]) => pts.map((p, i) => Math.hypot(pts[(i + 1) % 4][0] - p[0], pts[(i + 1) % 4][1] - p[1]))
    const sq = sides(points('square'))
    const re = sides(points('rectangle'))
    assert.ok(sq.every((s) => Math.abs(s - sq[0]) < 0.01), 'kvadratet har like sider')
    assert.ok(Math.max(...re) / Math.min(...re) > 1.4, 'rektangelet er tydelig lengre enn det er bredt')
    const q = points('quadrilateral')
    const qs = sides(q)
    assert.ok(new Set(qs.map((s) => s.toFixed(1))).size === 4, 'ingen like lange sider')
    for (let i = 0; i < 4; i++) {
      const [a, b, c] = [q[(i + 3) % 4], q[i], q[(i + 1) % 4]]
      const dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])
      const cos = dot / (Math.hypot(a[0] - b[0], a[1] - b[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]))
      assert.ok(Math.abs(cos) > 0.1, `hjørne ${i} er ikke rett`)
    }
  })

  it('2. spiss, rett og stump vinkel tegnes med to stråler, en vinkelbue og riktig gradtall', () => {
    for (const [type, degrees] of [['acute', 35], ['right', 90], ['obtuse', 140], ['acute', undefined], ['obtuse', undefined]] as const) {
      const markup = svg(angle(type, degrees))
      const expected = degrees ?? DEFAULT_ANGLE_DEGREES[type]
      assert.equal(count(markup, 'data-part="ray"'), 2, type)
      assert.equal(count(markup, 'data-part="angle-arc"'), 1, type)
      assert.ok(markup.includes(`data-angle-type="${type}"`) && markup.includes(`data-degrees="${expected}"`))
      assert.match(markup, /role="img"/)
      // Strålene står faktisk i riktig vinkel.
      const { vertex, ray1, ray2 } = angleRays(expected)
      const measured = Math.round(
        (Math.acos(
          ((ray1.x - vertex.x) * (ray2.x - vertex.x) + (ray1.y - vertex.y) * (ray2.y - vertex.y)) /
            (Math.hypot(ray1.x - vertex.x, ray1.y - vertex.y) * Math.hypot(ray2.x - vertex.x, ray2.y - vertex.y)),
        ) *
          180) /
          Math.PI,
      )
      assert.equal(measured, expected, type)
    }
    assert.deepEqual(DEFAULT_ANGLE_DEGREES, { acute: 45, right: 90, obtuse: 120 })
    assert.match(svg(angle('acute', 30)), /aria-label="Spiss vinkel"/)
    assert.match(svg(angle('obtuse')), /aria-label="Stump vinkel"/)
  })

  it('3. rett vinkel har rettvinkelsymbol – spiss og stump har det ikke', () => {
    assert.equal(count(svg(angle('right')), 'data-part="right-angle-marker"'), 1)
    assert.equal(count(svg(angle('acute')), 'data-part="right-angle-marker"'), 0)
    assert.equal(count(svg(angle('obtuse')), 'data-part="right-angle-marker"'), 0)
    assert.match(svg(angle('right')), /aria-label="Rett vinkel"/)
  })

  it('figuren skalerer med plassen (viewBox og max-w-full) og har en mindre størrelse i lærerens kort', () => {
    const md = svg(shape('pentagon'))
    const sm = svg(shape('pentagon'), 'sm')
    assert.match(md, /viewBox="0 0 \d+ \d+"/)
    assert.match(md, /class="[^"]*max-w-full[^"]*h-auto/)
    assert.ok(Number(/width="(\d+)"/.exec(sm)![1]) < Number(/width="(\d+)"/.exec(md)![1]))
  })
})

describe('4–7. figuren vises i alle tre visningene – med samme komponent', () => {
  it('TaskFigure sender 2D-figurer og vinkler til GeometryFigure (én tegneløsning)', () => {
    const taskFigure = source('../src/components/ui/TaskFigure.tsx')
    assert.ok(taskFigure.includes("import { GeometryFigure } from './GeometryFigure.ts'"))
    assert.match(taskFigure, /figure\.kind === 'shape' \|\| figure\.kind === 'angle'/)
  })

  it('4. lærerens oppgavekort viser figuren', () => {
    assert.match(source('../src/features/tasks/TextTaskCard.tsx'), /\{task\.figure && <TaskFigure figure=\{task\.figure\} size="sm" \/>\}/)
  })

  it('5–6. elevvisningen viser figuren, og lærerens elevvisning bruker den samme elevvisningen', () => {
    assert.match(source('../src/features/student/TextTaskScreen.tsx'), /\{task\.figure && <TaskFigure figure=\{task\.figure\} \/>\}/)
    assert.match(source('../src/features/student/StudentTaskFlow.tsx'), /<TextTaskScreen/)
    assert.match(source('../src/features/tasks/StudentPreviewDialog.tsx'), /<StudentTaskFlow/)
  })

  it('7. en vanlig oppgave uten figur vises som før – og får ingen feilmelding i forhåndsvisningen', () => {
    const plain: TextTask = { kind: 'text', id: 't', level: 1, text: 'Hvor mange sider har en trekant?', solution: '3 sider', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
    assert.equal(previewProblem(plain), null)
    assert.equal(previewProblem({ ...plain, figure: shape('triangle') }), null)
    assert.equal(previewProblem({ ...plain, figure: angle('right') }), null)
    assert.match(previewProblem({ ...plain, figure: { kind: 'angle' as const, angleType: 'acute' as const, degrees: 120 } }) ?? '', /vinkel/i)
  })
})

describe('AI-kontrakten: feltet «figur»', () => {
  it('skjemaet tilbyr bare de støttede figurene og vinklene', () => {
    const items = (taskSchema.properties!.oppgaver as { items: { properties: Record<string, { properties?: Record<string, { enum?: string[] }> }> } }).items
    const figur = items.properties.figur.properties!
    assert.deepEqual(figur.type.enum, ['ingen', 'figur', 'vinkel'])
    assert.deepEqual(figur.form.enum, ['trekant', 'kvadrat', 'rektangel', 'firkant', 'femkant', 'sekskant', 'åttekant', 'sirkel'])
    assert.deepEqual(figur.vinkeltype.enum, ['spiss', 'rett', 'stump'])
  })

  it('leser figur og vinkel fra AI-svaret, og «ingen» gir ingen figur', () => {
    const result = parseTaskResult({
      oppgaver: [
        story(1, 'Hvor mange sider har figuren?', '5 sider', { type: 'figur', form: 'femkant' }),
        story(1, 'Hva slags vinkel er dette?', 'Rett vinkel', { type: 'vinkel', vinkeltype: 'rett', grader: 90 }),
        story(1, 'Hva slags vinkel er dette?', 'Stump vinkel', { type: 'vinkel', vinkeltype: 'stump' }),
        story(1, 'Hvor mange sider har en trekant?', '3 sider', { type: 'ingen' }),
      ],
    })!
    assert.deepEqual(
      result.tasks.map((t) => ('figure' in t ? t.figure : undefined)),
      [shape('pentagon'), angle('right', 90), angle('obtuse'), undefined],
    )
  })

  it('10. vinkeltype og grader må passe sammen', () => {
    assert.deepEqual(readVisual({ type: 'vinkel', vinkeltype: 'spiss', grader: 30 }), { visual: angle('acute', 30) })
    for (const [vinkeltype, grader] of [['spiss', 90], ['spiss', 0], ['rett', 89], ['stump', 90], ['stump', 180], ['stump', 200], ['spiss', 12.5]] as const) {
      assert.deepEqual(readVisual({ type: 'vinkel', vinkeltype, grader }), { invalid: true }, `${vinkeltype} ${grader}`)
    }
  })

  it('9. en ukjent figurtype gir en ugyldig figur – ikke en stille oppgave uten figur', () => {
    assert.deepEqual(readVisual({ type: 'figur', form: 'kube' }), { invalid: true })
    assert.deepEqual(readVisual({ type: 'figur', form: 'stjerne' }), { invalid: true })
    assert.deepEqual(readVisual({ type: 'bilde' }), { invalid: true })
    assert.deepEqual(readVisual(undefined), {})
    const parsed = parseTaskResult({ oppgaver: [story(1, 'Hvor mange flater har figuren?', '6 flater', { type: 'figur', form: 'kube' })] })!
    assert.equal(parsed.tasks.length, 1)
    assert.equal(reason('geometri-1', parsed.tasks[0]), 'invalidVisual')
  })
})

describe('8–12. kvalitetskontrollen for figurer', () => {
  it('8. en oppgave som viser til en figur uten figur avvises', () => {
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange hjørner har den?', '5 hjørner')), 'missingFigure')
    assert.equal(reason('geometri-5', text(1, 'Vinkelen på figuren nedenfor er 40°. Er den spiss, rett eller stump?', 'Spiss')), 'missingFigure')
    // Med figur er den samme formuleringen i orden.
    assert.equal(reason('geometri-1', text(1, 'Se på figuren. Hvor mange hjørner har den?', '5 hjørner', shape('pentagon'))), null)
  })

  it('11. fasit som motsier figuren – feil antall sider, hjørner, rette vinkler eller feil navn – avvises', () => {
    assert.equal(visualProblem(text(1, 'Hvor mange sider og hjørner har figuren?', '6 sider og 6 hjørner', shape('pentagon')), { area: 'todimensjonale-figurer' }), 'visualMismatch')
    assert.equal(visualProblem(text(1, 'Hvor mange hjørner har figuren?', '4 hjørner', shape('triangle')), { area: 'todimensjonale-figurer' }), 'visualMismatch')
    assert.equal(visualProblem(text(1, 'Hva heter figuren?', 'Sekskant', shape('octagon')), { area: 'todimensjonale-figurer' }), 'visualMismatch')
    assert.equal(visualProblem(text(1, 'Hvor mange hjørner har figuren?', 'Figuren har 4 hjørner.', shape('circle')), { area: 'todimensjonale-figurer' }), 'visualMismatch')
    assert.equal(visualProblem(text(2, 'Hvor mange rette vinkler har firkanten på figuren?', '4 rette vinkler', shape('quadrilateral')), { area: 'todimensjonale-figurer' }), 'visualMismatch')
    assert.equal(visualProblem(text(1, 'Se på figuren. Hvilken type vinkel er dette?', 'Stump vinkel', angle('acute', 40)), { area: 'vinkler' }), 'visualMismatch')
    assert.equal(visualProblem(text(1, 'Vinkelen på figuren er 30°. Er den spiss, rett eller stump?', 'Spiss', angle('acute', 60)), { area: 'vinkler' }), 'visualMismatch')
    // Riktig fasit godtas.
    for (const [task, area] of [
      [text(1, 'Hvor mange sider og hjørner har figuren?', '5 sider og 5 hjørner', shape('pentagon')), 'todimensjonale-figurer'],
      [text(1, 'Hva heter figuren?', 'Åttekant', shape('octagon')), 'todimensjonale-figurer'],
      [text(1, 'Hva heter figuren?', 'Kvadrat', shape('square')), 'todimensjonale-figurer'],
      [text(1, 'Hvor mange hjørner har figuren?', 'Ingen. En sirkel har ingen hjørner.', shape('circle')), 'todimensjonale-figurer'],
      [text(2, 'Hvor mange rette vinkler har rektangelet på figuren?', '4 rette vinkler', shape('rectangle')), 'todimensjonale-figurer'],
      [text(1, 'Vinkelen på figuren er 30°. Er den spiss, rett eller stump?', 'Spiss vinkel', angle('acute', 30)), 'vinkler'],
      [text(1, 'Se på figuren. Hvilken type vinkel er dette?', 'Rett vinkel', angle('right')), 'vinkler'],
    ] as const) {
      assert.equal(visualProblem(task, { area }), null, (task as { studentText: string }).studentText)
    }
  })

  it('12. en digital oppgave som ber eleven tegne, avvises', () => {
    assert.equal(reason('geometri-1', text(1, 'Tegn en femkant. Hvor mange hjørner har figuren din?', '5 hjørner')), 'drawingTask')
    assert.equal(reason('geometri-5', text(1, 'Tegn en stump vinkel og skriv navnet ved den.', 'En vinkel mellom 90° og 180°.')), 'drawingTask')
    assert.equal(reason('geometri-4', text(3, 'Tegn et nett til en kube.', '6 kvadrater')), 'drawingTask')
  })

  it('figurer i feil tema eller i et område uten figurer avvises – og 3D-figurer finnes ikke', () => {
    assert.equal(reason('geometri-3', text(1, 'Se på figuren. Hvor mange sider har den?', '4 sider', shape('square'))), 'irrelevantVisual')
    assert.equal(reason('geometri-5', text(1, 'Hvor mange sider har figuren?', '3 sider', shape('triangle'))), 'irrelevantVisual')
    assert.equal(reason('geometri-1', text(1, 'Hva slags vinkel er dette?', 'Rett vinkel', angle('right'))), 'irrelevantVisual')
    const division = planned('divisjon').find((s) => s.id === 'divisjon-3')!
    assert.equal(checkCandidates([text(1, '12 kort fordeles likt mellom 3 barn. Hvor mange kort får hvert barn?', '4 kort', shape('triangle'))], serverRequest(division)).rejected[0]?.reason, 'irrelevantVisual')
  })
})

describe('grunnoppgavene i Geometri', () => {
  it('ingen grunnoppgaver i geometriøktene ber eleven tegne', () => {
    for (const s of sessions) for (const t of buildTasks(s)) if (t.kind === 'text') assert.ok(!/\btegn/i.test(t.text), `${s.id}: ${t.text}`)
  })

  it('tegneoppgavene er gjort om til oppgaver med figur, og alle figurene passer oppgaven og fasiten', () => {
    const withFigure = sessions.flatMap((s) => buildTasks(s).filter((t): t is TextTask => t.kind === 'text' && !!t.figure).map((t) => ({ s, t })))
    const kinds = new Set<string>(withFigure.map(({ t }) => (t.figure!.kind === 'shape' ? t.figure!.shape : t.figure!.kind === 'angle' ? t.figure!.angleType : '')))
    for (const k of ['pentagon', 'rectangle', 'square', 'quadrilateral', 'acute', 'right', 'obtuse']) assert.ok(kinds.has(k), k)
    for (const { s, t } of withFigure) {
      assert.equal(visualProblem(text(t.level, t.text, t.solution, t.figure as AiVisual), { area: s.profile!.area! }), null, `${s.id}: ${t.text}`)
      assert.equal(previewProblem(t), null, `${s.id}: ${t.text}`)
    }
    const fem = buildTasks(session('geometri-1')).find((t) => t.kind === 'text' && t.figure?.kind === 'shape' && t.figure.shape === 'pentagon') as TextTask
    assert.match(fem.text, /Hvor mange sider og hjørner har figuren\?/)
  })

  it('alle grunnoppgavene passer fortsatt kandidatkontrollen i sin økt (også figurkontrollen)', () => {
    // Grunnoppgavene er ikke AI-oppgaver: kravet om figur i nye AI-oppgaver gjelder ikke dem.
    for (const s of sessions) {
      for (const t of buildTasks(s).filter((x): x is TextTask => x.kind === 'text')) {
        assert.equal(visualProblem(text(t.level, t.text, t.solution, t.figure as AiVisual | undefined), { area: s.profile!.area!, requireFigure: false }), null, `${s.id}: ${t.text}`)
      }
    }
  })

  it('like tekster med ulike figurer er ulike oppgaver i oppgavesettet', () => {
    const base = { kind: 'text' as const, level: 1 as const, text: 'Hva heter figuren?', solution: '', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
    const merged = mergeTasks([
      { ...base, id: 'a', solution: 'Femkant', figure: shape('pentagon') },
      { ...base, id: 'b', solution: 'Sekskant', figure: shape('hexagon') },
      { ...base, id: 'c', solution: 'Femkant', figure: shape('pentagon') },
    ])
    assert.deepEqual(merged.map((t) => t.id), ['a', 'b'])
    for (const s of sessions) for (const level of [1, 2, 3]) assert.equal(buildTasks(s).filter((t) => t.level === level).length, 5, `${s.id} nivå ${level}`)
  })
})

describe('14 og full flyt: fra AI-svar med figur til synlig SVG i elevvisningen', () => {
  const s = () => session('geometri-1')
  const polygons: [AiLevel, string, string, string][] = [
    [1, 'Se på figuren. Hvor mange sider og hjørner har den?', '5 sider og 5 hjørner', 'femkant'],
    [1, 'Hva heter figuren?', 'Sekskant', 'sekskant'],
    [2, 'Hvor mange flere hjørner har figuren enn en trekant?', '3 flere hjørner. Figuren er en sekskant med 6 hjørner, og 6 − 3 = 3.', 'sekskant'],
    [2, 'Hvor mange sider har figuren til sammen med en firkant?', '7 sider. Figuren er en trekant med 3 sider, og 3 + 4 = 7.', 'trekant'],
    [3, 'Ola sier at figuren har like mange hjørner som en firkant. Har Ola rett? Forklar.', 'Nei. Figuren er en sekskant med 6 hjørner, mens en firkant har 4 hjørner.', 'sekskant'],
    [3, 'Hvorfor har figuren ingen hjørner? Forklar.', 'Figuren er en sirkel. Den har ingen rette sider, og derfor ingen hjørner.', 'sirkel'],
  ]

  it('14. en komplett bestilling med figurer gir nøyaktig bestilt antall, og avviste kandidater erstattes', async () => {
    const { handler, logs, calls, prompts } = scripted([
      [
        ...polygons.slice(0, 5).map(([l, q, a, form]) => story(l, q, a, { type: 'figur', form })),
        // Tegneoppgave på nivå 3 – avvises og erstattes.
        story(3, 'Tegn to ulike femkanter og forklar hva som er likt.', 'Begge har 5 sider og 5 hjørner.'),
      ],
      [story(...(polygons[5].slice(0, 3) as [AiLevel, string, string]), { type: 'figur', form: polygons[5][3] })],
    ])
    const result = await handler(appRequest(s()), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.equal(logs.find((e) => e.event === 'general_tasks')!.removed_drawingTask, 1)
    assert.ok(prompts[0].includes('Feltet figur'))

    // Videre som i appen: utkast → oppgave → lagret og lest inn igjen → elevvisningen tegner SVG-en.
    const tasks = result.tasks.map((d, i) => toSessionTask(d, `ai-${i}`, result.meta))
    const stored = parseTaskSets(serializeTaskSets({ 'geometri-1': tasks })).sets['geometri-1']
    assert.deepEqual(stored, tasks)
    const first = stored[0] as TextTask
    assert.deepEqual(first.figure, shape('pentagon'))
    assert.equal(first.aiGenerated, true)
    assert.equal(first.aiMeta?.rulesVersion, '8')
    const markup = svg(first.figure as AiVisual)
    assert.match(markup, /<svg[^>]*data-shape="pentagon"/)
    assert.equal(count(markup, 'data-part="corner"'), 5)
  })

  it('en vinkel fra AI-svaret havner som synlig vinkel med bue og rettvinkelsymbol', async () => {
    const angles = (l: AiLevel): Raw[] => [
      story(l, 'Hva slags vinkel ser du på figuren?', 'Rett vinkel', { type: 'vinkel', vinkeltype: 'rett', grader: 90 }),
      story(l, `Vinkelen på figuren er ${100 + l * 10}°. Er den spiss, rett eller stump?`, 'Stump vinkel', { type: 'vinkel', vinkeltype: 'stump', grader: 100 + l * 10 }),
    ]
    const { handler } = scripted([[...angles(1), ...angles(2), ...angles(3)]])
    const result = await handler(appRequest(session('geometri-5')), { uid: 'l', classId: '4A' })
    assert.equal(result.tasks.length, 6)
    const task = toSessionTask(result.tasks[0], 'v', result.meta) as TextTask
    const markup = svg(task.figure as AiVisual)
    assert.match(markup, /data-angle-type="right"/)
    assert.equal(count(markup, 'data-part="right-angle-marker"'), 1)
  })
})

describe('15. lagring med og uten figur', () => {
  it('oppgaver med og uten figur lagres og leses likt, og en ukjent figur fjernes uten at oppgaven forsvinner', () => {
    const base = { kind: 'text' as const, level: 1 as const, solution: 'x', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
    const tasks: SessionTask[] = [
      { ...base, id: 'a', text: 'Uten figur' },
      { ...base, id: 'b', text: 'Med figur', figure: shape('hexagon') },
      { ...base, id: 'c', text: 'Med vinkel', figure: angle('obtuse', 135) },
      { ...base, id: 'd', text: 'Rutefigur', figure: { kind: 'grid' as const, rows: ['##'] } },
      { id: 'e', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 3, operator: '*', b: 4 },
    ]
    assert.deepEqual(parseTaskSets(serializeTaskSets({ s: tasks })).sets.s, tasks)
    const raw = JSON.parse(serializeTaskSets({ s: tasks }))
    raw.sessions.s[1].figure = { kind: 'shape', shape: 'kube' }
    raw.sessions.s[2].figure = { kind: 'angle', angleType: 'acute', degrees: 120 }
    const read = parseTaskSets(JSON.stringify(raw)).sets.s as TextTask[]
    assert.equal(read.length, 5)
    assert.equal(read[1].figure, undefined)
    assert.equal(read[2].figure, undefined)
  })
})

describe('13. andre tema, referansebanker og regelversjon', () => {
  it('regelversjon 8, dokumentert i config', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.match(source('../src/ai/config.ts'), /8: figurer i geometri/)
  })

  it('prompten nevner figurfeltet bare i geometriøkter med 2D-figurer eller vinkler', () => {
    assert.ok(taskPrompt(serverRequest(session('geometri-1'))).includes('Feltet figur'))
    assert.ok(taskPrompt(serverRequest(session('geometri-5'))).includes('Feltet figur'))
    assert.ok(!taskPrompt(serverRequest(session('geometri-3'))).includes('Feltet figur'))
    for (const id of ['divisjon-3', 'multiplikasjon-3']) {
      const [unit] = id.split('-')
      const other = planned(unit).find((p) => p.id === id)!
      assert.ok(!taskPrompt(serverRequest(other)).includes('Feltet figur'), id)
    }
  })

  it('oppgaver uten figur i andre tema behandles som før – også tegneoppgaver i divisjon', () => {
    const division = planned('divisjon').find((s) => s.id === 'divisjon-7')!
    const task = text(1, 'Tegn 3 ringer og fordel 21 prikker likt i dem. Hvor mange prikker blir det i hver ring?', '7 prikker')
    assert.equal(checkCandidates([task], serverRequest(division)).rejected[0]?.reason ?? null, null)
  })
})
