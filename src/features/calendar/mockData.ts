import type { Weekday } from '../../types'

// Timeplanen. Øktene selv ligger i SessionsProvider.

export const weekdays: Weekday[] = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag']

export const timeSlots = ['08.30', '09.30', '10.30', '11.30', '12.15', '13.15']

/** Tidspunkt som er friminutt for hele uka. */
export const breaks: Record<string, string> = { '11.30': 'Storefriminutt' }

/** Ledige undervisningstimer (friminutt er ikke med). */
export const lessonSlots = timeSlots.filter((t) => !breaks[t])

/** «08.30» → «8.30» */
const short = (time: string) => time.replace(/^0/, '')

/** Slutttid for en time: neste timestart, eller én time etter den siste. */
export function endOf(time: string) {
  const i = timeSlots.indexOf(time)
  if (i >= 0 && i < timeSlots.length - 1) return timeSlots[i + 1]
  const [h, m] = time.split('.').map(Number)
  return `${h + 1}.${String(m).padStart(2, '0')}`
}

/** «Mandag 26. oktober» og «8.30 - 10.30» ut fra uka og timene økta har. */
export function describeSlots(at: WeekRef, slots: { day: Weekday; time: string }[]) {
  const first = slots[0]
  const last = slots[slots.length - 1]
  return {
    date: `${first.day} ${dayMonth.format(dateOf(at, first.day))}`,
    time: `${short(first.time)} - ${short(endOf(last.time))}`,
  }
}

/** «08.30» → minutter etter midnatt. */
export function minutesOf(time: string) {
  const [h, m] = time.split('.').map(Number)
  return h * 60 + m
}

/** En uke i kalenderen (ISO-ukenummer). Skoleåret går over nyttår, så året må være med. */
export interface WeekRef {
  year: number
  week: number
}

const dayMonth = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long' })

/** Datoen til en ukedag i en uke. */
export function dateOf({ year, week }: WeekRef, day: Weekday) {
  // 4. januar ligger alltid i uke 1.
  const jan4 = new Date(year, 0, 4)
  const mondayOfWeek1 = 4 - ((jan4.getDay() + 6) % 7)
  return new Date(year, 0, mondayOfWeek1 + (week - 1) * 7 + weekdays.indexOf(day))
}

/** Uka en dato ligger i. */
export function weekOf(date: Date): WeekRef {
  // Torsdagen i samme uke avgjør hvilket år uka hører til.
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  const days = Math.round((thursday.getTime() - jan4.getTime()) / 86_400_000)
  return { year: thursday.getFullYear(), week: 1 + Math.floor((days + ((jan4.getDay() + 6) % 7)) / 7) }
}

/** Uka `weeks` uker før/etter. */
export const shiftWeek = (at: WeekRef, weeks: number) => {
  const monday = dateOf(at, 'Mandag')
  return weekOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7))
}

export const isSameWeek = (a: WeekRef, b: WeekRef) => a.year === b.year && a.week === b.week

export const isSameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Er timen (dag + starttid i en uke) over? */
export function hasEnded(at: WeekRef, day: Weekday, time: string, now: Date) {
  const end = dateOf(at, day)
  end.setMinutes(minutesOf(endOf(time)))
  return now >= end
}
