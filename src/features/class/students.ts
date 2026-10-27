import emmaPhoto from '../../assets/students/emma.png'
import type { Student } from '../../types'

// Klasse 4A. Testdata frem til elevene hentes fra Firestore.

export const students: Student[] = [
  { id: 'amalie', name: 'Amalie Berg', level: 1 },
  { id: 'sofie', name: 'Sofie Lund', level: 1 },
  { id: 'ella', name: 'Ella Andersen', level: 2 },
  { id: 'noah', name: 'Noah Dahl', level: 2 },
  { id: 'ada', name: 'Ada Strand', level: 3 },
  { id: 'nora', name: 'Nora Lie', level: 3 },
  { id: 'aksel', name: 'Aksel Olsen', level: 2 },
  { id: 'filip', name: 'Filip Nilsen', level: 1 },
  { id: 'jakob', name: 'Jakob Solberg', level: 2 },
  { id: 'maja', name: 'Maja Bakke', level: 2 },
  { id: 'elias', name: 'Elias Holm', level: 3 },
  { id: 'olivia', name: 'Olivia Moen', level: 2 },
  { id: 'emil', name: 'Emil Hansen', level: 1 },
  { id: 'isak', name: 'Isak Johansen', level: 1 },
  { id: 'iben', name: 'Iben Vik', level: 3 },
  { id: 'emma', name: 'Emma Larsen', level: 1, photo: emmaPhoto },
  { id: 'leo', name: 'Leo Haug', level: 3 },
  { id: 'oskar', name: 'Oskar Aas', level: 3 },
]
