// Tester for den reelle flyten mellom lærer, aktiv økt, elevsvar og framdrift. Kjør: npm test
// Firebase brukes ikke her: den lokale backenden (localLiveBackend.ts) følger de samme reglene som firestore.rules,
// og lærer- og elevvisningen bruker de samme rene funksjonene (liveProgress.ts) som testes her.
// Testeleven er Nora Lie (nivå 3), som har kontoen nora@teigen.no i Firebase. Alle elevene er fiktive.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { roster, studentsClassId } from '../src/features/class/roster.ts'
import { checkProfile, unreadableProfile } from '../src/features/auth/profileCheck.ts'
import { authErrorMessage } from '../src/features/auth/authErrors.ts'
import { createLocalLiveBackend } from '../src/features/live/localLiveBackend.ts'
import { makeSnapshot, snapshotTasks } from '../src/features/live/liveSnapshot.ts'
import {
  answersKey,
  buildRoster,
  canDeliver,
  checkNewStudent,
  classOverview,
  deliveredIds,
  deliveryOf,
  effectiveStatus,
  isValidLive,
  LIVE_MAX_AGE_MS,
  levelsWithoutTasks,
  loadRun,
  missingLevelsText,
  newLiveSession,
  percentOf,
  runIdOf,
  runStateFor,
  sameName,
  saveRun,
  studentLevel,
  studentViewState,
  summarize,
  type LiveSession,
  type ProgressDoc,
  type StorageLike,
} from '../src/features/live/liveProgress.ts'
import { checkMathAnswer, checkTextAnswer, initialMathState, initialTextState } from '../src/features/student/studentTasks.ts'
import type { Level, SessionTask, Task, TextTask, UserProfile } from '../src/types/index.ts'

function memoryStorage() {
  const data = new Map<string, string>()
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
  return { storage, data }
}

// Noras elevkonto slik den ligger i Firestore (users/{uid}). Uten level på kontoen: nivået kommer fra klasselista (3).
const NORA_UID = 'uid-nora'
const noraProfile: UserProfile = { uid: NORA_UID, name: 'Nora Lie', email: 'nora@teigen.no', role: 'student', classId: '4A' }
const CLASS = '4A'
const SESSION = 'okt-1-2'

// Seks oppgaver på nivå 3 (Noras nivå) og to på nivå 1.
const math = (id: string, a: number, b: number, level: Level = 3): Task => ({ id, level, type: 'Hoderegning', instruction: 'Regn ut.', a, operator: '+', b })
const tasks: SessionTask[] = [
  math('t1', 1, 1),
  math('t2', 2, 2),
  math('t3', 3, 3),
  math('t4', 4, 4),
  math('t5', 5, 5),
  math('t6', 6, 6),
  math('n1-1', 10, 10, 1),
  math('n1-2', 20, 20, 1),
]
const level3 = tasks.filter((t) => t.level === 3)
const studentsWithPhotos = roster.map((s) => ({ ...s }))
const noraRow = (list: { name: string; id: string }[]) => list.findIndex((s) => s.id === 'nora')

/** Regnestykket levert med riktig svar. */
const solved = (task: Task) => checkMathAnswer({ ...initialMathState(), answer: String(task.a + task.b) }, task)

describe('Nora Lie – testelev i 4A', () => {
  it('1. Nora står i klasselista for 4A med e-posten sin, og kontoen hennes har rollen elev', () => {
    assert.equal(studentsClassId, '4A')
    const listed = roster.find((s) => s.name === 'Nora Lie')
    assert.equal(listed?.email, 'nora@teigen.no')
    const list = buildRoster(studentsWithPhotos, [noraProfile])
    assert.equal(list.length, roster.length, 'ingen ekstra rader – Nora står på sin vanlige plass')
    assert.equal(list[noraRow(roster)].uid, NORA_UID)
    assert.equal(noraProfile.role, 'student')
    assert.equal(noraProfile.classId, '4A')
  })

  it('1. kobles til sin vanlige plass også med små avvik i navnet eller uten e-post i profilen', () => {
    const variants: Partial<UserProfile>[] = [
      { name: 'nora lie' },
      { name: '  Nora   Lie ' },
      { name: 'NORA LIE', email: undefined },
      { name: 'Nora Lie', email: ' Nora@Teigen.no ' },
      // Skrivefeil i e-posten på profilen: ingen annen konto har nora@teigen.no, så navnet avgjør.
      { name: 'Nora Lie', email: 'nora.lie@teigen.no' },
      // Helt annet navn, men riktig e-post.
      { name: 'Nora L.', email: 'nora@teigen.no' },
    ]
    for (const variant of variants) {
      const profile = { ...noraProfile, ...variant }
      const list = buildRoster(studentsWithPhotos, [profile])
      assert.equal(list.length, roster.length, `ingen ekstra rad for ${JSON.stringify(variant)}`)
      assert.equal(list[noraRow(roster)].uid, NORA_UID, `koblet for ${JSON.stringify(variant)}`)
    }
  })

  it('1. uid i klasselista kobler sikrest: går foran både e-post og navn', () => {
    const withUid = studentsWithPhotos.map((s) => (s.id === 'nora' ? { ...s, uid: 'uid-ekte-nora', email: undefined } : s))
    const impostor: UserProfile = { uid: 'uid-annen', name: 'Nora Lie', role: 'student', classId: '4A' }
    const real: UserProfile = { uid: 'uid-ekte-nora', name: 'N. Lie', role: 'student', classId: '4A' }
    const list = buildRoster(withUid, [impostor, real])
    assert.equal(list[noraRow(roster)].uid, 'uid-ekte-nora')
    assert.equal(list.find((s) => s.uid === 'uid-annen')?.duplicateOf, 'Nora Lie')
  })

  it('2. Nora får nivå 3 fra klasselista, og et nivå på kontoen går foran', () => {
    assert.equal(roster.find((s) => s.id === 'nora')?.level, 3)
    assert.equal(studentLevel(noraProfile, roster), 3)
    assert.equal(studentLevel({ ...noraProfile, email: undefined, name: ' nora  lie' }, roster), 3)
    assert.equal(studentLevel({ ...noraProfile, level: 2 }, roster), 2)
    assert.equal(buildRoster(studentsWithPhotos, [{ ...noraProfile, level: 2 }])[noraRow(roster)].level, 2)
    // En elev som ikke står i lista, og uten nivå, starter på nivå 1.
    assert.equal(studentLevel({ name: 'Ukjent Elev', email: 'x@y.no' }, roster), 1)
    // Og oppgavene hun får, er nivå 3-oppgavene.
    assert.deepEqual(tasks.filter((t) => t.level === studentLevel(noraProfile, roster)).map((t) => t.id), ['t1', 't2', 't3', 't4', 't5', 't6'])
  })

  it('kontoer i klassen som ikke står i klasselista, kommer med til slutt (kan registreres på samme måte)', () => {
    const other: UserProfile = { uid: 'uid-ny', name: 'Ny Elev', email: 'ny@teigen.no', role: 'student', classId: '4A', level: 2 }
    const list = buildRoster(studentsWithPhotos, [noraProfile, other])
    assert.equal(list.at(-1)?.uid, 'uid-ny')
    assert.equal(list.at(-1)?.level, 2)
  })

  it('Amalie er ikke lenger i klasselista', () => {
    assert.equal(roster.some((s) => /amalie/i.test(s.name) || /amalie/i.test(s.email ?? '')), false)
  })
})

describe('ingen doble elever', () => {
  const list = () => buildRoster(studentsWithPhotos, [])

  it('en ny konto med Noras e-post kobles til Nora i klasselista, med nivået hennes', () => {
    const check = checkNewStudent(list(), { name: 'Nora Lie', email: 'Nora@Teigen.no ' })
    assert.ok('match' in check && check.match?.id === 'nora' && check.match.level === 3)
  })

  it('samme e-post kan aldri få to kontoer', () => {
    const withAccount = buildRoster(studentsWithPhotos, [noraProfile])
    const again = checkNewStudent(withAccount, { name: 'Nora Lie', email: 'NORA@teigen.no' })
    assert.ok('error' in again && again.error.includes('har allerede en konto'))
    assert.ok('error' in checkNewStudent(withAccount, { name: 'Noen Andre', email: 'nora@teigen.no' }))
  })

  it('samme navn: avvises når eleven har konto, eller når eleven står i lista med en annen e-post', () => {
    const withAccount = buildRoster(studentsWithPhotos, [noraProfile])
    assert.ok('error' in checkNewStudent(withAccount, { name: 'nora lie', email: 'ny@teigen.no' }))
    const withoutAccount = checkNewStudent(list(), { name: 'Nora Lie', email: 'ny@teigen.no' })
    assert.ok('error' in withoutAccount && withoutAccount.error.includes('nora@teigen.no'))
    // E-posten til en elev i lista kan ikke brukes med et annet navn.
    assert.ok('error' in checkNewStudent(list(), { name: 'Sofie Lund', email: 'nora@teigen.no' }))
  })

  it('elever uten e-post i lista kobles på navn; helt nye elever er lov', () => {
    const sofie = checkNewStudent(list(), { name: 'Sofie Lund', email: 'sofie@teigen.no' })
    assert.ok('match' in sofie && sofie.match?.id === 'sofie')
    const ny = checkNewStudent(list(), { name: 'Helt Ny', email: 'helt.ny@teigen.no' })
    assert.ok('match' in ny && ny.match === null)
  })

  it('en konto med riktig e-post vinner over en konto med samme navn, og en dobbel konto merkes', () => {
    const twin: UserProfile = { uid: 'uid-twin', name: 'Nora Lie', email: 'nora.l@teigen.no', role: 'student', classId: '4A' }
    // Dobbelkontoen står først i lista fra Firestore, men Nora kobles likevel til kontoen med hennes e-post.
    const rows = buildRoster(studentsWithPhotos, [twin, noraProfile])
    assert.equal(rows.find((r) => r.id === 'nora')?.uid, NORA_UID)
    assert.equal(rows.find((r) => r.uid === 'uid-twin')?.duplicateOf, 'Nora Lie')
    assert.equal(rows.length, roster.length + 1)
  })
})

describe('innlogging: tydelig beskjed om hva som mangler', () => {
  it('feil e-post eller passord', () => {
    assert.match(authErrorMessage({ code: 'auth/invalid-credential' }), /Feil e-post eller passord/)
    assert.match(authErrorMessage({ code: 'auth/user-disabled' }), /deaktivert/)
  })

  it('konto uten profil i users', () => {
    const check = checkProfile(NORA_UID, 'nora@teigen.no', null)
    assert.ok('problem' in check)
    assert.match(check.problem, /ingen profil/)
    assert.match(check.problem, /users\/uid-nora/)
    assert.match(check.problem, /nora@teigen\.no/)
  })

  it('profil som mangler role, classId eller name – med navnet på feltene som mangler', () => {
    const check = checkProfile(NORA_UID, null, { name: 'Nora Lie' })
    assert.ok('problem' in check)
    assert.match(check.problem, /role/)
    assert.match(check.problem, /classId/)
    assert.doesNotMatch(check.problem, /name \(/)
    const noName = checkProfile(NORA_UID, null, { role: 'student', classId: '4A', name: '  ' })
    assert.ok('problem' in noName && /name/.test(noName.problem))
    const badRole = checkProfile(NORA_UID, null, { name: 'Nora Lie', role: 'elev', classId: '4A' })
    assert.ok('problem' in badRole && /«student» eller «teacher»/.test(badRole.problem))
    const badLevel = checkProfile(NORA_UID, null, { name: 'Nora Lie', role: 'student', classId: '4A', level: '3' })
    assert.ok('problem' in badLevel && /level/.test(badLevel.problem))
  })

  it('en hel profil slipper inn; en profil som ikke kan leses, gir beskjed om reglene', () => {
    const check = checkProfile(NORA_UID, 'nora@teigen.no', { name: 'Nora Lie', email: 'nora@teigen.no', role: 'student', classId: '4A' })
    assert.ok('profile' in check)
    assert.deepEqual(check.profile, noraProfile)
    assert.match(unreadableProfile(NORA_UID, 'permission-denied'), /firestore\.rules/)
  })
})

describe('økta: venter, starter og avsluttes', () => {
  it('3. før økta er startet, venter Nora og ser ikke oppgavene', () => {
    assert.equal(studentViewState(undefined, false), 'connecting')
    assert.equal(studentViewState(null, false), 'waiting')
    assert.equal(canDeliver(null, null), false)
    // Læreren har ikke startet: alle venter, ingen framdrift.
    const rows = classOverview(buildRoster(studentsWithPhotos, [noraProfile]), [], null, tasks, false)
    assert.ok(rows.every((r) => r.summary.status === 'waiting' && r.summary.percent === 0))
  })

  it('4. læreren kan starte en valgt økt: den er aktiv og får en egen gjennomførings-ID', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage, [], () => 1000)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    assert.equal(runStateFor(live, SESSION, 1000), 'planned')
    assert.equal(await backend.startLiveSession(CLASS, SESSION), true)
    assert.equal(runStateFor(live, SESSION, 1000), 'running')
    assert.equal(runIdOf(live!), `${SESSION}-1000`)
    // En annen økt er fortsatt bare planlagt.
    assert.equal(runStateFor(live, 'okt-3', 1000), 'planned')
  })

  it('4. etter oppstart får Nora riktig økt og nivå 3-oppgavene – uten å logge inn på nytt', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage)
    const seen: (LiveSession | null)[] = []
    backend.subscribeLiveSession(CLASS, (l) => seen.push(l), () => {})
    assert.equal(studentViewState(seen.at(-1), false), 'waiting')
    await backend.startLiveSession(CLASS, SESSION)
    const live = seen.at(-1)!
    assert.equal(live.sessionId, SESSION)
    assert.equal(studentViewState(live, true), 'tasks')
    const level = studentLevel(noraProfile, roster)
    assert.deepEqual(
      tasks.filter((t) => t.level === level).map((t) => t.id),
      ['t1', 't2', 't3', 't4', 't5', 't6'],
    )
  })

  it('10. etter at læreren har avsluttet økta, kan Nora ikke levere flere svar', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const runId = runIdOf(live!)
    const base = { studentId: NORA_UID, runId, sessionId: SESSION, level: 3 as const, total: 6 }
    assert.equal(await backend.saveDelivery(CLASS, base, 't1', deliveryOf(solved(level3[0] as Task))!), true)
    assert.equal(await backend.endLiveSession(CLASS), true)
    assert.equal(studentViewState(live, true), 'ended')
    assert.equal(canDeliver(live, runId), false)
    assert.equal(await backend.saveDelivery(CLASS, base, 't2', deliveryOf(solved(level3[1] as Task))!), false)
    // De endelige resultatene står igjen for læreren.
    let docs: ProgressDoc[] = []
    backend.subscribeRunProgress(CLASS, runId, (d) => (docs = d), () => {})
    assert.deepEqual(Object.keys(docs[0].delivered), ['t1'])
  })

  it('på pause kan eleven heller ikke levere', () => {
    const live = { ...newLiveSession(SESSION, 5), status: 'paused' as const }
    assert.equal(studentViewState(live, true, false, 5), 'paused')
    assert.equal(canDeliver(live, runIdOf(live), 5), false)
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
  it('5. å bla forbi en oppgave, eller skrive uten å levere, øker ikke framdriften', () => {
    assert.equal(deliveryOf(undefined), null)
    assert.equal(deliveryOf({ ...initialMathState(), answer: '7' }), null)
    // Feil svar med forsøk igjen er ikke levert.
    const wrong = checkMathAnswer({ ...initialMathState(), answer: '99' }, level3[0] as Task)
    assert.equal(wrong.phase, 'answering')
    assert.equal(deliveryOf(wrong), null)
    assert.equal(deliveryOf({ ...initialTextState(), answer: 'skrevet, ikke levert' }), null)
    assert.equal(summarize({}, null, 6, true).percent, 0)
  })

  it('levert oppgave tar vare på om svaret var riktig eller feil; tekstsvar læreren vurderer, er levert uten retting', () => {
    const right = solved(level3[0] as Task)
    assert.deepEqual(deliveryOf(right, 1), { correct: true, attempts: 1, at: 1, answer: right.answer })
    let state = initialMathState()
    for (let i = 0; i < 3; i++) state = { ...checkMathAnswer({ ...state, answer: '99' }, level3[0] as Task), dialogOpen: false }
    assert.equal(state.phase, 'revealed')
    assert.deepEqual(deliveryOf(state, 2), { correct: false, attempts: 3, at: 2, answer: '99' })
    const text: TextTask = { kind: 'text', id: 'x', level: 1, text: 'Forklar.', solution: '', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
    const submitted = checkTextAnswer({ ...initialTextState(), answer: 'Fordi …' }, text)
    assert.deepEqual(deliveryOf(submitted, 3), { correct: null, attempts: 1, at: 3, answer: 'Fordi …' })
  })

  it('6. tre av seks leverte oppgaver gir 50 %, seks av seks 100 % og «Fullført»', () => {
    assert.equal(percentOf(0, 6), 0)
    assert.equal(percentOf(3, 6), 50)
    assert.equal(percentOf(6, 6), 100)
    const d = (n: number) => Object.fromEntries(level3.slice(0, n).map((t) => [t.id, { correct: true, attempts: 1, at: 1 }]))
    assert.equal(summarize(d(0), null, 6, true).status, 'notStarted')
    assert.deepEqual({ ...summarize(d(3), null, 6, true) }, { done: 3, total: 6, percent: 50, correct: 3, wrong: 0, ungraded: 0, status: 'working' })
    assert.equal(summarize(d(6), null, 6, true).status, 'finished')
    assert.equal(summarize(d(6), null, 6, true).percent, 100)
  })

  it('5, 7 og 8. lærerens oversikt får Noras leveringer med en gang, og bare Noras framdrift endres', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage, [noraProfile])
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

    const base = { studentId: NORA_UID, runId, sessionId: SESSION, level: 3 as const, total: 6 }
    for (const task of level3.slice(0, 3)) await backend.saveDelivery(CLASS, base, task.id, deliveryOf(solved(task as Task))!)
    assert.equal(updates, 4, 'læreren fikk én oppdatering per levering')

    const rows = overview()
    const nora = rows.find((r) => r.student.name === 'Nora Lie')!
    assert.equal(nora.summary.done, 3)
    assert.equal(nora.summary.percent, 50)
    assert.equal(nora.summary.status, 'working')
    const others = rows.filter((r) => r.student.name !== 'Nora Lie')
    assert.equal(others.length, roster.length - 1)
    assert.ok(others.every((r) => r.summary.percent === 0 && r.summary.done === 0 && r.summary.status === 'notStarted'))

    for (const task of level3.slice(3)) await backend.saveDelivery(CLASS, base, task.id, deliveryOf(solved(task as Task))!)
    const finished = overview().find((r) => r.student.name === 'Nora Lie')!
    assert.equal(finished.summary.percent, 100)
    assert.equal(finished.summary.status, 'finished')
    assert.ok(overview().filter((r) => r.student.name !== 'Nora Lie').every((r) => r.summary.percent === 0))
  })

  it('en annen elev som leverer, registreres på samme måte (ingenting er låst til Nora)', () => {
    const sofie: UserProfile = { uid: 'uid-sofie', name: 'Sofie Lund', role: 'student', classId: '4A' }
    const runId = 'okt-1-2-1'
    const doc: ProgressDoc = { studentId: 'uid-sofie', runId, sessionId: SESSION, level: 1, total: 6, delivered: { t1: { correct: false, attempts: 3, at: 1 } }, updatedAt: 1 }
    const rows = classOverview(buildRoster(studentsWithPhotos, [noraProfile, sofie]), [doc], runId, tasks, true)
    assert.equal(rows.find((r) => r.student.name === 'Sofie Lund')?.summary.done, 1)
    assert.equal(rows.find((r) => r.student.name === 'Sofie Lund')?.summary.wrong, 1)
    assert.equal(rows.find((r) => r.student.name === 'Nora Lie')?.summary.done, 0)
  })

  it('9. svarene og hvor Nora var, er der etter omlasting av siden', () => {
    const { storage } = memoryStorage()
    const key = answersKey(NORA_UID, 'okt-1-2-1')
    const answers = { t1: solved(level3[0] as Task), t2: { ...initialMathState(), answer: '4' } }
    saveRun(storage, key, { index: 1, answers })
    const restored = loadRun(storage, key)
    assert.equal(restored.index, 1)
    assert.deepEqual(restored.answers.t1, answers.t1)
    assert.equal(restored.answers.t2 && 'answer' in restored.answers.t2 && restored.answers.t2.answer, '4')
    assert.deepEqual(deliveredIds(restored, level3.map((t) => t.id)), ['t1'])
    // Ødelagte data gir en tom start i stedet for en feil.
    storage.setItem(key, '{ikke json')
    assert.deepEqual(loadRun(storage, key), { index: 0, answers: {} })
  })

  it('11. en ny økt arver ikke framdriften fra den forrige, men de gamle resultatene står igjen', async () => {
    let time = 1000
    const backend = createLocalLiveBackend(memoryStorage().storage, [noraProfile], () => time)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const firstRun = runIdOf(live!)
    await backend.saveDelivery(CLASS, { studentId: NORA_UID, runId: firstRun, sessionId: SESSION, level: 3, total: 6 }, 't1', deliveryOf(solved(level3[0] as Task))!)
    await backend.endLiveSession(CLASS)

    time = 2000
    await backend.startLiveSession(CLASS, SESSION)
    const secondRun = runIdOf(live!)
    assert.notEqual(secondRun, firstRun)

    let firstDocs: ProgressDoc[] = []
    let secondDocs: ProgressDoc[] = []
    backend.subscribeRunProgress(CLASS, firstRun, (d) => (firstDocs = d), () => {})
    backend.subscribeRunProgress(CLASS, secondRun, (d) => (secondDocs = d), () => {})
    const roster4A = buildRoster(studentsWithPhotos, [noraProfile])
    assert.equal(classOverview(roster4A, secondDocs, secondRun, tasks, true).find((r) => r.student.uid === NORA_UID)?.summary.done, 0)
    // Selv om alle dokumentene sendes inn, teller bare den aktuelle gjennomføringen.
    assert.equal(classOverview(roster4A, [...firstDocs, ...secondDocs], secondRun, tasks, true).find((r) => r.student.uid === NORA_UID)?.summary.done, 0)
    assert.equal(classOverview(roster4A, firstDocs, firstRun, tasks, false).find((r) => r.student.uid === NORA_UID)?.summary.done, 1)
    // Elevens lagrede svar har egen nøkkel per gjennomføring.
    assert.notEqual(answersKey(NORA_UID, firstRun), answersKey(NORA_UID, secondRun))
  })
})

describe('økt uten oppgaver på elevens nivå', () => {
  it('12. læreren får en advarsel når økta mangler oppgaver på nivå 3, med elevene det gjelder', () => {
    const onlyLevel1 = tasks.filter((t) => t.level === 1)
    const missing = levelsWithoutTasks(buildRoster(studentsWithPhotos, [noraProfile]), onlyLevel1)
    assert.deepEqual(missing.map((m) => m.level), [2, 3])
    const level3Missing = missing.find((m) => m.level === 3)!
    assert.ok(level3Missing.students.includes('Nora Lie'))
    const [, text3] = missingLevelsText(missing)
    assert.match(text3, /^Økta har ingen oppgaver på nivå 3\. .*Nora Lie.* får ingen oppgaver\.$/)
    // Nivået på kontoen teller: flyttes Nora til nivå 1, gjelder advarselen ikke henne lenger.
    const moved = levelsWithoutTasks(buildRoster(studentsWithPhotos, [{ ...noraProfile, level: 1 }]), onlyLevel1)
    assert.ok(!moved.find((m) => m.level === 3)?.students.includes('Nora Lie'))
    // Alle nivåene har oppgaver: ingen advarsel.
    assert.deepEqual(levelsWithoutTasks(roster, [math('a', 1, 1, 1), math('b', 1, 1, 2), math('c', 1, 1, 3)]), [])
  })

  it('12. advarselen vises på øktsiden og i «Følg elevenes arbeid», og eleven får en melding i stedet for en tom side', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(read('../src/features/sessions/SessionPage.tsx'), /<MissingLevelsWarning/)
    assert.match(read('../src/features/live/LiveSessionPage.tsx'), /<MissingLevelsWarning/)
    assert.match(read('../src/features/student/StudentHomePage.tsx'), /tasks\.length === 0 \?[\s\S]*Økten har ingen oppgaver på nivå \$\{level\}/)
  })
})

describe('elevvisningen styres helt av økta læreren har startet', () => {
  const HOUR = 60 * 60 * 1000
  const T = 1_800_000_000_000

  it('1. uten aktiv økt ser eleven venteskjermen og ingen oppgaver – også med et gammelt eller ugyldig økt-dokument', () => {
    assert.equal(studentViewState(null, true, false, T), 'waiting')
    // En økt som står som i gang, men ble startet for over 4 timer siden (læreren glemte å avslutte den).
    const forgotten = newLiveSession('multiplikasjon-1', T - 5 * HOUR)
    assert.equal(studentViewState(forgotten, true, false, T), 'waiting')
    assert.equal(canDeliver(forgotten, runIdOf(forgotten), T), false)
    assert.equal(effectiveStatus(forgotten, T), 'ended')
    // Dokument fra en eldre versjon av appen: uten status eller med en ukjent status.
    const old = { sessionId: 'multiplikasjon-1', startedAt: T } as unknown as LiveSession
    assert.equal(isValidLive(old), false)
    assert.equal(studentViewState(old, true, false, T), 'waiting')
    assert.equal(studentViewState({ ...old, status: 'started' } as unknown as LiveSession, true, false, T), 'waiting')
    // En avsluttet økt fra en tidligere dag: venter (ikke «Økten er avsluttet»).
    assert.equal(studentViewState({ ...newLiveSession(SESSION, T - 30 * HOUR), status: 'ended', endedAt: T - 29 * HOUR }, true, false, T), 'waiting')
    assert.equal(LIVE_MAX_AGE_MS, 4 * HOUR)
  })

  it('1. læreren ser en glemt økt som avsluttet, ikke som i gang', () => {
    const forgotten = newLiveSession('multiplikasjon-1', T - 5 * HOUR)
    assert.equal(runStateFor(forgotten, 'multiplikasjon-1', T), 'ended')
    assert.equal(runStateFor(forgotten, 'multiplikasjon-7', T), 'planned')
  })

  it('2. når læreren starter en økt, bytter elevvisningen fra venteskjermen til oppgavene', async () => {
    let time = T
    const backend = createLocalLiveBackend(memoryStorage().storage, [noraProfile], () => time)
    const views: string[] = []
    backend.subscribeLiveSession(CLASS, (live) => views.push(studentViewState(live, true, false, time)), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    time += HOUR
    assert.deepEqual(views, ['waiting', 'tasks'])
  })

  it('3. eleven får nøyaktig økta læreren startet – navnet og oppgavene fra lærerens start, ikke økt 1', async () => {
    const teacherTasks: SessionTask[] = [math('egen-1', 7, 8, 3), math('egen-2', 9, 9, 3), math('lav', 1, 1, 1)]
    const session = { id: 'multiplikasjon-7', title: 'Multiplikasjon', numbers: [7], topicId: 'multiplikasjon', skillIds: ['gange'] }
    const backend = createLocalLiveBackend(memoryStorage().storage, [noraProfile], () => T)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, session.id, makeSnapshot(session, teacherTasks))

    assert.equal(live!.sessionId, 'multiplikasjon-7')
    assert.equal(live!.label, 'Multiplikasjon økt 7')
    assert.equal(live!.topicId, 'multiplikasjon')
    const tasksForNora = snapshotTasks(live)!.filter((t) => t.level === studentLevel(noraProfile, roster))
    assert.deepEqual(tasksForNora.map((t) => t.id), ['egen-1', 'egen-2'])
    // Elevsiden bruker økta fra lærerens start, ikke en standardøkt.
    const page = readFileSync(new URL('../src/features/student/StudentHomePage.tsx', import.meta.url), 'utf8')
    assert.match(page, /sessions\.find\(\(s\) => s\.id === live\.sessionId\)/)
    assert.match(page, /snapshotTasks\(live\)/)
    assert.doesNotMatch(page, /sessions\[0\]/)
    // Eldre dokumenter uten oppgaver: ingen utdrag, eleven bruker sin egen kopi av akkurat den økta.
    assert.equal(snapshotTasks(newLiveSession(SESSION, T)), null)
  })

  it('4. nora@teigen.no kobles til «Nora L» i klasselista for 4A – på e-post, og på forkortet navn uten e-post', () => {
    const listed = roster.find((s) => s.id === 'nora')!
    assert.equal(listed.email, 'nora@teigen.no')
    assert.ok(sameName(listed.name, 'Nora L'))
    assert.ok(sameName(listed.name, 'nora l.'))
    assert.ok(!sameName(listed.name, 'Nora K'))
    for (const profile of [
      { ...noraProfile, name: 'Nora L' },
      { ...noraProfile, name: 'Nora L', email: undefined },
      { ...noraProfile, name: 'Nora L.', email: 'NORA@teigen.no' },
    ]) {
      const list = buildRoster(studentsWithPhotos, [profile])
      assert.equal(list.length, roster.length, `ingen ny elev for ${JSON.stringify(profile)}`)
      assert.equal(list.find((s) => s.id === 'nora')?.uid, NORA_UID)
    }
    assert.equal(studentLevel({ name: 'Nora L' }, roster), 3)
    // Profilen får e-posten fra innloggingen når Firestore-dokumentet mangler den.
    const check = checkProfile(NORA_UID, 'nora@teigen.no', { name: 'Nora L', role: 'student', classId: '4A' })
    assert.ok('profile' in check && check.profile.email === 'nora@teigen.no')
  })

  it('6. pause viser pauseskjermen, og når læreren fortsetter, er eleven på samme oppgave', async () => {
    const { storage } = memoryStorage()
    const backend = createLocalLiveBackend(storage, [noraProfile], () => T)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const key = answersKey(NORA_UID, runIdOf(live!))
    saveRun(storage, key, { index: 3, answers: { t1: solved(level3[0] as Task) } })

    await backend.setLiveStatus(CLASS, 'paused')
    assert.equal(studentViewState(live, true, false, T), 'paused')
    assert.equal(canDeliver(live, runIdOf(live!), T), false)
    await backend.setLiveStatus(CLASS, 'running')
    assert.equal(studentViewState(live, true, false, T), 'tasks')
    // Samme gjennomføring, så det lagrede (oppgave 4, og det som er levert) hentes igjen.
    assert.equal(answersKey(NORA_UID, runIdOf(live!)), key)
    assert.equal(loadRun(storage, key).index, 3)
  })

  it('7. etter avslutning ser eleven avslutningsskjermen og kan ikke levere', async () => {
    const backend = createLocalLiveBackend(memoryStorage().storage, [noraProfile], () => T)
    let live: LiveSession | null = null
    backend.subscribeLiveSession(CLASS, (l) => (live = l), () => {})
    await backend.startLiveSession(CLASS, SESSION)
    const runId = runIdOf(live!)
    await backend.endLiveSession(CLASS)
    assert.equal(studentViewState(live, true, false, T), 'ended')
    const base = { studentId: NORA_UID, runId, sessionId: SESSION, level: 3 as const, total: 6 }
    assert.equal(await backend.saveDelivery(CLASS, base, 't1', deliveryOf(solved(level3[0] as Task))!), false)
  })

  it('venter, pause og avsluttet bruker tavla fra Figma med hver sin tekst', () => {
    const screens = readFileSync(new URL('../src/features/student/StatusScreens.tsx', import.meta.url), 'utf8')
    assert.match(screens, /waiting: 'Venter på at læreren skal starte økten'/)
    assert.match(screens, /paused: 'Følg med på læreren'/)
    assert.match(screens, /ended: 'Økten er avsluttet'/)
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    assert.match(rules, /request\.time\.toMillis\(\) - live\.startedAt < 4 \* 60 \* 60 \* 1000/)
  })
})

describe('ingen falsk framdrift', () => {
  it('lærerens øktvisning har ingen simulering eller testframdrift lenger', () => {
    const page = readFileSync(new URL('../src/features/live/LiveSessionPage.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(page, /setInterval|Math\.random|initialProgress|SIMULATION/)
  })
})
