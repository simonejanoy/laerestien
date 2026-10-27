import type { CalendarSession, Weekday } from '../../types'

// Testdata frem til Firestore er på plass.

export const weekdays: Weekday[] = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag']

export const timeSlots = ['08.30', '09.30', '10.30', '11.30', '12.15', '13.15']

/** Tidspunkt som er friminutt for hele uka. */
export const breaks: Record<string, string> = { '11.30': 'Storefriminutt' }

export const currentWeek = {
  week: 44,
  dateLabel: 'Onsdag 8. oktober',
  topic: 'Addisjon & subtraksjon',
  completedSessions: 2,
  totalSessions: 6,
  topicSpan: 'Addisjon satt opp for uke 44 - 48',
}

export const sessions: CalendarSession[] = [
  { id: 'kal-1', sessionId: 'okt-1-2', topic: 'Addisjon & subtraksjon', sessionNumber: 1, day: 'Mandag', time: '08.30' },
  { id: 'kal-2', sessionId: 'okt-1-2', topic: 'Addisjon & subtraksjon', sessionNumber: 2, day: 'Mandag', time: '09.30' },
  { id: 'kal-3', sessionId: 'okt-3', topic: 'Addisjon & subtraksjon', sessionNumber: 3, day: 'Onsdag', time: '10.30' },
  { id: 'kal-4', sessionId: 'okt-4', topic: 'Addisjon & subtraksjon', sessionNumber: 4, day: 'Fredag', time: '09.30' },
]
