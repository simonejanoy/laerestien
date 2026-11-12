// Tester for referansebanken og AI-genereringen i Tall og plassverdi: banken, koblingen mellom
// øktene og referanseområdene, utvalget, prompten, kontrollene, utfyllingen og loggingen.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { PLACE_VALUE_AREAS, type AiLevel, type AiTaskDraft, type TaskRequest, type TaskResult } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { sessions as mockSessions } from '../src/features/sessions/mockData.ts'
import { levelsFor, planned } from '../src/features/sessions/sessionTasks.ts'
import type { LevelGroup, SessionTask, TaskProfile } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { referenceBanks } from './references/banks.ts'
import { PLACE_VALUE_REFERENCE_COUNT, placeValueBankFile, placeValueReferences } from './references/placeValue.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { PLACE_VALUE_BANK, validateReferenceBank } from './references/validate.ts'
import { checkCandidates } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

const bankJson = () => JSON.parse(readFileSync(placeValueBankFile, 'utf8')) as { referenceCount: number; references: ReferenceTask[] }

/** Alle øktene i Tall og plassverdi: økt 1–6 og 11–14 fra årsplanen, 7–10 fra mockData. */
interface TallSession {
  id: string
  heading: string
  profile?: TaskProfile
  levels: LevelGroup[]
}
const tallSessions: TallSession[] = [
  ...planned('tall:start').map((p) => ({ id: p.id, heading: p.heading, profile: p.profile, levels: levelsFor(p, 5, 6) })),
  ...mockSessions.map((s) => ({ id: s.id, heading: s.heading, profile: s.taskProfile, levels: s.levels })),
  ...planned('tall:slutt').map((p) => ({ id: p.id, heading: p.heading, profile: p.profile, levels: levelsFor(p, 5, 6) })),
]
const session = (id: string) => tallSessions.find((s) => s.id === id)!

function appRequest(s: TallSession, existing: SessionTask[] = [], wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Tall og plassverdi', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(s.levels, existing, s.profile),
    profile: toAiProfile(s.profile!),
  }
}

/** Bestillingen slik serveren har den etter at referansene er valgt (for kontrollene direkte). */
function serverRequest(s: TallSession, existing: SessionTask[] = [], wishes = '') {
  const request = appRequest(s, existing, wishes)
  request.levels = request.levels!.map((l) => ({
    ...l,
    referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
  }))
  return request
}

type Raw = Record<string, unknown>
const json = (tasks: Raw[]) =>
  JSON.stringify({
    melding: '',
    oppgaver: tasks.map((t) => ({ format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '', ...t })),
  })
const sum = (nivaa: AiLevel, tall1: number, regneart: string, tall2: number, oppgavetype = 'Hoderegning'): Raw => ({ nivaa, tall1, regneart, tall2, oppgavetype })
const story = (nivaa: AiLevel, oppgavetekst: string, fasit: string): Raw => ({ nivaa, format: 'tekst', oppgavetekst, fasit })

function scripted(responses: Raw[][]) {
  const prompts: string[] = []
  const logs: AiLogEntry[] = []
  const generate = async (_u: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
    const text = json(responses[Math.min(prompts.length, responses.length - 1)])
    prompts.push(contents[0]?.parts?.[0]?.text ?? '')
    return { text, content: { role: 'model', parts: [{ text }] }, model: aiConfig.primaryModel, fallbackUsed: false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-tall', newSeed: () => 9 })
  return { handler, prompts, logs }
}
const teacher = { uid: 'lærer', classId: '4A' }
const draft = (level: AiLevel, studentText: string, solution = 'fasit'): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation: '' })
const mathDraft = (level: AiLevel, a: number, operator: '+' | '-' | '*', b: number, taskType: 'Hoderegning' | 'Oppstilling' = 'Hoderegning'): AiTaskDraft => ({
  format: 'math',
  level,
  taskType,
  instruction: 'Regn ut.',
  a,
  operator,
  b,
  competenceGoal: '',
  adaptation: '',
})

describe('referansebanken for Tall og plassverdi', () => {
  it('1–3. 45 unike referanser, 9 per område og 3 per nivå i hvert område – importert uendret', () => {
    const raw = bankJson()
    assert.deepEqual(validateReferenceBank(raw, PLACE_VALUE_REFERENCE_COUNT, PLACE_VALUE_BANK).errors, [])
    assert.equal(raw.references.length, 45)
    assert.equal(new Set(raw.references.map((r) => r.id)).size, 45)
    for (const area of PLACE_VALUE_AREAS) {
      const inArea = raw.references.filter((r) => r.area === area)
      assert.equal(inArea.length, 9, area)
      for (const level of [1, 2, 3]) assert.equal(inArea.filter((r) => r.level === level).length, 3, `${area} nivå ${level}`)
    }
    const hash = createHash('sha256').update(readFileSync(placeValueBankFile)).digest('hex')
    assert.equal(hash, '21ba85a512aeffed89ed7b14f792764b34d4026987c31313550549ff66cc6527')
    assert.equal(placeValueReferences.length, 45)
    assert.ok(!raw.references.some((r) => /rund(e)? av|avrund/i.test(r.studentText)), 'avrunding er ikke med')
  })

  it('fasitene som kan regnes ut, er kontrollert – også med mellomrom i tall og negative tall', () => {
    assert.ok(validateReferenceBank(bankJson(), 45, PLACE_VALUE_BANK).checkedEquations >= 50)
    const broken = bankJson()
    broken.references.find((r) => r.id === 'T4-N2-01')!.solution = '6 345'
    broken.references.find((r) => r.id === 'T5-N2-01')!.teacherNote = '-6 + 9 = 4.'
    const errors = validateReferenceBank(broken, 45, PLACE_VALUE_BANK).errors.join('\n')
    assert.match(errors, /T4-N2-01: svar 1 skal være 6245, ikke 6345/)
    assert.match(errors, /T5-N2-01: «-6 \+ 9 = 4» stemmer ikke/)
  })
})

describe('kobling mellom øktene og referanseområdene', () => {
  const expected: Record<string, [string | undefined, string[]]> = {
    'tall-1': ['firesifrede-tall', []],
    'tall-2': ['firesifrede-tall', []],
    'tall-3': ['firesifrede-tall', []],
    'tall-4': ['hoderegning', ['firesifrede-tall']],
    'tall-5': ['firesifrede-tall', []],
    'tall-6': ['hoderegning', ['addisjon-subtraksjon']],
    'okt-1-2': ['hoderegning', ['addisjon-subtraksjon']],
    'okt-3': ['addisjon-subtraksjon', ['hoderegning']],
    'okt-4': ['addisjon-subtraksjon', ['hoderegning']],
    'okt-5': ['addisjon-subtraksjon', []],
    'okt-6': ['addisjon-subtraksjon', []],
    'okt-7': ['oppstilling-over-1000', []],
    'okt-8': ['negative-tall', []],
  }

  it('4. hver økt har riktig hovedområde (og eventuelle tilgrensende områder)', () => {
    assert.deepEqual(tallSessions.map((s) => s.id).sort(), Object.keys(expected).sort())
    for (const s of tallSessions) {
      const [area, secondary] = expected[s.id]
      assert.equal(s.profile?.area, area, s.id)
      assert.deepEqual(s.profile?.secondaryAreas ?? [], secondary, s.id)
    }
  })

  it('5. ingen økt får referanser fra et område den ikke dekker – og hovedområdet dominerer', () => {
    for (const s of tallSessions.filter((x) => x.profile?.area)) {
      const allowed = [s.profile!.area!, ...(s.profile!.secondaryAreas ?? [])]
      for (const seed of [1, 2, 3, 42]) {
        for (const level of [1, 2, 3] as const) {
          const chosen = selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level, seed })
          assert.equal(chosen.length, 3)
          assert.ok(chosen.every((r) => allowed.includes(r.area) && r.level === level), `${s.id}: ${chosen.map((r) => r.id)}`)
          assert.ok(chosen.filter((r) => r.area === s.profile!.area).length >= 2, s.id)
        }
      }
    }
  })

  it('økta om negative tall får bare negative tall, og oppstillingsøkta bare oppstilling', async () => {
    for (const [id, prefix, title] of [['okt-8', 'T5-', 'Negative tall'], ['okt-7', 'T4-', 'Oppstilling med tall over 1000']]) {
      const { handler, prompts } = scripted([[story(1, 'x', 'y')]])
      const result = await handler(appRequest(session(id)), teacher)
      const ids = Object.values(result.meta?.referenceIds ?? {}).flat()
      assert.equal(ids.length, 9)
      assert.ok(ids.every((x) => x.startsWith(prefix)), `${id}: ${ids}`)
      assert.ok(prompts[0].includes(`Hovedtema: Tall og plassverdi\nFagområde: ${title}`))
      assert.ok(!/ID: T[1-5]/.test(prompts[0].replaceAll(`ID: ${prefix}`, '')), id)
    }
  })
})

describe('prompt og nivåstruktur', () => {
  it('7. nivåstrukturen og tallområdet sendes til modellen, med egne føringer for området', async () => {
    const { handler, prompts } = scripted([[story(1, 'x', 'y')]])
    await handler(appRequest(session('okt-7')), teacher)
    const prompt = prompts[0]
    assert.match(prompt, /Nivå 1\nTittel: Oppstilling med støtte[\s\S]*Tallområde og utfordring: Firesifrede tall uten veksling[\s\S]*Støttestruktur i instruksjonen på nivået: Tydelig støtte og oversiktlig oppsett, hovedsakelig ett faglig steg\./)
    assert.match(prompt, /Nivå 2[\s\S]*Støttestruktur i instruksjonen på nivået: Mindre støtte og mer selvstendig strategivalg/)
    assert.match(prompt, /Nivå 3[\s\S]*Støttestruktur i instruksjonen på nivået: Resonnering: flere steg, feilanalyse, ukjent tall eller forklaring/)
    assert.ok(prompt.includes('Nivåforskjellen skal ikke bare være større tall.'))
    assert.ok(prompt.includes('Bruk tall over 1000 (minst ett tall med fire sifre)'))
    assert.ok(prompt.includes('ikke ta inn et nytt deltema (f.eks. avrunding)'))
    assert.ok(prompt.includes('Referansene er faglige og strukturelle eksempler. De skal ikke returneres direkte.'))
    // Multiplikasjonsreglene følger ikke med.
    assert.ok(!prompt.includes('gangetabellene') && !prompt.includes('Byttede faktorer (f.eks. 3 · 7'))
  })

  it('økter med egne nivåtekster (økt 7–10) beholder dem – profilen gir bare tallområde og støtte', async () => {
    const { handler, prompts } = scripted([[story(1, 'x', 'y')]])
    await handler(appRequest(session('okt-4')), teacher)
    assert.match(prompts[0], /Nivå 1\nTittel: Ta bort og telle/)
    assert.match(prompts[0], /Tilgrensende område \(bare som støtte – hovedfokus er Addisjon og subtraksjon\): Hoderegning/)
  })
})

describe('kvalitetskontroll i Tall og plassverdi', () => {
  const okt5 = session('okt-5')
  const check = (s: TallSession, tasks: AiTaskDraft[], existing: SessionTask[] = [], wishes = '') => checkCandidates(tasks, serverRequest(s, existing, wishes))

  it('6. en referanse kopiert ordrett – som tekst eller med de samme tallene – tas bort', () => {
    const t5 = placeValueReferences.find((r) => r.id === 'T5-N2-01')!
    assert.equal(check(session('okt-8'), [draft(2, t5.studentText, t5.solution)]).removed.copiedReference, 1)
    // Samme formulering med nye tall er også en kopi (T3-N3-02: «Mina sier at 1 004 - 587 = 527 …»).
    assert.equal(check(okt5, [draft(3, 'Mina sier at 400 - 150 = 350. Har Mina rett? Vis med regning.', 'Nei, 250')]).removed.copiedReference, 1)
    // T3-N1-01: «Regn ut: 243 + 126 = __.»
    const copied = check(okt5, [mathDraft(1, 243, '+', 126)])
    assert.equal(copied.removed.copiedReference, 1)
    assert.equal(check(okt5, [mathDraft(1, 352, '+', 134)]).accepted.length, 1)
  })

  it('identiske, byttede og nesten like oppgaver tas bort', () => {
    const existing: SessionTask[] = [
      { id: 'a', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 438, operator: '+', b: 275 },
      { kind: 'text', id: 'b', level: 2, text: 'En klasse har 950 kroner og bruker 275 kroner. Hvor mye har de igjen?', solution: '675', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false },
    ]
    const checked = check(
      okt5,
      [
        mathDraft(2, 438, '+', 275),
        mathDraft(2, 275, '+', 438),
        draft(2, 'Klassen har 950 kr. De bruker 275 kr på bøker. Hvor mange kroner er igjen?', '675'),
        draft(2, 'Ola har 820 kroner og bruker 365 kroner. Hvor mye har han igjen?', '455'),
      ],
      existing,
    )
    assert.equal(checked.removed.duplicateInSet, 1)
    assert.equal(checked.removed.swappedFactors, 1)
    assert.equal(checked.removed.nearDuplicate, 1)
    assert.equal(checked.accepted.length, 1)
  })

  it('feil fasit tas bort', () => {
    const checked = check(okt5, [draft(2, 'Regn ut: 586 + 278 = __.', '874'), draft(2, 'Regn ut: 587 + 279 = __.', '866')])
    assert.equal(checked.removed.wrongSolution, 1)
    assert.equal(checked.accepted.length, 1)
  })

  it('oppgaver fra feil område eller utenfor målet tas bort – også når læreren har skrevet ønsker', () => {
    const negative = check(session('okt-8'), [mathDraft(2, 9, '-', 4), draft(2, 'Hva er 7 + 5?', '12'), draft(2, 'Det er -3 grader. Temperaturen stiger 5 grader. Hva blir temperaturen?', '2 grader')])
    assert.equal(negative.removed.wrongArea, 2)
    assert.equal(negative.accepted.length, 1)

    const column = check(session('okt-7'), [mathDraft(2, 456, '+', 278, 'Oppstilling'), mathDraft(2, 4567, '+', 2785, 'Oppstilling')])
    assert.equal(column.removed.wrongArea, 1)

    const rounding = check(session('tall-1'), [draft(1, 'Rund av 4 682 til nærmeste hundrer.', '4 700'), mathDraft(1, 6, '*', 7)])
    assert.equal(rounding.removed.offTopic, 2)
    assert.equal(check(session('tall-1'), [draft(1, 'Rund av 4 682 til nærmeste hundrer.', '4 700')], [], 'Ta med avrunding').removed.offTopic, 1)
  })

  it('nivå 1 får ikke flerstegs- eller feilanalyseoppgaver', () => {
    const checked = check(okt5, [
      draft(1, 'En elev mener at 400 - 150 = 350. Stemmer det? Forklar.', 'Nei, 250'),
      draft(3, 'En elev mener at 400 - 150 = 350. Stemmer det? Forklar.', 'Nei, 250'),
    ])
    assert.equal(checked.removed.levelMismatch, 1)
    assert.deepEqual(checked.accepted.map((t) => t.level), [3])
  })
})

describe('utfylling og logging i Tall og plassverdi', () => {
  it('9. utfyllingen leverer nøyaktig bestilt antall, og 10. loggen har ingen fritekst, oppgavetekst eller elevdata', async () => {
    const SECRET = 'HEMMELIG-ØNSKE-om-Kari'
    const TEXT = 'HEMMELIG-OPPGAVETEKST'
    const { handler, prompts, logs } = scripted([
      [
        sum(1, 2314, '+', 1462, 'Oppstilling'),
        sum(1, 5321, '+', 2456, 'Oppstilling'),
        sum(1, 6214, '+', 1573, 'Oppstilling'),
        sum(2, 3786, '+', 2459, 'Oppstilling'), // kopi av T4-N2-01
        sum(2, 4687, '+', 2548, 'Oppstilling'),
        sum(3, 7000, '-', 2846, 'Oppstilling'), // kopi av T4-N3-01
        sum(3, 8000, '-', 3657, 'Oppstilling'),
        story(3, `${TEXT}: 6 000 - 2 475 = __`, '3 525'),
      ],
      [sum(2, 5379, '-', 2684, 'Oppstilling'), sum(2, 6145, '+', 2978, 'Oppstilling')],
    ])
    const result = await handler(appRequest(session('okt-7'), [], SECRET), teacher)
    assert.equal(prompts.length, 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    assert.match(prompts[1], /Bestilling: Lag erstatningsoppgaver bare for disse nivåene: nivå 2: 2 kandidater \(mangler 1\)/)

    const logged = JSON.stringify(logs)
    assert.ok(!logged.includes(SECRET) && !logged.includes(TEXT))
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.topic, 'tall-og-plassverdi')
    assert.equal(final.area, 'oppstilling-over-1000')
    assert.equal(final.referenceSeed, 9)
    assert.match(String(final.referenceIds), /^T4-N1-\d\d(,T4-N[1-3]-\d\d){8}$/)
    assert.equal(final.orderedPerLevel, 2)
    assert.equal(final.candidates, 10)
    assert.equal(final.returned, 6)
    assert.equal(final.removed_copiedReference, 2)
    assert.equal(final.model, aiConfig.primaryModel)
    assert.equal(final.fallbackUsed, false)
    assert.equal(final.delivered, true)
    const attempts = logs.filter((e) => e.event === 'general_tasks_attempt')
    assert.deepEqual(attempts.map((e) => [e.attempt, e.topic, e.received, e.missingLevels]), [
      [0, 'tall-og-plassverdi', 8, '2:1'],
      [1, 'tall-og-plassverdi', 2, ''],
    ])
  })

  it('tilgrensende områder logges', async () => {
    const { handler, logs } = scripted([[story(1, 'x', 'y')]])
    await handler(appRequest(session('okt-3')), teacher)
    assert.equal(logs.find((e) => e.event === 'general_tasks')!.secondaryAreas, 'hoderegning')
  })

  it('8. multiplikasjon bruker fortsatt sin egen bank og sine egne regler', async () => {
    const p = planned('multiplikasjon').find((x) => x.id === 'multiplikasjon-6')!
    const { handler, prompts } = scripted([[sum(1, 3, '·', 7), sum(1, 4, '·', 7), sum(2, 6, '·', 8), sum(2, 5, '·', 9), sum(3, 6, '·', 9), sum(3, 8, '·', 7)]])
    const result = await handler(
      {
        kind: 'general',
        lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Multiplikasjon', sessionHeading: p.heading, sessionDescription: '', sessionGoals: [] },
        perLevel: 2,
        officialGoals: '',
        wishes: '',
        levels: buildLevelContexts(levelsFor(p, 5, 6), [], p.profile),
        profile: toAiProfile(p.profile!),
      },
      teacher,
    )
    assert.equal((result as TaskResult).tasks.length, 6)
    assert.ok(Object.values(result.meta?.referenceIds ?? {}).flat().every((id) => id.startsWith('M2-')))
    assert.ok(prompts[0].includes('Hovedtema: Multiplikasjon') && prompts[0].includes('Bruk bare gangetabellene'))
    assert.equal(aiConfig.rulesVersion, '9')
    assert.equal(aiConfig.timeoutMsByUse.tasks?.primary, 4_000)
  })
})
