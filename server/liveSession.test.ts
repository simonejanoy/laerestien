// Tester for den reelle flyten mellom lærer, aktiv økt, elevsvar og framdrift. Kjør: npm test
// Firebase brukes ikke her: den lokale backenden (localLiveBackend.ts) følger de samme reglene som firestore.rules,
// og lærer- og elevvisningen bruker de samme rene funksjonene (liveProgress.ts) som testes her.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { roster, studentsClassId } from '../src/features/class/roster.ts'
import { createLocalLiveBackend } from '../src/features/live/localLiveBackend.ts'
import {
  answersKey,
  buildRoster,
  canDeliver,
  checkNewStudent,
  classOverview,
  deliveredIds,
  deliveryOf,
  loadRun,
  newLiveSession,
  percentOf,
  runIdOf,
  runStateFor,
  saveRun,
  studentLevel,
  studentViewState,
  summarize,
  type LiveSession,
  type ProgressDoc,
  type StorageLike,
} from '../src/features/live/liveProgress.ts'
import { checkMathAnswer, checkTextAnswer, initialMathState, initialTextState } from '../src/features/student/studentTasks.ts'
import type { SessionTask, Task, TextTask, UserProfile } from '../src/types/index.ts'

function memoryStorage() {
  const data = new Map<string, string>()
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
  return { storage, data }
}

// Amalies elevkonto slik den lagres i Firestore (users/{uid}) når læreren lager den under «Elever». Fiktiv elev.
const AMALIE_UID = 'uid-amalie'
const amalieProfile: UserProfile = { uid: AMALIE_UID, name: 'Amalie Berg', email: 'amalie@teigen.no', role: 'student', classId: '4A' }
const CLASS = '4A'
const SESSION = 'okt-1-2'

// Seks oppgaver på nivå 1 og to på nivå 2.
const math = (id: string, a: number, b: number, level: 1 | 2 = 1): Task => ({ id, level, type: 'Hoderegning', instruction: 'Regn ut.', a, operator: '+', b })
const tasks: SessionTask[] = [
  math('t1', 1, 1),
  math('t2', 2, 2),
  math('t3', 3, 3),
  math('t4', 4, 4),
  math('t5', 5, 5),
  math('t6', 6, 6),
  math('n2-1', 10, 10, 2),
  math('n2-2', 20, 20, 2),
]
const level1 = tasks.filter((t) => t.level === 1)
const studentsWithPhotos = roster.map((s) => ({ ...s }))

/** Regnestykket levert med riktig svar. */
const solved = (task: Task) => checkMathAnswer({ ...initialMathState(), answer: String(task.a + task.b) }, task)

describe('Amalie Berg – testkonto og klasse', () => {
  it('1. Amalie har en elevkonto med e-posten amalie@teigen.no og rollen elev', () => {
    const listed = roster.find((s) => s.name === 'Amalie Berg')
    assert.ok(listed, 'Amalie står i klasselista')
    assert.equal(listed.email, 'amalie@teigen.no')
    // Kontoen kobles til eleven i klasselista, og rollen gir elevvisningen (ProtectedRoute: student → /elev).
    const linked = buildRoster(studentsWithPhotos, [amalieProfile]).find((s) => s.name === 'Amalie Berg')
    assert.equal(linked?.uid, AMALIE_UID)
    assert.equal(amalieProfile.role, 'student')
  })

  it('2. Amalie tilhører klasse 4A og står i den vanlige elevlista, ikke i et eget demopanel', () => {
    assert.equal(studentsClassId, '4A')
    assert.equal(amalieProfile.classId, '4A')
    const list = buildRoster(studentsWithPhotos, [amalieProfile])
    assert.equal(list.length, roster.length, 'ingen ekstra rader')
    assert.equal(list.filter((s) => s.name === 'Amalie Berg').length, 1)
  })

  it('3. Amalie får nivået hun allerede har i klasselista (nivå 1), og nivået læreren setter på kontoen går foran', () => {
    assert.equal(roster.find((s) => s.id === 'amalie')?.level, 1)
    assert.equal(studentLevel(amalieProfile, roster), 1)
    assert.equal(studentLevel({ ...amalieProfile, level: 2 }, roster), 2)
    assert.equal(buildRoster(studentsWithPhotos, [{ ...amalieProfile, level: 2 }])[0].level, 2)
    // En elev som ikke står i lista, og uten nivå, starter på nivå 1.
    assert.equal(studentLevel({ name: 'Ukjent Elev', email: 'x@y.no' }, roster), 1)
  })

  it('kontoer i klassen som ikke står i klasselista, kommer med til slutt (kan registreres på samme måte)', () => {
    const other: UserProfile = { uid: 'uid-ny', name: 'Ny Elev', email: 'ny@teigen.no', role: 'student', classId: '4A', level: 3 }
    const list = buildRoster(studentsWithPhotos, [amalieProfile, other])
    assert.equal(list.at(-1)?.uid, 'uid-ny')
    assert.equal(list.at(-1)?.level, 3)
  })
})

describe('ingen doble elever', () => {
  const list = () => buildRoster(studentsWithPhotos, [])

  it('en ny konto med Amalies e-post kobles til Amalie i klasselista, med nivået hennes', () => {
    const check = checkNewStudent(list(), { name: 'Amalie Berg', email: 'Amalie@Teigen.no ' })
    assert.ok('match' in check && check.match?.id === 'amalie' && check.match.level === 1)
  })

  it('samme e-post kan aldri få to kontoer', () => {
    const withAccount = buildRoster(studentsWithPhotos, [amalieProfile])
    const again = checkNewStudent(withAccount, { name: 'Amalie Berg', email: 'AMALIE@teigen.no' })
    assert.ok('error' in again && again.error.includes('har allerede en konto'))
    assert.ok('error' in checkNewStudent(withAccount, { name: 'Noen Andre', email: 'amalie@teigen.no' }))
  })

  it('samme navn: avvises når eleven har konto, eller når eleven står i lista med en annen e-post', () => {
    const withAccount = buildRoster(studentsWithPhotos, [amalieProfile])
    assert.ok('error' in checkNewStudent(withAccount, { name: 'amalie berg', email: 'ny@teigen.no' }))
    const withoutAccount = checkNewStudent(list(), { name: 'Amalie Berg', email: 'ny@teigen.no' })
    assert.ok('error' in withoutAccount && withoutAccount.error.includes('amalie@teigen.no'))
    // E-posten til en elev i lista kan ikke brukes med et annet navn.
    assert.ok('error' in checkNewStudent(list(), { name: 'Sofie Lund', email: 'amalie@teigen.no' }))
  })

  it('elever uten e-post i lista kobles på navn; helt nye elever er lov', () => {
    const sofie = checkNewStudent(list(), { name: 'Sofie Lund', email: 'sofie@teigen.no' })
    assert.ok('match' in sofie && sofie.match?.id === 'sofie')
    const ny = checkNewStudent(list(), { name: 'Helt Ny', email: 'helt.ny@teigen.no' })
    assert.ok('match' in ny && ny.match === null)
  })

  it('en konto med riktig e-post vinner over en konto med samme navn, og en dobbel konto merkes', () => {
    const twin: UserProfile = { uid: 'uid-twin', name: 'Amalie Berg', email: 'amalie.b@teigen.no', role: 'student', classId: '4A' }
    // Dobbelkontoen står først i lista fra Firestore, men Amalie kobles likevel til kontoen med hennes e-post.
    const rows = buildRoster(studentsWithPhotos, [twin, amalieProfile])
    assert.equal(rows.find((r) => r.id === 'amalie')?.uid, AMALIE_UID)
    assert.equal(rows.find((r) => r.uid === 'uid-twin')?.duplicateOf, 'Amalie Berg')
    // Når begge har e-post og den er ulik, er det ikke samme elev.
    assert.equal(buildRoster(studentsWithPhotos, [twin]).find((r) => r.id === 'amalie')?.uid, undefined)
  })
})

describe('økta: venter, starter og avsluttes', () => {
  it('4. før økta er startet, venter Amalie og ser ikke oppgavene', () => {
    assert.equal(studentViewState(undefined, false), 'connecting')
    assert.equal(studentViewState(null, false), 'waiting')
    assert.equal(canDeliver(null, null), false)
    // Læreren har ikke startet: alle venter, ingen framdrift.
    const rows = classOverview(buildRoster(studentsWithPhotos, [amalieProfile]), [], null, tasks, false)
    assert.ok(rows.every((r) => r.summary.status === 'waiting' && r.summary.percent === 0))
  })

  it('5. læreren kan starte en valgt økt: den er aktiv og får en egen gjennomførings-ID', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage, [], () => 1000)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    assert.equal(runStateFor(live, SESSION), 'planned')
    assert.equal(await backend.startLiveSession(CLASS, SESSION), true)
    assert.equal(runStateFor(live, SESSION), 'running')
    assert.equal(runIdOf(live!), `${SESSION}-1000`)
    // En annen økt er fortsatt bare planlagt.
    assert.equal(runStateFor(live, 'okt-3'), 'planned')
  })

  it('6. etter oppstart får Amalie riktig økt og oppgavene på sitt nivå – uten å logge inn på nytt', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage)
    const seen: (LiveSession | null)[] = []
    backend.subscribeLiveSession(CLASS, (l) => seen.push(l), () => {})
    assert.equal(studentViewState(seen.at(-1), false), 'waiting')
    await backend.startLiveSession(CLASS, SESSION)
    const live = seen.at(-1)!
    assert.equal(live.sessionId, SESSION)
    assert.equal(studentViewState(live, true), 'tasks')
    const level = studentLevel(amalieProfile, roster)
    assert.deepEqual(
      tasks.filter((t) => t.level === level).map((t) => t.id),
      ['t1', 't2', 't3', 't4', 't5', 't6'],
    )
  })

  it('13. etter at læreren har avsluttet økta, kan Amalie ikke levere flere svar', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const runId = runIdOf(live!)
    const base = { studentId: AMALIE_UID, runId, sessionId: SESSION, level: 1 as const, total: 6 }
    assert.equal(await backend.saveDelivery(CLASS, base, 't1', deliveryOf(solved(level1[0] as Task))!), true)
    assert.equal(await backend.endLiveSession(CLASS), true)
    assert.equal(studentViewState(live, true), 'ended')
    assert.equal(canDeliver(live, runId), false)
    assert.equal(await backend.saveDelivery(CLASS, base, 't2', deliveryOf(solved(level1[1] as Task))!), false)
    // De endelige resultatene står igjen for læreren.
    let docs: ProgressDoc[] = []
    backend.subscribeRunProgress(CLASS, runId, (d) => (docs = d), () => {})
    assert.deepEqual(Object.keys(docs[0].delivered), ['t1'])
  })

  it('på pause kan eleven heller ikke levere', () => {
    const live = { ...newLiveSession(SESSION, 5), status: 'paused' as const }
    assert.equal(studentViewState(live, true), 'paused')
    assert.equal(canDeliver(live, runIdOf(live)), false)
  })

  it('firestore.rules lar eleven skrive sin egen framdrift bare mens akkurat denne gjennomføringen er i gang', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    const progress = rules.slice(rules.indexOf('match /progress/{docId}'))
    assert.match(progress, /allow read: if teacherOfClass\(classId\)/)
    // Reglene testes på ordentlig mot Firestore-emulatoren (server/firestoreRules.emulator.ts, npm run test:rules).
    assert.match(progress, /data\.studentId == request\.auth\.uid/)
    assert.match(progress, /live\.status == 'running'/)
    assert.match(progress, /live\.runId == data\.runId/)
    assert.match(progress, /allow delete: if false/)
  })
})

describe('levering og framdrift', () => {
  it('8. å bla forbi en oppgave, eller skrive uten å levere, øker ikke framdriften', () => {
    assert.equal(deliveryOf(undefined), null)
    assert.equal(deliveryOf({ ...initialMathState(), answer: '7' }), null)
    // Feil svar med forsøk igjen er ikke levert.
    const wrong = checkMathAnswer({ ...initialMathState(), answer: '99' }, level1[0] as Task)
    assert.equal(wrong.phase, 'answering')
    assert.equal(deliveryOf(wrong), null)
    assert.equal(deliveryOf({ ...initialTextState(), answer: 'skrevet, ikke levert' }), null)
    assert.equal(summarize({}, null, 6, true).percent, 0)
  })

  it('levert oppgave tar vare på om svaret var riktig eller feil; tekstsvar læreren vurderer, er levert uten retting', () => {
    assert.deepEqual(deliveryOf(solved(level1[0] as Task), 1), { correct: true, attempts: 1, at: 1 })
    let state = initialMathState()
    for (let i = 0; i < 3; i++) state = { ...checkMathAnswer({ ...state, answer: '99' }, level1[0] as Task), dialogOpen: false }
    assert.equal(state.phase, 'revealed')
    assert.deepEqual(deliveryOf(state, 2), { correct: false, attempts: 3, at: 2 })
    const text: TextTask = { kind: 'text', id: 'x', level: 1, text: 'Forklar.', solution: '', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
    const submitted = checkTextAnswer({ ...initialTextState(), answer: 'Fordi …' }, text)
    assert.deepEqual(deliveryOf(submitted, 3), { correct: null, attempts: 1, at: 3 })
  })

  it('9. tre av seks leverte oppgaver gir 50 %, og status følger framdriften', () => {
    assert.equal(percentOf(0, 6), 0)
    assert.equal(percentOf(3, 6), 50)
    assert.equal(percentOf(6, 6), 100)
    const d = (n: number) => Object.fromEntries(level1.slice(0, n).map((t) => [t.id, { correct: true, attempts: 1, at: 1 }]))
    assert.equal(summarize(d(0), null, 6, true).status, 'notStarted')
    assert.deepEqual({ ...summarize(d(3), null, 6, true) }, { done: 3, total: 6, percent: 50, correct: 3, wrong: 0, ungraded: 0, status: 'working' })
    assert.equal(summarize(d(6), null, 6, true).status, 'finished')
    assert.equal(summarize(d(6), null, 6, true).percent, 100)
  })

  it('7, 10 og 11. lærerens oversikt får Amalies leveringer med en gang, og bare Amalies framdrift endres', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage, [amalieProfile])
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const runId = runIdOf(live!)

    // Læreren lytter på gjennomføringen (som Firestore-lyttingen i LiveSessionPage).
    let docs: ProgressDoc[] = []
    let updates = 0
    backend.subscribeRunProgress(CLASS, runId, (d) => ((docs = d), updates++), () => {})
    let accounts: UserProfile[] = []
    backend.subscribeClassStudents(CLASS, (a) => (accounts = a), () => {})
    const overview = () => classOverview(buildRoster(studentsWithPhotos, accounts), docs, runId, tasks, true)

    // Like etter oppstart: alle står på 0 %, ikke startet.
    assert.ok(overview().every((r) => r.summary.percent === 0 && r.summary.status === 'notStarted'))

    const base = { studentId: AMALIE_UID, runId, sessionId: SESSION, level: 1 as const, total: 6 }
    for (const task of level1.slice(0, 3)) await backend.saveDelivery(CLASS, base, task.id, deliveryOf(solved(task as Task))!)
    assert.equal(updates, 4, 'læreren fikk én oppdatering per levering')

    const rows = overview()
    const amalie = rows.find((r) => r.student.name === 'Amalie Berg')!
    assert.equal(amalie.summary.done, 3)
    assert.equal(amalie.summary.percent, 50)
    assert.equal(amalie.summary.status, 'working')
    const others = rows.filter((r) => r.student.name !== 'Amalie Berg')
    assert.equal(others.length, roster.length - 1)
    assert.ok(others.every((r) => r.summary.percent === 0 && r.summary.done === 0 && r.summary.status === 'notStarted'))

    for (const task of level1.slice(3)) await backend.saveDelivery(CLASS, base, task.id, deliveryOf(solved(task as Task))!)
    const finished = overview().find((r) => r.student.name === 'Amalie Berg')!
    assert.equal(finished.summary.percent, 100)
    assert.equal(finished.summary.status, 'finished')
    assert.ok(overview().filter((r) => r.student.name !== 'Amalie Berg').every((r) => r.summary.percent === 0))
  })

  it('en annen elev som leverer, registreres på samme måte (ingenting er låst til Amalie)', () => {
    const sofie: UserProfile = { uid: 'uid-sofie', name: 'Sofie Lund', role: 'student', classId: '4A' }
    const runId = 'okt-1-2-1'
    const doc: ProgressDoc = { studentId: 'uid-sofie', runId, sessionId: SESSION, level: 1, total: 6, delivered: { t1: { correct: false, attempts: 3, at: 1 } }, updatedAt: 1 }
    const rows = classOverview(buildRoster(studentsWithPhotos, [amalieProfile, sofie]), [doc], runId, tasks, true)
    assert.equal(rows.find((r) => r.student.name === 'Sofie Lund')?.summary.done, 1)
    assert.equal(rows.find((r) => r.student.name === 'Sofie Lund')?.summary.wrong, 1)
    assert.equal(rows.find((r) => r.student.name === 'Amalie Berg')?.summary.done, 0)
  })

  it('12. svarene og hvor Amalie var, er der etter omlasting av siden', () => {
    const { storage } = memoryStorage()
    const key = answersKey(AMALIE_UID, 'okt-1-2-1')
    const answers = { t1: solved(level1[0] as Task), t2: { ...initialMathState(), answer: '4' } }
    saveRun(storage, key, { index: 1, answers })
    const restored = loadRun(storage, key)
    assert.equal(restored.index, 1)
    assert.deepEqual(restored.answers.t1, answers.t1)
    assert.equal(restored.answers.t2 && 'answer' in restored.answers.t2 && restored.answers.t2.answer, '4')
    assert.deepEqual(deliveredIds(restored, level1.map((t) => t.id)), ['t1'])
    // Ødelagte data gir en tom start i stedet for en feil.
    storage.setItem(key, '{ikke json')
    assert.deepEqual(loadRun(storage, key), { index: 0, answers: {} })
  })

  it('14. en ny økt arver ikke framdriften fra den forrige, men de gamle resultatene står igjen', async () => {
    let time = 1000
    const backend = createLocalLiveBackend(memoryStorage().storage, [amalieProfile], () => time)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const firstRun = runIdOf(live!)
    await backend.saveDelivery(CLASS, { studentId: AMALIE_UID, runId: firstRun, sessionId: SESSION, level: 1, total: 6 }, 't1', deliveryOf(solved(level1[0] as Task))!)
    await backend.endLiveSession(CLASS)

    time = 2000
    await backend.startLiveSession(CLASS, SESSION)
    const secondRun = runIdOf(live!)
    assert.notEqual(secondRun, firstRun)

    let firstDocs: ProgressDoc[] = []
    let secondDocs: ProgressDoc[] = []
    backend.subscribeRunProgress(CLASS, firstRun, (d) => (firstDocs = d), () => {})
    backend.subscribeRunProgress(CLASS, secondRun, (d) => (secondDocs = d), () => {})
    const roster4A = buildRoster(studentsWithPhotos, [amalieProfile])
    assert.equal(classOverview(roster4A, secondDocs, secondRun, tasks, true).find((r) => r.student.uid === AMALIE_UID)?.summary.done, 0)
    // Selv om alle dokumentene sendes inn, teller bare den aktuelle gjennomføringen.
    assert.equal(classOverview(roster4A, [...firstDocs, ...secondDocs], secondRun, tasks, true).find((r) => r.student.uid === AMALIE_UID)?.summary.done, 0)
    assert.equal(classOverview(roster4A, firstDocs, firstRun, tasks, false).find((r) => r.student.uid === AMALIE_UID)?.summary.done, 1)
    // Elevens lagrede svar har egen nøkkel per gjennomføring.
    assert.notEqual(answersKey(AMALIE_UID, firstRun), answersKey(AMALIE_UID, secondRun))
  })
})

describe('ingen falsk framdrift', () => {
  it('lærerens øktvisning har ingen simulering eller testframdrift lenger', () => {
    const page = readFileSync(new URL('../src/features/live/LiveSessionPage.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(page, /setInterval|Math\.random|initialProgress|SIMULATION/)
  })
})
