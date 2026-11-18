import type { TaskFigure, TextTask } from '../../types/index.ts'
import { TEXT_ATTEMPTS, type TextTaskState } from './studentTasks.ts'

// Multiplikasjon: oppgaver der eleven skal skrive regnestykker til en figur eller et plusstykke («Lag to regnestykker:
// ett med pluss og ett med gange», «Skriv som gangestykke»). I stedet for ett stort skrivefelt får eleven én mal per
// regnestykke – tallbokser og knapper for regnetegnet – og appen retter hver linje ut fra figuren. Hva som er riktig,
// regnes ut av appen (ikke lagret i oppgaven), så det gjelder også AI-oppgaver og oppgaver læreren har skrevet.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

export type LineKind = 'plus' | 'times'

export const LINE_LABELS: Record<LineKind, string> = { plus: 'Med pluss', times: 'Med gange' }
/** Regnetegnet hver linje skal ha (samme tegn som knappene i Regning). */
export const LINE_OPERATOR: Record<LineKind, string> = { plus: '+', times: '·' }

/** Like grupper: `groups` grupper med `size` i hver (rader og ruter per rad, eller ledd og tallet i hvert ledd). */
export interface EquationSpec {
  lines: LineKind[]
  /**
   * Oppgaveteksten bestemmer regnearten («ett med pluss og ett med gange», «Skriv som gangestykke»): regnetegnet står
   * ferdig og låst i hver linje, og eleven fyller bare inn tallene. Ellers («Lag et regnestykke») velger eleven
   * regnetegnet med knapper.
   */
  fixedOperators: boolean
  groups: number
  size: number
  total: number
}

/** Et regnestykke eleven bygger: tallene i boksene, regnetegnet og svaret. */
export interface EquationLine {
  terms: string[]
  operator: string
  result: string
}

export const MIN_TERMS = 2
export const MAX_TERMS = 10

/** En rutefigur som er et helt rektangel (alle rader like lange, bare fylte ruter) – ellers null. */
export function gridGroups(figure: TaskFigure | undefined): { groups: number; size: number } | null {
  if (figure?.kind !== 'grid' || figure.rows.length === 0) return null
  const size = figure.rows[0].length
  if (size === 0 || !figure.rows.every((row) => row.length === size && /^#+$/.test(row))) return null
  return { groups: figure.rows.length, size }
}

/** Et plusstykke med like ledd i teksten («2 + 2 + 2 = ___») – ellers null. */
export function sumGroups(text: string): { groups: number; size: number } | null {
  const match = /(\d+(?:\s*\+\s*\d+)+)\s*=\s*(?:_+|\?|□)/.exec(text)
  if (!match) return null
  const terms = match[1].split('+').map((t) => Number(t.trim()))
  if (terms.length < MIN_TERMS || terms.some((t) => !Number.isInteger(t) || t <= 0 || t !== terms[0])) return null
  return { groups: terms.length, size: terms[0] }
}

/** Om oppgaveteksten selv sier hvilken regneart hvert regnestykke skal ha (pluss, gange eller begge). */
export function operationGiven(text: string): boolean {
  const t = text.toLowerCase()
  return /plusstykke|addisjonsstykke|med pluss|som pluss|gangestykke|multiplikasjonsstykke|med gange|som gange/.test(t)
}

/** Hvilke regnestykker oppgaveteksten ber om – i rekkefølgen pluss, gange. Tom liste når den ikke ber om regnestykker. */
export function requestedLines(text: string): LineKind[] {
  const t = text.toLowerCase()
  const plus = /plusstykke|addisjonsstykke|med pluss|som pluss/.test(t)
  const times = /gangestykke|multiplikasjonsstykke|med gange|som gange/.test(t)
  if (plus || times) return [...(plus ? ['plus' as const] : []), ...(times ? ['times' as const] : [])]
  // «Lag et regnestykke» til en figur i Multiplikasjon: et gangestykke.
  return /regnestykke/.test(t) ? ['times'] : []
}

/**
 * Malene til oppgaven, eller null når den skal ha vanlig skrivefelt: oppgaven må be om regnestykker, og appen må kunne
 * lese de like gruppene – fra en rutefigur som er et helt rektangel, eller fra et plusstykke med like ledd i teksten.
 * Kan figuren ikke leses, blir det vanlig skrivefelt. Oppgaver med eget svar som rettes automatisk (`expected`) eller
 * tallrekke med bokser, beholder det de har.
 */
export function equationSpec(task: TextTask): EquationSpec | null {
  if (task.expected || task.answerBoxes) return null
  const lines = requestedLines(task.text)
  if (lines.length === 0) return null
  const found = task.figure ? gridGroups(task.figure) : sumGroups(task.text)
  if (!found) return null
  return { lines, fixedOperators: operationGiven(task.text), ...found, total: found.groups * found.size }
}

/** Linje nr. `index` slik eleven har fylt den ut. Når regnearten er bestemt, har den alltid linjens regnetegn. */
export function lineAt(state: Pick<TextTaskState, 'parts'>, spec: EquationSpec, index: number): EquationLine {
  const line = decodeLine(state.parts?.[index])
  return spec.fixedOperators ? { ...line, operator: LINE_OPERATOR[spec.lines[index]] } : line
}

const num = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : NaN)

/** Om linjen er fylt ut: alle tall, regnetegnet og svaret. */
export const lineComplete = (line: EquationLine | undefined) =>
  !!line && line.operator !== '' && line.result.trim() !== '' && line.terms.length >= MIN_TERMS && line.terms.every((t) => t.trim() !== '')

/**
 * Om linjen passer med figuren. Pluss: alle ledd like, ett ledd per rad (ruter i raden) eller per kolonne (ruter i
 * kolonnen), og riktig sum. Gange: rader · kolonner eller kolonner · rader, og riktig svar. Regnetegnet må stemme.
 */
export function lineCorrect(kind: LineKind, line: EquationLine, spec: EquationSpec): boolean {
  if (!lineComplete(line) || line.operator !== LINE_OPERATOR[kind]) return false
  const terms = line.terms.map(num)
  if (terms.some(Number.isNaN) || num(line.result) !== spec.total) return false
  const { groups, size } = spec
  if (kind === 'plus') {
    const [first] = terms
    if (!terms.every((t) => t === first)) return false
    return (first === size && terms.length === groups) || (first === groups && terms.length === size)
  }
  if (terms.length !== 2) return false
  const [a, b] = terms
  return (a === groups && b === size) || (a === size && b === groups)
}

/** Et eksempel på riktig svar for linjen (vises etter siste forsøk). */
export function exampleLine(kind: LineKind, spec: EquationSpec): string {
  if (kind === 'plus') return `${Array(spec.groups).fill(spec.size).join(' + ')} = ${spec.total}`
  return `${spec.groups} · ${spec.size} = ${spec.total}`
}

/** Linjen som lesbar tekst («2 + 2 + 2 + 2 = 8»). Tomme bokser vises som «_». */
export function formatLine(line: EquationLine): string {
  const terms = line.terms.map((t) => t.trim() || '_')
  return `${terms.join(` ${line.operator || '?'} `)} = ${line.result.trim() || '_'}`
}

// Lagring i TextTaskState: hver linje i `parts` («2,2,2,2|+|8»), og svaret samlet som tekst i `answer`.

export const emptyLine = (): EquationLine => ({ terms: ['', ''], operator: '', result: '' })

export function decodeLine(value: string | undefined): EquationLine {
  if (!value) return emptyLine()
  const [terms = '', operator = '', result = ''] = value.split('|')
  const list = terms.split(',').map((t) => t.replace(/\D/g, '').slice(0, 6)).slice(0, MAX_TERMS)
  while (list.length < MIN_TERMS) list.push('')
  return { terms: list, operator, result: result.replace(/\D/g, '').slice(0, 6) }
}

export const encodeLine = (line: EquationLine) => `${line.terms.join(',')}|${line.operator}|${line.result}`

/** Ny tilstand etter at eleven har endret linje nr. `index`. Et nytt forsøk fjerner «Ikke riktig.»-beskjeden. */
export function changeLine(state: TextTaskState, spec: EquationSpec, index: number, line: EquationLine): TextTaskState {
  const lines = spec.lines.map((kind, i) => {
    const current = i === index ? line : lineAt(state, spec, i)
    return spec.fixedOperators ? { ...current, operator: LINE_OPERATOR[kind] } : current
  })
  return {
    ...state,
    parts: lines.map(encodeLine),
    answer: lines.map((l, i) => `${LINE_LABELS[spec.lines[i]]}: ${formatLine(l)}`).join('\n'),
    result: state.result === 'retry' ? undefined : state.result,
  }
}

/**
 * «Sjekk svaret mitt»: hver linje rettes for seg. Alle riktige: «Riktig!». Ellers ett nytt forsøk, og deretter vises et
 * eksempel på riktig svar ved hver linje som var feil – som med flere spørsmål i Regning.
 */
export function checkEquations(state: TextTaskState, spec: EquationSpec): TextTaskState {
  const partResults = spec.lines.map((kind, i) => lineCorrect(kind, lineAt(state, spec, i), spec))
  if (partResults.every(Boolean)) return { ...state, partResults, submitted: true, result: 'correct' }
  const wrongTries = (state.wrongTries ?? 0) + 1
  return wrongTries >= TEXT_ATTEMPTS
    ? { ...state, partResults, wrongTries, submitted: true, result: 'revealed' }
    : { ...state, partResults, wrongTries, result: 'retry' }
}

/** Om alle linjene er fylt ut, så eleven kan sjekke svaret. */
export const equationsReady = (state: TextTaskState, spec: EquationSpec) => spec.lines.every((_, i) => lineComplete(lineAt(state, spec, i)))
