import type { Weekday } from '../../types'

// Timeplanen. Øktene selv ligger i SessionsProvider.

export const weekdays: Weekday[] = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag']

export const timeSlots = ['08.30', '09.30', '10.30', '11.30', '12.15', '13.15']

/** Tidspunkt som er friminutt for hele uka. */
export const breaks: Record<string, string> = { '11.30': 'Storefriminutt' }

/** Uka som vises først, og datoene i den (testdata). */
export const currentWeek = {
  week: 44,
  dateLabel: 'Onsdag 8. oktober',
  topicSpan: 'Addisjon satt opp for uke 44 - 48',
}

export const dayDates: Record<Weekday, string> = {
  Mandag: '26. oktober',
  Tirsdag: '27. oktober',
  Onsdag: '28. oktober',
  Torsdag: '29. oktober',
  Fredag: '30. oktober',
}

/** Ledige undervisningstimer (friminutt er ikke med). */
export const lessonSlots = timeSlots.filter((t) => !breaks[t])

/** «08.30» → «8.30» */
const short = (time: string) => time.replace(/^0/, '')

/** Slutttid for en time: neste timestart, eller én time etter den siste. */
function endOf(time: string) {
  const i = timeSlots.indexOf(time)
  if (i >= 0 && i < timeSlots.length - 1) return timeSlots[i + 1]
  const [h, m] = time.split('.').map(Number)
  return `${h + 1}.${String(m).padStart(2, '0')}`
}

/** «Mandag 26. oktober» og «8.30 - 10.30» ut fra timene økta har. */
export function describeSlots(slots: { day: Weekday; time: string }[]) {
  const first = slots[0]
  const last = slots[slots.length - 1]
  return {
    date: `${first.day} ${dayDates[first.day]}`,
    time: `${short(first.time)} - ${short(endOf(last.time))}`,
  }
}
