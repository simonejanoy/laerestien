// Tester for lagring av oppgavesettene i nettleseren (prototype). Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { AiTaskMeta } from '../src/ai/contract.ts'
import {
  STORAGE_NOTICES,
  TASK_STORAGE_KEY,
  loadTaskSets,
  parseTaskSets,
  saveTaskSets,
  serializeTaskSets,
  type StorageLike,
} from '../src/features/sessions/taskStorage.ts'
import type { SessionTask } from '../src/types/index.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
  return { storage, data }
}

const aiMeta: AiTaskMeta = {
  model: 'gemini-3.8-flash',
  rulesVersion: '6',
  referenceIds: ['M2-N1-01', 'M2-N1-02'],
  requestId: 'req-1',
  createdAt: '2026-11-10T09:00:00.000Z',
  area: 'tabell-6-7-8-9',
  level: 1,
  format: 'regnestykke',
  fallbackUsed: true,
  referenceSeed: 42,
}

const sets: Record<string, SessionTask[]> = {
  'multiplikasjon-6': [
    { id: 'a', level: 1, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8, source: 'worksheet' },
    { id: 'b', level: 1, type: 'Hoderegning', instruction: 'Regn ut.', a: 3, operator: '*', b: 9, aiGenerated: true, reviewed: false, aiMeta },
    {
      kind: 'text',
      id: 'c',
      level: 2,
      text: 'Se på figuren.',
      solution: '12',
      competenceGoal: '',
      adaptation: '',
      aiGenerated: false,
      reviewed: false,
      figure: { kind: 'grid', rows: ['###', '###'] },
      source: 'teacher',
    },
  ],
}

describe('lokal lagring av oppgavesett', () => {
  it('lagres og leses inn igjen likt, med AI-metadata', () => {
    const { storage, data } = memoryStorage()
    assert.equal(saveTaskSets(storage, sets), null)
    assert.ok(data.has(TASK_STORAGE_KEY))
    const loaded = loadTaskSets(storage)
    assert.equal(loaded.notice, null)
    assert.deepEqual(loaded.sets, sets)
    assert.deepEqual((loaded.sets['multiplikasjon-6'][1] as { aiMeta?: AiTaskMeta }).aiMeta, aiMeta)
  })

  it('ødelagte data gir standardoppgavene og en kort beskjed', () => {
    for (const raw of ['{ikke json', '[]', '{"version":1}', '{"version":1,"sessions":{"x":"ikke en liste"}}']) {
      const loaded = parseTaskSets(raw)
      assert.deepEqual(loaded.sets, {}, raw)
      assert.equal(loaded.notice, STORAGE_NOTICES.corrupt, raw)
    }
  })

  it('ukjent versjon brukes ikke', () => {
    const loaded = parseTaskSets(JSON.stringify({ version: 99, sessions: { x: [] } }))
    assert.deepEqual(loaded.sets, {})
    assert.equal(loaded.notice, STORAGE_NOTICES.unknownVersion)
  })

  it('ugyldige oppgaver hoppes over, resten beholdes', () => {
    const raw = JSON.stringify({ version: 1, sessions: { x: [{ id: 'ok', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 2, operator: '*', b: 3 }, { id: 'feil', level: 7 }, 'tekst'] } })
    assert.deepEqual(parseTaskSets(raw).sets.x.map((t) => t.id), ['ok'])
  })

  it('blokkert lagring: appen virker med standardoppgavene og læreren får beskjed', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    assert.deepEqual(loadTaskSets(throwing), { sets: {}, notice: STORAGE_NOTICES.blocked })
    assert.deepEqual(loadTaskSets(null), { sets: {}, notice: STORAGE_NOTICES.blocked })
    assert.equal(saveTaskSets(throwing, sets), STORAGE_NOTICES.saveFailed)
    assert.equal(saveTaskSets(null, sets), STORAGE_NOTICES.saveFailed)
  })

  it('lagrer aldri elevdata: ukjente felt på oppgavene følger ikke med', () => {
    const withStudentData = {
      x: [{ ...sets['multiplikasjon-6'][0], studentId: 'elev-7', studentName: 'Kari Nordmann', answers: ['56'], progress: { done: true } }],
    } as unknown as Record<string, SessionTask[]>
    const stored = serializeTaskSets(withStudentData)
    for (const secret of ['elev-7', 'Kari Nordmann', 'answers', 'progress']) assert.ok(!stored.includes(secret), secret)
  })

  it('appen lagrer bare oppgavesettene – ikke elevsvar, framdrift eller elevforslag', () => {
    const provider = readFileSync(new URL('../src/features/sessions/SessionsProvider.tsx', import.meta.url), 'utf8')
    // Ett eneste kall til lagringen, og det får bare oppgavesettene.
    assert.equal(provider.match(/saveTaskSets\(/g)?.length, 1)
    assert.ok(provider.includes('saveTaskSets(browserStorage(), sets)'))
    assert.ok(!/localStorage/.test(provider))
    // Oppgavesettene som lagres, er bare de læreren har lagret med saveTasks.
    assert.match(provider, /persistTaskSets\(\{ \.\.\.savedSets\.current, \[sessionId\]: updated \}\)/)
    assert.ok(!/persistTaskSets\([^)]*(studentTasks|progress)/.test(provider))
    // Elevvisningen og forhåndsvisningen bruker ikke lagringen.
    for (const file of ['../src/features/tasks/StudentPreviewDialog.tsx', '../src/features/student/StudentTaskFlow.tsx']) {
      assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes('taskStorage'), file)
    }
  })

  it('varselet om ulagrede endringer er beholdt på redigeringssiden', () => {
    const page = readFileSync(new URL('../src/features/tasks/EditTasksPage.tsx', import.meta.url), 'utf8')
    assert.ok(page.includes('Du har endringer som ikke er lagret'))
    assert.ok(page.includes('storageNotice'))
  })
})
