// Tester for firestore.rules mot Firestore-emulatoren (ekte regelmotor, ingen ekte data). Kjør: npm run test:rules
// Krever Java. Prosjekt-ID-en begynner med «demo-», så emulatoren kobler seg aldri til et ekte Firebase-prosjekt.
// Alle brukerne er fiktive.

import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const RUN = 'okt-1-2-1000'
const SESSION = 'okt-1-2'
let env: RulesTestEnvironment

const progress = (studentId: string, extra: Record<string, unknown> = {}) => ({
  studentId,
  runId: RUN,
  sessionId: SESSION,
  level: 1,
  total: 5,
  delivered: { t1: { correct: true, attempts: 1, at: 1 } },
  updatedAt: 1,
  ...extra,
})

/** Brukere og økt som finnes før hver test (skrevet uten regler). */
async function seed(live: Record<string, unknown> | null = { sessionId: SESSION, status: 'running', startedAt: 1000, runId: RUN }) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/laerer4a'), { name: 'Lærer A', role: 'teacher', classId: '4A' })
    await setDoc(doc(db, 'users/laerer4b'), { name: 'Lærer B', role: 'teacher', classId: '4B' })
    await setDoc(doc(db, 'users/amalie'), { name: 'Amalie Berg', email: 'amalie@teigen.no', role: 'student', classId: '4A', level: 1 })
    await setDoc(doc(db, 'users/sofie'), { name: 'Sofie Lund', role: 'student', classId: '4A' })
    await setDoc(doc(db, 'users/elev4b'), { name: 'Elev B', role: 'student', classId: '4B' })
    if (live) await setDoc(doc(db, 'liveSessions/4A'), live)
  })
}

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const amalieDoc = (uid = 'amalie') => doc(as(uid), `liveSessions/4A/progress/${RUN}__amalie`)

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-laerestien',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 },
  })
})
beforeEach(async () => {
  await env.clearFirestore()
  await seed()
})
after(async () => {
  await env.cleanup()
})

describe('økta (liveSessions)', () => {
  it('bare læreren i klassen kan starte, pause og avslutte økta', async () => {
    await assertSucceeds(setDoc(doc(as('laerer4a'), 'liveSessions/4A'), { sessionId: SESSION, status: 'running', startedAt: 2, runId: 'okt-1-2-2' }))
    await assertSucceeds(updateDoc(doc(as('laerer4a'), 'liveSessions/4A'), { status: 'paused' }))
    await assertSucceeds(updateDoc(doc(as('laerer4a'), 'liveSessions/4A'), { status: 'ended', endedAt: 3 }))
    await assertFails(updateDoc(doc(as('laerer4b'), 'liveSessions/4A'), { status: 'ended' }))
    await assertFails(updateDoc(doc(as('amalie'), 'liveSessions/4A'), { status: 'ended' }))
    await assertFails(setDoc(doc(as('amalie'), 'liveSessions/4A'), { sessionId: SESSION, status: 'running', startedAt: 9, runId: 'x' }))
  })

  it('økta kan ikke få en ukjent status', async () => {
    await assertFails(updateDoc(doc(as('laerer4a'), 'liveSessions/4A'), { status: 'hacket' }))
  })

  it('elevene i klassen kan se økta, elever i andre klasser kan ikke', async () => {
    await assertSucceeds(getDoc(doc(as('amalie'), 'liveSessions/4A')))
    await assertFails(getDoc(doc(as('elev4b'), 'liveSessions/4A')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'liveSessions/4A')))
  })
})

describe('framdrift (liveSessions/{klasse}/progress)', () => {
  it('Amalie kan skrive sin egen framdrift mens økta er i gang, og legge til leveringer', async () => {
    await assertSucceeds(setDoc(amalieDoc(), progress('amalie')))
    await assertSucceeds(setDoc(amalieDoc(), progress('amalie', { delivered: { t2: { correct: false, attempts: 3, at: 2 } }, updatedAt: 2 }), { merge: true }))
  })

  it('Amalie kan ikke skrive for en annen elev eller under et annet dokumentnavn', async () => {
    await assertFails(setDoc(doc(as('amalie'), `liveSessions/4A/progress/${RUN}__sofie`), progress('sofie')))
    await assertFails(setDoc(doc(as('amalie'), `liveSessions/4A/progress/${RUN}__sofie`), progress('amalie')))
    await assertFails(setDoc(doc(as('amalie'), 'liveSessions/4A/progress/noe-annet'), progress('amalie')))
    // En elev i en annen klasse kan ikke skrive i 4A.
    await assertFails(setDoc(doc(as('elev4b'), `liveSessions/4A/progress/${RUN}__elev4b`), progress('elev4b')))
  })

  it('ingen levering når økta er på pause, avsluttet, ikke startet, eller er en annen gjennomføring/økt', async () => {
    for (const live of [
      { sessionId: SESSION, status: 'paused', startedAt: 1000, runId: RUN },
      { sessionId: SESSION, status: 'ended', startedAt: 1000, runId: RUN, endedAt: 2000 },
      { sessionId: SESSION, status: 'running', startedAt: 3000, runId: 'okt-1-2-3000' },
      { sessionId: 'okt-3', status: 'running', startedAt: 1000, runId: RUN },
    ]) {
      await env.clearFirestore()
      await seed(live)
      await assertFails(setDoc(amalieDoc(), progress('amalie')))
    }
    await env.clearFirestore()
    await seed(null)
    await assertFails(setDoc(amalieDoc(), progress('amalie')))
  })

  it('nivået må være nivået på kontoen, og ingen ekstra felt (f.eks. svartekst) eller urimelige tall', async () => {
    await assertFails(setDoc(amalieDoc(), progress('amalie', { level: 3 })))
    await assertFails(setDoc(amalieDoc(), progress('amalie', { answerText: 'Amalie skrev 42' })))
    await assertFails(setDoc(amalieDoc(), progress('amalie', { total: -1 })))
    await assertFails(setDoc(amalieDoc(), progress('amalie', { total: 1000 })))
    // Uten nivå på kontoen (Sofie) godtas nivået eleven fikk oppgaver på.
    await assertSucceeds(setDoc(doc(as('sofie'), `liveSessions/4A/progress/${RUN}__sofie`), progress('sofie', { level: 1 })))
  })

  it('en levert oppgave kan ikke fjernes igjen', async () => {
    await assertSucceeds(setDoc(amalieDoc(), progress('amalie')))
    await assertFails(setDoc(amalieDoc(), progress('amalie', { delivered: {} })))
  })

  it('bare læreren i klassen kan lese framdriften – ikke elevene (heller ikke sin egen) eller andre lærere', async () => {
    await assertSucceeds(setDoc(amalieDoc(), progress('amalie')))
    await assertSucceeds(getDoc(doc(as('laerer4a'), `liveSessions/4A/progress/${RUN}__amalie`)))
    await assertFails(getDoc(doc(as('sofie'), `liveSessions/4A/progress/${RUN}__amalie`)))
    await assertFails(getDoc(doc(as('amalie'), `liveSessions/4A/progress/${RUN}__amalie`)))
    await assertFails(getDoc(doc(as('laerer4b'), `liveSessions/4A/progress/${RUN}__amalie`)))
  })

  it('læreren kan ikke skrive framdrift for elevene', async () => {
    await assertFails(setDoc(doc(as('laerer4a'), `liveSessions/4A/progress/${RUN}__laerer4a`), progress('laerer4a')))
  })
})

describe('elevprofiler (users)', () => {
  it('eleven kan ikke endre sitt eget nivå eller sin egen profil', async () => {
    await assertFails(updateDoc(doc(as('amalie'), 'users/amalie'), { level: 3 }))
    await assertFails(updateDoc(doc(as('amalie'), 'users/amalie'), { role: 'teacher' }))
  })

  it('læreren i klassen kan endre nivået, men ikke flytte eleven; andre lærere kan ingenting', async () => {
    await assertSucceeds(updateDoc(doc(as('laerer4a'), 'users/amalie'), { level: 2 }))
    await assertFails(updateDoc(doc(as('laerer4a'), 'users/amalie'), { classId: '4B' }))
    await assertFails(updateDoc(doc(as('laerer4b'), 'users/amalie'), { level: 3 }))
  })

  it('eleven kan lese sin egen profil, men ikke andre elevers', async () => {
    await assertSucceeds(getDoc(doc(as('amalie'), 'users/amalie')))
    await assertFails(getDoc(doc(as('amalie'), 'users/sofie')))
  })

  it('læreren lager elevprofiler i egen klasse (med nivå fra klasselista), eleven kan ikke lage profiler', async () => {
    await assertSucceeds(setDoc(doc(as('laerer4a'), 'users/ny'), { name: 'Ny Elev', email: 'ny@teigen.no', role: 'student', classId: '4A', level: 1 }))
    await assertFails(setDoc(doc(as('laerer4a'), 'users/ny2'), { name: 'Ny Elev', role: 'student', classId: '4B' }))
    await assertFails(setDoc(doc(as('amalie'), 'users/ny3'), { name: 'Falsk', role: 'student', classId: '4A' }))
  })
})
