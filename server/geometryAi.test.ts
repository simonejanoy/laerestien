// Tester for referansebanken og AI-genereringen i Geometri: banken, koblingen mellom øktene og
// fagområdene, utvalget, prompten, kontrollene (figur som mangler, vinkler, figurfakta, nett og begreper),
// «Andre ønsker», utfyllingen og at andre temaer er uendret.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { GEOMETRY_AREAS, type AiLevel, type AiTaskDraft, type AiTextDraft, type AiVisual, type TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { tasksFor, unitSpecs } from '../src/features/topics/yearPlan.ts'
import { angleType, geometryProblem, type GeometryContext } from './geometryChecks.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { divisionBankFile, divisionReferences } from './references/division.ts'
import { GEOMETRY_REFERENCE_COUNT, geometryBankFile, geometryReferences } from './references/geometry.ts'
import { multiplicationBankFile, multiplicationReferences } from './references/multiplication.ts'
import { placeValueBankFile, placeValueReferences } from './references/placeValue.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { GEOMETRY_BANK, validateReferenceBank } from './references/validate.ts'
import { assessmentProblem, checkCandidates, containsInternalText } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(geometryBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

const sessions = planned('geometri')
const session = (id: string) => sessions.find((s) => s.id === id)!

function appRequest(s: Planned, wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Geometri', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(s, 5, 6), buildTasks(s), s.profile),
    profile: toAiProfile(s.profile!),
  }
}

/** Bestillingen slik serveren har den etter at referansene er valgt (for kontrollene direkte). */
function serverRequest(s: Planned, wishes = '') {
  const request = appRequest(s, wishes)
  const { area, secondaryAreas } = s.profile!
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: area!, secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

/** Tekstoppgave med en figur appen tegner. */
const withFigure = (task: AiTaskDraft, figure: AiVisual): AiTaskDraft => ({ ...(task as AiTextDraft), figure })
const text = (level: AiLevel, studentText: string, solution: string): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
const math = (level: AiLevel, a: number, operator: '+' | '-' | '*' | '/', b: number, instruction: string): AiTaskDraft => ({
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction,
  a,
  operator,
  b,
  competenceGoal: '',
  adaptation: '',
})
const ctx = (s: Planned): GeometryContext => ({ area: s.profile!.area as GeometryContext['area'], secondaryAreas: s.profile!.secondaryAreas as GeometryContext['secondaryAreas'] })
/** Årsaken fagkontrollen gir én oppgave i økta, eller null når den godtas. */
const problem = (id: string, task: AiTaskDraft) => geometryProblem(task, ctx(session(id)))
/** Årsaken hele kandidatkontrollen gir (med referanser og oppgavesett), eller null når oppgaven godtas. */
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
/** Vinkeloppgave med vinkelen appen tegner (nye vinkeloppgaver skal ha figur – regelversjon 8). */
const angleStory = (level: AiLevel, d: number, fasit = d < 90 ? 'Spiss' : d === 90 ? 'Rett' : 'Stump') =>
  story(level, `Se på figuren. Vinkelen er ${d}°. Er den spiss, rett eller stump?`, fasit, { type: 'vinkel', vinkeltype: d < 90 ? 'spiss' : d === 90 ? 'rett' : 'stump', grader: d })

function scripted(responses: Raw[][]) {
  let calls = 0
  const logs: AiLogEntry[] = []
  const prompts: string[] = []
  const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    const body = JSON.stringify({ melding: '', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
    return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-geo', newSeed: () => 3 })
  return { handler, logs, prompts, calls: () => calls }
}

describe('1–2. referansebanken for Geometri', () => {
  it('1. har 36 gyldige og unike referanser, importert uendret', () => {
    const raw = bankJson()
    assert.equal(GEOMETRY_REFERENCE_COUNT, 36)
    assert.equal(raw.referenceCount, 36)
    assert.deepEqual(validateReferenceBank(raw, 36, GEOMETRY_BANK).errors, [])
    assert.deepEqual(geometryReferences, raw.references)
    assert.equal(new Set(geometryReferences.map((r) => r.id)).size, 36)
    assert.equal(new Set(geometryReferences.map((r) => r.studentText.trim().toLowerCase())).size, 36)
    for (const ref of geometryReferences) {
      assert.match(ref.id, /^G[1-4]-N[1-3]-0[1-3]$/)
      assert.equal(ref.topic, 'geometri')
      assert.ok([1, 2, 3].includes(ref.level))
    }
    assert.equal(referenceBanks.filter((r) => r.topic === 'geometri').length, 36)
  })

  it('valideringen avviser identiske elevtekster, ukjente områder og ugyldige nivåer', () => {
    const copy = bankJson()
    copy.references[1].studentText = copy.references[0].studentText
    assert.ok(validateReferenceBank(copy, 36, GEOMETRY_BANK).errors.some((e) => e.includes('elevteksten finnes allerede')))
    const area = bankJson()
    ;(area.references[0] as { area: string }).area = 'areal'
    assert.ok(validateReferenceBank(area, 36, GEOMETRY_BANK).errors.some((e) => e.includes('ukjent fagområde')))
    const level = bankJson()
    ;(level.references[0] as { level: number }).level = 4
    assert.ok(validateReferenceBank(level, 36, GEOMETRY_BANK).errors.some((e) => e.includes('ugyldig nivå')))
  })

  it('2. hvert av de fire områdene har tre referanser på hvert nivå', () => {
    assert.deepEqual([...new Set(geometryReferences.map((r) => r.area))], [...GEOMETRY_AREAS])
    for (const area of GEOMETRY_AREAS) {
      for (const level of [1, 2, 3]) assert.equal(geometryReferences.filter((r) => r.area === area && r.level === level).length, 3, `${area} nivå ${level}`)
    }
  })

  it('alle 36 referansene består fagkontrollen i sitt eget område, og ingen handler om omkrets eller areal', () => {
    for (const ref of geometryReferences) {
      assert.equal(geometryProblem(text(ref.level, ref.studentText, ref.solution), { area: ref.area as GeometryContext['area'] }), null, ref.id)
      assert.ok(!/omkrets|areal/i.test(`${ref.studentText} ${ref.solution} ${ref.purpose} ${ref.teacherNote ?? ''}`), ref.id)
    }
  })

  it('todimensjonale figurer har tre brukbare referanser på hvert nivå – også nivå 3', () => {
    for (const level of [1, 2, 3] as const) {
      for (const seed of [1, 2, 3, 99]) {
        assert.equal(selectReferences(referenceBanks, { area: 'todimensjonale-figurer', level, seed }).length, 3, `nivå ${level}`)
      }
    }
    assert.ok(selectReferences(referenceBanks, { area: 'todimensjonale-figurer', level: 3, seed: 1 }).some((r) => r.id === 'G1-N3-03'))
  })

  it('referanse-ID-ene fra geometribanken vises aldri i synlige felt', () => {
    assert.ok(containsInternalText('Som i G4-N2-03.'))
  })
})

describe('3–4. øktene, referanseutvalget og det AI-en får', () => {
  it('3. seks økter med samme ID-er og rekkefølge, hver med ett hovedområde etter progresjonen', () => {
    assert.deepEqual(
      sessions.map((s) => [s.id, s.heading, s.profile?.area, (s.profile?.secondaryAreas ?? []).join(',')]),
      [
        ['geometri-1', 'Mangekanter – sider og hjørner', 'todimensjonale-figurer', ''],
        ['geometri-2', 'Firkanter – egenskaper og symmetri', 'todimensjonale-figurer', ''],
        ['geometri-3', 'Kube, prisme, pyramide og sylinder', 'tredimensjonale-figurer', ''],
        ['geometri-4', 'Fra tredimensjonal til todimensjonal', 'fra-3d-til-2d', 'tredimensjonale-figurer'],
        ['geometri-5', 'Rette, spisse og butte vinkler', 'vinkler', ''],
        ['geometri-6', 'Vinkler i trekanter', 'vinkler', ''],
      ],
    )
    for (const s of sessions) {
      const p = s.profile!
      assert.ok(p.focus && p.formats.length > 0 && p.avoid.length > 0, s.id)
      for (const level of [1, 2, 3] as const) assert.ok(p.levels[level].title && p.levels[level].description && p.levels[level].support, `${s.id} nivå ${level}`)
    }
  })

  it('3. velger bare referanser fra øktas område(r) og nivå – og aldri en referanse om omkrets', () => {
    for (const s of sessions) {
      const { area, secondaryAreas = [] } = s.profile!
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 99]) {
          const chosen = selectReferences(referenceBanks, { area: area!, secondaryAreas, level, seed })
          assert.ok(chosen.length > 0 && chosen.length <= 3, `${s.id} nivå ${level}`)
          assert.ok(chosen.every((r) => r.level === level && [area, ...secondaryAreas].includes(r.area)), `${s.id} nivå ${level}`)
          assert.ok(!chosen.some((r) => /omkrets|areal/i.test(`${r.studentText} ${r.solution} ${r.purpose}`)), 'omkrets hører til Måling')
          if (!secondaryAreas.length) assert.ok(chosen.every((r) => r.area === area))
        }
      }
    }
  })

  it('4. AI-en får område, øktfokus, nivåbeskrivelser og støttestruktur – og referansene fra banken', async () => {
    const s = session('geometri-5')
    const { handler, prompts } = scripted([
      [1, 2, 3].flatMap((l) => [
        angleStory(l as AiLevel, 20 + l),
        angleStory(l as AiLevel, 100 + l),
      ]),
    ])
    const result = await handler(appRequest(s), { uid: 'l', classId: '4A' })
    const prompt = prompts[0]
    assert.equal(result.meta?.topic, 'geometri')
    assert.equal(result.meta?.area, 'vinkler')
    for (const level of ['1', '2', '3'] as const) assert.ok(result.meta?.referenceIds?.[level]?.every((id) => id.startsWith(`G4-N${level}-`)))
    assert.ok(prompt.includes('Hovedtema: Geometri'))
    assert.ok(prompt.includes('Fagområde: Vinkler'))
    assert.ok(prompt.includes('Tittel: Vinkler – gjenkjenne'))
    assert.ok(prompt.includes('Støttestruktur i instruksjonen på nivået: Resonnere og forklare'))
    assert.ok(prompt.includes('180° er en rett linje'))
    assert.ok(prompt.includes('Feltet figur: Appen kan tegne én vinkel'))
    assert.ok(prompt.includes('Ikke be eleven tegne'))
    assert.ok(!prompt.includes('Byttede ledd i et plusstykke'))
    assert.equal(result.tasks.length, 6)
  })
})

describe('grunnoppgavene i Geometri', () => {
  it('alle grunnoppgavene i geometriøktene passer kontrollene i sin egen økt', () => {
    for (const s of sessions) {
      for (const t of buildTasks(s)) {
        const draft =
          t.kind === 'text'
            ? text(t.level, t.text, t.solution)
            : ({ format: 'math', level: t.level, taskType: t.type, instruction: t.instruction, a: t.a, operator: t.operator, b: t.b, competenceGoal: '', adaptation: '' } as AiTaskDraft)
        assert.equal(geometryProblem(draft, ctx(s)), null, `${s.id} ${t.id}: ${t.kind === 'text' ? t.text : t.instruction}`)
      }
    }
  })

  it('ingen grunnoppgaver om omkrets, ingen forkledde gangestykker og ingen henvisning til figurer som ikke vises', () => {
    for (const s of sessions) {
      for (const t of buildTasks(s)) {
        const body = t.kind === 'text' ? `${t.text} ${t.solution}` : t.instruction
        assert.ok(!/omkrets|areal|se figuren/i.test(body), `${s.id}: ${body}`)
        if (t.kind !== 'text') assert.notEqual(t.operator, '*', `${s.id}: ${body}`)
      }
    }
  })
})

describe('5. referanser kopieres ikke', () => {
  it('ordrett, eller med ett ord eller tall byttet ut, avvises – en ny oppgave godtas', () => {
    // Romfigurer (ingen figur kreves): referansen G2-N1-03 ordrett, og med «kube» byttet til «terning».
    const ref = geometryReferences.find((r) => r.id === 'G2-N1-03')!
    assert.equal(reason('geometri-3', text(1, ref.studentText, ref.solution)), 'copiedReference')
    assert.equal(reason('geometri-3', text(1, 'Hvor mange flater, kanter og hjørner har en terning?', '6 flater, 12 kanter og 8 hjørner')), 'copiedReference')
    assert.equal(reason('geometri-3', text(2, 'En eske har seks rektangulære flater. Hvor mange kanter har esken?', '12 kanter')), null)
    // Plane figurer: nye oppgaver skal vise til figuren appen tegner – referanseteksten alene avvises.
    const plane = geometryReferences.find((r) => r.id === 'G1-N1-02')!
    assert.notEqual(reason('geometri-1', text(1, plane.studentText, plane.solution)), null)
  })
})

describe('6. figurer som ikke vises', () => {
  it('oppgaver som viser til en figur eller et bilde som ikke finnes, avvises', () => {
    assert.equal(reason('geometri-1', text(1, 'Se figuren under. Hvor mange hjørner har den?', '5 hjørner')), 'missingFigure')
    assert.equal(reason('geometri-5', text(2, 'Bildet under viser to vinkler. Hvilken er størst?', 'Den til venstre')), 'missingFigure')
    assert.equal(reason('geometri-3', text(1, 'Hvor mange flater har romfiguren på tegningen nedenfor?', '6 flater')), 'missingFigure')
  })

  it('en figur appen tegner, eller en figur beskrevet med ord, godtas – men ikke en tegneoppgave (regelversjon 8)', () => {
    assert.equal(reason('geometri-1', text(1, 'Tegn en sekskant. Tell hjørnene på figuren din.', '6 hjørner')), 'drawingTask')
    assert.equal(reason('geometri-1', withFigure(text(1, 'Se på figuren. Tell hjørnene.', '6 hjørner'), { kind: 'shape', shape: 'hexagon' })), null)
    assert.equal(reason('geometri-3', text(2, 'En eske har seks rektangulære flater. Hvor mange hjørner har esken?', '8 hjørner')), null)
  })
})

describe('7. vinkler', () => {
  it('gradtallet bestemmer vinkeltypen', () => {
    assert.deepEqual([45, 90, 120, 180].map(angleType), ['spiss', 'rett', 'stump', 'rett linje'])
  })

  it('feil klassifisering avvises – også 180° kalt stump og feil omdreining', () => {
    assert.equal(problem('geometri-5', text(1, 'Er en vinkel på 120 grader spiss, rett eller stump?', 'Spiss')), 'wrongAngle')
    assert.equal(problem('geometri-5', text(1, 'En vinkel er 90°. Hva kalles vinkelen?', 'Stump vinkel')), 'wrongAngle')
    assert.equal(problem('geometri-5', text(2, 'Hvilken vinkel er størst: 60° eller 180°?', '180° er størst. 180° er en stump vinkel.')), 'wrongAngle')
    assert.equal(problem('geometri-5', text(3, 'Hvor mange grader er en kvart omdreining?', 'En kvart omdreining er 180 grader.')), 'wrongAngle')
    assert.equal(problem('geometri-5', text(2, 'En vinkel er 135°. Forklar hva slags vinkel det er.', '135° er en spiss vinkel fordi den er liten.')), 'wrongAngle')
  })

  it('riktig klassifisering godtas, også «butt» og en påstand med bevisst feil', () => {
    assert.equal(problem('geometri-5', text(1, 'Er en vinkel på 120 grader spiss, rett eller butt?', 'Butt')), null)
    assert.equal(problem('geometri-5', text(1, 'En vinkel er 90°. Hva kalles vinkelen?', 'Rett vinkel')), null)
    assert.equal(problem('geometri-5', text(3, 'Ida sier at 150° er en spiss vinkel. Har Ida rett? Forklar.', 'Nei. 150° er en stump vinkel fordi den er mellom 90° og 180°.')), null)
    const obtuse = { kind: 'angle', angleType: 'obtuse', degrees: 150 } as const
    assert.equal(
      reason('geometri-5', withFigure(text(3, 'Se på figuren. Ida sier at vinkelen på 150° er spiss. Har Ida rett? Forklar.', 'Nei. 150° er en stump vinkel fordi den er mellom 90° og 180°.'), obtuse)),
      null,
    )
  })

  it('den manglende delen av en rett vinkel, en rett linje og en trekant regnes ut', () => {
    assert.equal(problem('geometri-6', text(2, 'En rett vinkel deles i to. Den ene delen er 35°. Hvor stor er den andre delen?', '55°')), null)
    assert.equal(problem('geometri-6', text(2, 'En rett vinkel deles i to. Den ene delen er 35°. Hvor stor er den andre delen?', '65°')), 'wrongSolution')
    assert.equal(problem('geometri-6', text(2, 'To vinkler ligger langs en rett linje. Den ene er 130°. Hvor stor er den andre?', '60°')), 'wrongSolution')
    assert.equal(problem('geometri-6', text(3, 'I en trekant er to av vinklene 50° og 70°. Hvor stor er den tredje vinkelen?', '60°')), null)
    // Regnestykker avvises: «90 − 40 =» under teksten ville røpe hvordan oppgaven løses. AI-oppgavene blir tekstoppgaver.
    assert.equal(problem('geometri-6', math(1, 90, '-', 40, 'En rett vinkel deles i to. Den ene er 40°. Hvor stor er den andre?')), 'format')
    assert.equal(problem('geometri-6', math(1, 180, '-', 40, 'En rett vinkel deles i to. Den ene er 40°. Hvor stor er den andre?')), 'format')
  })

  it('«Vinkler i trekanter» har bare tekstoppgaver: ingen regnestykker under teksten, og fasiten viser utregningen', () => {
    const angles = unitSpecs.flatMap((u) => planned(u.unitId)).find((s) => s.id === 'geometri-6')!
    const tasks = buildTasks(angles)
    assert.equal(tasks.length, 15)
    for (const t of tasks) {
      assert.equal(t.kind, 'text', t.id)
      if (t.kind !== 'text') continue
      assert.ok(!/=/.test(t.text) && !/\d+\s*[−-]\s*\d+/.test(t.text), `utregningen står i oppgaveteksten: ${t.text}`)
      const [, a, b, answer] = /\((\d+)° − (\d+)° = (\d+)°\)/.exec(t.solution) ?? []
      assert.ok(answer && Number(a) - Number(b) === Number(answer) && t.solution.startsWith(`${answer}°`), t.solution)
    }
    assert.ok(tasks.some((t) => t.kind === 'text' && t.text.startsWith('En rett vinkel er 90°. Den deles i to vinkler.')))
    // Repetisjonsøkta med samme undertema (uten øktprofil) har regnestykkene som før.
    const repetition = unitSpecs.flatMap((u) => planned(u.unitId)).find((s) => s.id === 'repetisjon-vinter-2')!
    assert.ok(buildTasks(repetition).every((t) => t.kind !== 'text'))
  })
})

describe('8. fakta om figurer, romfigurer og nett', () => {
  it('feil antall kanter, hjørner og flater avvises', () => {
    assert.equal(problem('geometri-3', text(1, 'Hvor mange kanter har en kube?', '8 kanter')), 'wrongFact')
    assert.equal(problem('geometri-3', text(1, 'Hvor mange flater, kanter og hjørner har en terning?', '6 flater, 12 kanter og 6 hjørner')), 'wrongFact')
    assert.equal(problem('geometri-3', text(2, 'Hvor mange sideflater har en firkantet pyramide?', '5 trekantede sideflater')), 'wrongFact')
    assert.equal(problem('geometri-3', text(2, 'Beskriv endeflatene på et trekantet prisme.', 'Et trekantet prisme har 3 trekantede endeflater.')), 'wrongFact')
    assert.equal(problem('geometri-3', text(2, 'En romfigur har én kvadratisk grunnflate og fire trekantede sideflater. Hva heter den?', 'Trekantet prisme')), 'wrongFact')
    assert.equal(problem('geometri-1', text(1, 'Hvor mange hjørner har en femkant?', '6 hjørner')), 'wrongFact')
  })

  it('feil nett avvises', () => {
    assert.equal(problem('geometri-4', text(2, 'En sylinder brettes ut. Hvilke figurer består nettet av?', '3 sirkler og 1 rektangel')), 'wrongFact')
    assert.equal(problem('geometri-4', text(2, 'Hvilke figurer består nettet til et trekantet prisme av?', '2 trekanter og 2 rektangler')), 'wrongFact')
    assert.equal(problem('geometri-4', text(1, 'Hvor mange kvadrater har et kubenett? Tegn et nett til en kube.', '5 kvadrater')), 'wrongFact')
  })

  it('«seks flater er alltid en kube» og «seks kvadrater er alltid et kubenett» avvises', () => {
    assert.equal(problem('geometri-3', text(3, 'Hva kan du si om en romfigur med seks flater?', 'Alle romfigurer med seks flater er kuber.')), 'wrongFact')
    assert.equal(problem('geometri-4', text(3, 'Et nett har seks like kvadrater. Er det sikkert at det kan brettes til en kube? Forklar.', 'Ja, seks kvadrater blir alltid en kube.')), 'wrongFact')
    assert.equal(problem('geometri-4', text(3, 'Et nett har seks like kvadrater. Er det sikkert at det kan brettes til en kube? Forklar.', 'Nei. Kvadratene må også ligge riktig, ellers overlapper de når nettet brettes.')), null)
  })

  it('sider, kanter og flater brukes om riktige figurer, og kulen kan rulle', () => {
    assert.equal(problem('geometri-3', text(1, 'Hvor mange sider har en kube?', 'En kube har 6 sider.')), 'wrongTerm')
    assert.equal(problem('geometri-1', text(1, 'Hvor mange kanter har en trekant?', 'En trekant har 3 kanter.')), 'wrongTerm')
    assert.equal(problem('geometri-3', text(3, 'Kan en kule rulle? Forklar.', 'Nei, kulen kan ikke rulle fordi den er rund.')), 'wrongFact')
  })

  it('korrekte fakta godtas', () => {
    assert.equal(problem('geometri-3', text(1, 'Hvor mange flater, kanter og hjørner har en kube?', '6 flater, 12 kanter og 8 hjørner')), null)
    assert.equal(problem('geometri-3', text(2, 'Hvor mange flater har en firkantet pyramide?', '5 flater: én kvadratisk grunnflate og 4 trekantede sideflater')), null)
    assert.equal(problem('geometri-4', text(2, 'En sylinder brettes ut. Hvilke figurer består nettet av?', 'To sirkler og ett rektangel')), null)
    assert.equal(problem('geometri-2', text(1, 'Hvor mange rette vinkler har et rektangel?', '4 rette vinkler')), null)
  })

  it('påstander i ord godtas i geometri, men ikke i andre tema (der påstanden må kunne regnes ut)', () => {
    const claim = 'Se på figuren. En elev sier at figuren er et rektangel. Har eleven rett? Forklar.'
    const square = { kind: 'shape', shape: 'square' } as const
    const verbal = withFigure(text(3, claim, 'Ja. Figuren er et kvadrat, og et kvadrat har fire rette vinkler, så det er også et rektangel.'), square)
    assert.equal(assessmentProblem(verbal, { verbalClaims: true }), null)
    assert.equal(assessmentProblem(verbal), 'unclearSolution')
    assert.equal(reason('geometri-2', verbal), null)
    // Ja/nei må fortsatt være entydig.
    assert.equal(reason('geometri-2', withFigure(text(3, claim, 'Ja, eller nei, det kommer an på.'), square)), 'unclearSolution')
  })
})

describe('9. «Andre ønsker» kan endre konteksten, men ikke fagområdet', () => {
  const football = 'Lag oppgaver fra en fotballbane.'

  it('en vinkeloppgave fra en fotballbane godtas', () => {
    const corner = withFigure(text(2, 'Se på figuren. Den viser hjørnet på en fotballbane, der to sidelinjer møtes i 90°. Hva slags vinkel er det?', 'Rett vinkel'), { kind: 'angle', angleType: 'right', degrees: 90 })
    assert.equal(reason('geometri-5', corner, football), null)
  })

  it('divisjon, omkrets eller feil fakta slipper ikke gjennom selv om læreren ber om det', () => {
    const division = 'Lag divisjonsoppgaver om fotball.'
    const right = { kind: 'angle', angleType: 'right', degrees: 90 } as const
    // Også med en vinkel påklistret: en divisjonsoppgave hører ikke til vinkeløkta.
    assert.equal(reason('geometri-5', withFigure(text(2, 'Se på figuren. 24 fotballer deles likt på 6 lag. Hvor mange får hvert lag?', '4 fotballer'), right), division), 'offTopic')
    // Regnestykker kan ikke ha figur, og nye vinkeloppgaver skal ha figur.
    assert.equal(reason('geometri-5', math(2, 24, '/', 6, 'Del fotballene likt på lagene.'), division), 'figureRequired')
    const goal = { kind: 'shape', shape: 'rectangle' } as const
    assert.equal(reason('geometri-2', withFigure(text(2, 'Se på figuren. Den viser et fotballmål som er 7 m bredt og 2 m høyt. Hva er omkretsen?', '18 m'), goal), 'Lag oppgaver om omkrets.'), 'offTopic')
    assert.equal(reason('geometri-5', withFigure(text(1, 'Se på figuren. Et hjørne på fotballbanen er 90°. Er det en spiss, rett eller stump vinkel?', 'Spiss'), right), football), 'visualMismatch')
    assert.equal(reason('geometri-1', text(1, 'Se figuren av fotballbanen under. Hvor mange hjørner har banen?', '4 hjørner'), football), 'missingFigure')
  })

  it('prompten sier at ønskene ikke kan bytte område eller tema', () => {
    const prompt = taskPrompt(serverRequest(session('geometri-5'), 'Lag divisjonsoppgaver.'))
    assert.ok(prompt.includes('Hold deg til geometriområdet i økta'))
    assert.ok(prompt.includes('men ikke fagområdet, deltemaet, nivået eller målet for økta'))
  })
})

describe('10. utfyllingen leverer nøyaktig bestilt antall eller ingen oppgaver', () => {
  const angle = (level: AiLevel, d: number) => angleStory(level, d)

  it('avviste kandidater erstattes, så læreren får to per nivå', async () => {
    const { handler, logs, calls } = scripted([
      [
        angle(1, 25),
        story(1, 'Se figuren under. Er vinkelen spiss eller stump?', 'Spiss'),
        angle(2, 105),
        angleStory(2, 170, 'Spiss'),
        angle(3, 155),
        angle(3, 65),
      ],
      [angle(1, 55), angle(2, 125)],
    ])
    const result = await handler(appRequest(session('geometri-5')), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_missingFigure, 1)
    // Feil klassifisering av vinkelen på figuren.
    assert.equal(final.removed_visualMismatch, 1)
    assert.equal(final.delivered, true)
    assert.equal(final.topic, 'geometri')
  })

  it('når erstatningene heller ikke passer, leveres ingen oppgaver og læreren får en tydelig melding', async () => {
    const wrong = story(1, 'Er en vinkel på 30 grader spiss, rett eller stump?', 'Stump')
    const { handler, calls } = scripted([[wrong, wrong, angle(2, 105), angle(2, 115), angle(3, 155), angle(3, 65)], [wrong]])
    const result = await handler(appRequest(session('geometri-5')), { uid: 'l', classId: '4A' })
    assert.equal(calls(), 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
  })
})

describe('11. andre temaer og referansebanker er uendret', () => {
  it('de tre andre bankene er byte for byte uendret', () => {
    const hash = (file: URL) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
    assert.equal(hash(multiplicationBankFile), '4e3e3970c12f95a6')
    assert.equal(hash(placeValueBankFile), '21ba85a512aeffed')
    assert.equal(hash(divisionBankFile), '137f3e1f03a7d25f')
    assert.deepEqual([multiplicationReferences.length, placeValueReferences.length, divisionReferences.length], [54, 45, 36])
    assert.equal(referenceBanks.filter((r) => !['problemlosing', 'tall-og-regning', 'maling', 'monster-og-algoritmer'].includes(r.topic)).length, 54 + 45 + 36 + 36)
  })

  it('utvalget i de andre bankene er det samme som før', () => {
    for (const [area, level, bank] of [
      ['tabell-6-7-8-9', 2, multiplicationReferences],
      ['hoderegning', 3, placeValueReferences],
      ['divisjon-med-rest', 1, divisionReferences],
    ] as const) {
      assert.deepEqual(
        selectReferences(referenceBanks, { area, level, seed: 11 }).map((r) => r.id),
        selectReferences(bank, { area, level, seed: 11 }).map((r) => r.id),
      )
    }
  })

  it('regelversjon, modeller og tidsgrenser er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
    assert.deepEqual(aiConfig.timeoutMsByUse.tasks, { primary: 4000 })
  })

  it('repetisjon (uten profil) får de samme geometrioppgavene som før', () => {
    const plane = tasksFor(['geo.2d'], 1, 0)
    assert.ok(plane.every((t) => Array.isArray(t) && t[2] === '*' && /trekanter|firkanter/.test(t[4])))
    const solid = tasksFor(['geo.3d'], 2, 0)
    assert.ok(solid.every((t) => Array.isArray(t) && t[3] === 8 && t[4].startsWith('En kube har 8 hjørner')))
    const angles = tasksFor(['geo.vinkler'], 1, 0)
    assert.ok(angles.every((t) => Array.isArray(t) && t[1] === 90 && t[2] === '-'))
  })
})
