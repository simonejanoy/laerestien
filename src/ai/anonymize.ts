import type { Student, StudentStats } from '../types'
import { statusLabel } from '../features/statistics/statusStyles'
import type { AnonStudentProfile } from './contract'

// Gjør elevdata klare for AI-en: bare det som trengs for oppgaven, og ingen navn.

/** Stabil, anonym ID for en elev (samme elev gir alltid samme ID). */
export function anonIdFor(studentId: string) {
  let hash = 0
  for (const char of studentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `elev-${hash.toString(36).slice(0, 6)}`
}

/** Bytter ut elevens navn i en tekst med «eleven». */
const withoutName = (text: string, student: Student) =>
  student.name
    .split(' ')
    .filter((part) => part.length > 1)
    .reduce((t, part) => t.replace(new RegExp(`\\b${part}\\b`, 'gi'), 'eleven'), text)

export function anonProfile(student: Student, stats: StudentStats): AnonStudentProfile {
  return {
    anonId: anonIdFor(student.id),
    level: student.level,
    firstTryPercent: stats.firstTry,
    strong: stats.strong,
    support: stats.support,
    mastery: stats.mastery.map((m) => ({ topic: m.topic, status: statusLabel[m.status], note: m.note })),
    observations: [
      withoutName(stats.pattern.text, student),
      ...stats.pattern.compare.map((c) => `${c.label}: ${c.value} ${c.caption}`),
    ],
  }
}
