import type { Student } from '../../types'
import { roster } from './roster'

export { studentsClassId } from './roster'

// Klasse 4A med bilder. Selve klasselista ligger i roster.ts.

// Bildene ligger i assets/students/<id>.jpg (laget fra Images-mappen).
const photos = import.meta.glob<string>('../../assets/students/*.jpg', { eager: true, import: 'default' })
const photoFor = (id: string) => photos[`../../assets/students/${id}.jpg`]

export const students: Student[] = roster.map((s) => ({ ...s, photo: photoFor(s.id) }))
