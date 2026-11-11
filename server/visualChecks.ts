import { SHAPE_NAMES, isMathDraft, topicOfArea, type AiTaskDraft, type AiVisual, type AngleKind, type ReferenceArea, type ShapeKind } from '../src/ai/contract.ts'
import { CLAIM, MISSING_FIGURE, countsIn, figureNamed, figuresIn, namedAngle, sentences, subjectFigures, ANGLE_WORD, type Part } from './geometryChecks.ts'

// Kontroll av figurer i AI-oppgaver (regelversjon 8). AI-en kan bare velge en figur appen tegner selv
// (plan figur eller vinkel). Kontrollen er konservativ: den avviser ugyldige figurer, figurer der de ikke
// hører hjemme, tegneoppgaver og oppgaver der teksten eller fasiten tydelig motsier figuren. Det som ikke
// kan leses sikkert, avvises ikke. «Se på figuren» uten figur avvises i geometryChecks.ts (missingFigure).

export type VisualProblem = 'invalidVisual' | 'irrelevantVisual' | 'drawingTask' | 'visualMismatch' | 'figureRequired' | 'wrongTerm'

/** Fagområdene der figurtypen hører hjemme: plane figurer i 2D og «fra 3D til 2D», vinkler i vinkeløktene. */
const SHAPE_AREAS: readonly string[] = ['todimensjonale-figurer', 'fra-3d-til-2d']
const ANGLE_AREAS: readonly string[] = ['vinkler']

/** Områdene der hver ny AI-oppgave skal ha en figur, og hvilken type. */
const REQUIRED_FIGURE: Partial<Record<string, 'shape' | 'angle'>> = { 'todimensjonale-figurer': 'shape', vinkler: 'angle' }
/** Oppgaveteksten viser tydelig til den synlige figuren («Se på figuren», «figuren», «Se på vinkelen»). */
const SHOWS_FIGURE = /\bfiguren\b|\bse på vinkelen\b|\bvinkelen du ser\b/i
/** «Kanter» om plane figurer (sider og hjørner). «Firkant», «femkant» … er ikke «kant». */
const EDGE_WORD = /\bkant(er|ene|en)?\b/i

/** Eleven skal tegne – det kan ikke gjøres i tekstfeltet i elevvisningen. */
const DRAWING = /\b(tegn|skisser|konstruer)\b|\blag (en |ei |et )?(tegning|skisse)\b|\bdu skal tegne\b/i

/** Setninger som sammenligner eller legger sammen, der tallene ikke gjelder figuren alene. */
const COMPARISON = /\b(flere|færre|til sammen|enn|mer|mindre|dobbelt|halvparten|forskjell)\b/i

/** Spørsmål om navnet på figuren, eller om vinkeltypen. */
const ASKS_NAME = /hva heter|hvilken (figur|mangekant|firkant)|hva kalles figuren|hva slags figur/i
const ASKS_ANGLE_TYPE = /hva slags vinkel|hvilken (type )?vinkel|spiss, rett eller (stump|butt)|hva kalles (vinkelen|denne vinkelen)/i

/** Egenskapene til figuren slik appen tegner den. Den generelle firkanten har ingen rette vinkler. */
function shapeFacts(shape: ShapeKind): Partial<Record<Part, number>> {
  const base = figureNamed(SHAPE_NAMES[shape])?.parts ?? {}
  if (shape === 'quadrilateral') return { ...base, 'rette vinkler': 0, symmetrilinjer: 0 }
  if (shape === 'rectangle') return { ...base, symmetrilinjer: 2 }
  if (shape === 'circle') return { ...base, sider: 0, hjørner: 0, kanter: 0 }
  return base
}

/** Navn som er riktige for figuren: et kvadrat er også et rektangel og en firkant. */
const ACCEPTED_NAMES: Record<ShapeKind, string[]> = {
  triangle: ['trekant'],
  square: ['kvadrat', 'rektangel', 'firkant'],
  rectangle: ['rektangel', 'firkant'],
  quadrilateral: ['firkant'],
  pentagon: ['femkant'],
  hexagon: ['sekskant'],
  octagon: ['åttekant'],
  circle: ['sirkel'],
}

function shapeMismatch(shape: ShapeKind, studentText: string, solution: string): boolean {
  const facts = shapeFacts(shape)
  const accepted = ACCEPTED_NAMES[shape]
  const isOwn = (sentence: string) => {
    const named = subjectFigures(sentence)
    return named.length === 0 || named.every((f) => accepted.includes(f.name))
  }
  const countsWrong = (sentence: string) =>
    countsIn(sentence).parts.some(([part, value]) => facts[part] !== undefined && facts[part] !== value)

  // Navnet: svaret på «Hva heter figuren?» og «Figuren er en …».
  if (ASKS_NAME.test(studentText)) {
    const answer = figuresIn(sentences(solution)[0] ?? '')[0]
    if (answer && !accepted.includes(answer.name)) return true
  }
  for (const m of `${studentText} ${solution}`.matchAll(/\bfiguren (?:er|heter|kalles) (?:en |et )?(\p{L}+)/giu)) {
    const named = figuresIn(m[1])[0]
    if (named && !accepted.includes(named.name)) return true
  }
  // Antall sider, hjørner og rette vinkler – i setninger som handler om figuren alene. Sammenligner spørsmålet
  // («… til sammen med en firkant?»), er svaret ikke figurens antall: da kontrolleres bare setninger som navngir figuren.
  const comparing = COMPARISON.test(studentText)
  const solutionSentences = sentences(solution).filter((s) => !comparing || subjectFigures(s).length > 0)
  const statements = [...(CLAIM.test(studentText) ? [] : sentences(studentText).filter((s) => /figur/i.test(s))), ...solutionSentences]
  return statements.some((sentence) => !COMPARISON.test(sentence) && isOwn(sentence) && countsWrong(sentence))
}

const ANGLE_OF: Record<string, AngleKind> = { spiss: 'acute', rett: 'right', stump: 'obtuse' }

function angleMismatch(figure: Extract<AiVisual, { kind: 'angle' }>, studentText: string, solution: string): boolean {
  // Ett gradtall i oppgaveteksten: figuren må ha nøyaktig det gradtallet (ellers tegnes en annen vinkel).
  if (!CLAIM.test(studentText)) {
    const given = [...new Set([...studentText.matchAll(/(\d+)\s*(?:°|grader\b)/g)].map((m) => Number(m[1])))]
    if (given.length === 1 && figure.degrees !== given[0]) return true
  }
  // Spørsmål om vinkeltypen: svaret (første vinkelord i fasitens første setning) må være figurens type.
  if (ASKS_ANGLE_TYPE.test(studentText)) {
    const word = (sentences(solution)[0] ?? '').match(ANGLE_WORD)?.[0]
    const named = word ? namedAngle(word) : null
    if (named && ANGLE_OF[named] !== figure.angleType) return true
  }
  return false
}

/**
 * Kontrollerer figuren til én AI-oppgave:
 * - nye oppgaver (`requireFigure`) i «todimensjonale figurer» skal ha en plan figur og i «vinkler» en vinkel,
 *   og teksten skal vise til figuren → figureRequired (også regnestykker, som ikke kan ha figur). «Se på
 *   figuren» uten figur gir missingFigure i geometryChecks.ts. Ved justering (`requireFigure: false`)
 *   kan læreren fortsatt fjerne figuren.
 * - «kanter» om plane figurer i «todimensjonale figurer» → wrongTerm (sider og hjørner)
 * - ugyldig figur fra AI-en (ukjent form, vinkeltype som ikke passer gradtallet) → invalidVisual
 * - figur i et annet tema enn Geometri, eller i et område der figurtypen ikke hører hjemme → irrelevantVisual
 * - Geometri: oppgaven ber eleven tegne (elevvisningen har bare et tekstfelt) → drawingTask
 * - teksten eller fasiten motsier figuren (navn, antall sider/hjørner/rette vinkler, gradtall, vinkeltype) → visualMismatch
 * Gjelder alltid – også med «Andre ønsker».
 */
export function visualProblem(task: AiTaskDraft, { area, requireFigure = true }: { area?: ReferenceArea; requireFigure?: boolean }): VisualProblem | null {
  const required = requireFigure && area ? REQUIRED_FIGURE[area] : undefined
  if (isMathDraft(task)) return required ? 'figureRequired' : null
  if (task.invalidFigure) return 'invalidVisual'
  const geometry = !!area && topicOfArea(area) === 'geometri'
  const figure = task.figure
  if (figure) {
    const areas = figure.kind === 'shape' ? SHAPE_AREAS : ANGLE_AREAS
    if (!geometry || !areas.includes(area!)) return 'irrelevantVisual'
  }
  if (!geometry) return null
  if (DRAWING.test(task.studentText)) return 'drawingTask'
  if (required) {
    if (!figure) return MISSING_FIGURE.test(task.studentText) ? null : 'figureRequired'
    if (!SHOWS_FIGURE.test(task.studentText)) return 'figureRequired'
  }
  if (area === 'todimensjonale-figurer' && EDGE_WORD.test(`${task.studentText} ${task.solution}`)) return 'wrongTerm'
  if (!figure) return null
  const mismatch = figure.kind === 'shape' ? shapeMismatch(figure.shape, task.studentText, task.solution) : angleMismatch(figure, task.studentText, task.solution)
  return mismatch ? 'visualMismatch' : null
}

// ---------------------------------------------------------------------------------------------
// «Juster med AI» på en oppgave med figur. Figuren beholdes som standard; den kan endres eller fjernes bare
// når lærerens beskjed uttrykkelig ber om det (eller når oppgaven ikke lenger viser til figuren). Den
// justerte oppgaven går deretter gjennom de samme figurkontrollene som ved generering.

/** Læreren ber om å fjerne figuren. */
const REMOVE_FIGURE = /\b(fjern|ta bort|stryk|dropp|slett)\w*\b[^.?!]*\b(figur|vinkel|tegning|bilde)\w*|\buten (figur|tegning|bilde)\b|\bikke (vis|ha med) (en |noen )?(figur|figuren)\b/i
/** Læreren ber om en annen figur: en figur- eller vinkeltype, et gradtall, eller «bytt/endre figuren». */
const CHANGE_FIGURE =
  /\b(trekant|kvadrat|rektangel|firkant|femkant|sekskant|åttekant|sirkel|spiss|stump|butt|rett vinkel)\w*|\d+\s*(°|grader)|\b(bytt|endre|skift|erstatt|gjør om|ny)\w*\b[^.?!]*\b(figur|vinkel)\w*/i
/** Læreren ber om at oppgaven får en figur. */
const ADD_FIGURE = /\b(vis|legg til|bruk|med|ta med)\b[^.?!]*\b(figur|vinkel som vises|tegnet vinkel)\w*/i
/** Oppgaveteksten viser til en figur eleven skal se. */
const REFERS_TO_FIGURE = /\bfiguren\b/i

const REVISION_TEXT: Record<VisualProblem | 'missingFigure', string> = {
  figureRequired: 'oppgaven manglet figuren',
  wrongTerm: 'oppgaven brukte «kanter» om en plan figur (det heter sider og hjørner)',
  invalidVisual: 'AI-en valgte en figur appen ikke kan tegne',
  irrelevantVisual: 'figuren passer ikke til temaet',
  drawingTask: 'oppgaven ba eleven tegne, og det støtter ikke elevvisningen',
  visualMismatch: 'teksten eller fasiten stemte ikke med figuren',
  missingFigure: 'oppgaven viser til en figur, men figuren manglet',
}

const sameVisual = (a?: AiVisual, b?: AiVisual) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const areaFor = (visual?: AiVisual): ReferenceArea => (visual?.kind === 'angle' ? 'vinkler' : 'todimensjonale-figurer')

export type RevisionCheck = { draft: AiTaskDraft } | { problem: VisualProblem | 'missingFigure'; warning: string }

/**
 * Bestemmer figuren til en justert oppgave og kontrollerer den. `original` er figuren oppgaven hadde.
 * - Oppgaver uten figur, og andre tema: som før – en figur AI-en legger til av seg selv, tas ikke med.
 * - Figuren beholdes, med mindre læreren ber om en annen figur (da brukes AI-ens figur) eller om å fjerne
 *   den / oppgaven ikke lenger viser til figuren (da fjernes den).
 * - Deretter: ugyldig figur, figur som mangler, tegneoppgave og figur som ikke stemmer med tekst og fasit avvises.
 */
export function checkRevision(revised: AiTaskDraft, { original, instruction, topic }: { original?: AiVisual; instruction: string; topic: string }): RevisionCheck {
  if (isMathDraft(revised)) return { draft: revised }
  const { figure: proposed, invalidFigure, noFigure, ...rest } = revised
  const geometry = !!original || /geometri/i.test(topic)
  const reject = (problem: VisualProblem | 'missingFigure'): RevisionCheck => ({
    problem,
    warning: `Justeringen ble ikke brukt fordi ${REVISION_TEXT[problem]}. Den opprinnelige oppgaven er beholdt. Prøv igjen, eller skriv beskjeden på en annen måte.`,
  })

  // Uten figur fra før: figuren tas bare med når læreren ber om den i en geometrioppgave.
  if (!original && !(geometry && ADD_FIGURE.test(instruction))) return { draft: rest }
  if (invalidFigure) return reject('invalidVisual')

  let figure: AiVisual | undefined = original
  if (noFigure) {
    if (REMOVE_FIGURE.test(instruction) || !REFERS_TO_FIGURE.test(rest.studentText)) figure = undefined
    else return reject('missingFigure')
  } else if (proposed && !sameVisual(proposed, original) && (!original || CHANGE_FIGURE.test(instruction))) {
    figure = proposed
  }

  const draft: AiTaskDraft = { ...rest, ...(figure && { figure }) }
  if (!figure && REFERS_TO_FIGURE.test(rest.studentText) && original) return reject('missingFigure')
  const problem = visualProblem(draft, { area: areaFor(figure ?? original), requireFigure: false })
  return problem ? reject(problem) : { draft }
}
