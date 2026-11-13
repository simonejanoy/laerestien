import { addDoc, collection, getDocs } from 'firebase/firestore'
import type { AnswerRecord } from '../features/repetition/answers'
import { db } from './firebase'

// Elevsvar til repetisjonen. Lagres i Firestore under results/{classId}/answers. Eleven skriver bare sine egne svar;
// bare læreren i klassen kan lese dem (se firestore.rules). Ingen navn eller svartekster lagres.

const answers = (classId: string) => collection(db, 'results', classId, 'answers')

/** Lagrer ett svar. Feiler stille for eleven (svaret er ikke kritisk for oppgaveflyten), men logges. */
export function saveAnswer(classId: string, record: AnswerRecord) {
  return addDoc(answers(classId), record).catch((error: unknown) => console.error('Kunne ikke lagre elevsvaret:', error))
}

/** Alle lagrede svar i klassen (for læreren). */
export async function loadAnswers(classId: string): Promise<AnswerRecord[]> {
  const snapshot = await getDocs(answers(classId))
  return snapshot.docs.map((d) => d.data() as AnswerRecord)
}
