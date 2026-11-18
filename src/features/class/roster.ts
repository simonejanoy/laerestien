import type { Student } from '../../types/index.ts'

// Klasse 4A. Testdata frem til elevene hentes fra Firestore. Alle elevene er fiktive.
// Rene data (ingen Vite-importer), så testene kan lese dem i Node. Bildene legges til i students.ts.

/** Klassen testelevene går i. */
export const studentsClassId = '4A'

export const roster: Omit<Student, 'photo'>[] = [
  { id: 'sofie', name: 'Sofie Lund', level: 1 },
  { id: 'ella', name: 'Ella Andersen', level: 2 },
  { id: 'noah', name: 'Noah Dahl', level: 2 },
  { id: 'ada', name: 'Ada Strand', level: 3 },
  // Nora har testkontoen nora@teigen.no i Firebase (fiktiv elev, se README). Profilen der heter «Nora Teigen», men i
  // appen vises hun som «Nora L.». Kontoen kobles til denne raden på e-post (eller uid), aldri på navn.
  { id: 'nora', name: 'Nora L.', level: 3, email: 'nora@teigen.no' },
  { id: 'aksel', name: 'Aksel Olsen', level: 2 },
  { id: 'filip', name: 'Filip Nilsen', level: 1 },
  { id: 'jakob', name: 'Jakob Solberg', level: 2 },
  { id: 'maja', name: 'Maja Bakke', level: 2 },
  { id: 'elias', name: 'Elias Holm', level: 3 },
  { id: 'olivia', name: 'Olivia Moen', level: 2 },
  { id: 'emil', name: 'Emil Hansen', level: 1 },
  { id: 'isak', name: 'Isak Johansen', level: 1 },
  { id: 'iben', name: 'Iben Vik', level: 3 },
  { id: 'emma', name: 'Emma Larsen', level: 1 },
  { id: 'leo', name: 'Leo Haug', level: 3 },
  { id: 'oskar', name: 'Oskar Aas', level: 3 },
]
