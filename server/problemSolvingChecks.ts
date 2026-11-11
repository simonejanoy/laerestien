import { isMathDraft, type AiLevel, type AiTaskDraft, type ProblemSolvingArea } from '../src/ai/contract.ts'
import { DECIMAL, NEGATIVE, asksRoundUp, mainQuestion, roundUpProblem, usesModel } from './divisionChecks.ts'
import { CLAIM, MISSING_FIGURE } from './geometryChecks.ts'
import { problemSolvingReferences } from './references/problemSolving.ts'
import type { ReferenceTask } from './references/types.ts'
import { MANY_CORRECT, correctLetters, evaluate, parseOptions, type ChoiceOption } from './references/validate.ts'

// Faglige kontroller for AI-oppgaver i Problemløsing. Som i Divisjon: der det går, leses regnestykkene
// i fasiten og tallene i oppgaveteksten, og svaret regnes ut – ordsøk brukes bare til å avgjøre hva
// situasjonen beskriver (noe kommer til, tas bort, like grupper). Kontrollene gjelder alltid – også
// når læreren har skrevet «Andre ønsker». Gjenbruker modellkontrollen og avrundingen oppover fra Divisjon.

/** Hvorfor en problemløsingsoppgave ikke kan brukes. */
export type ProblemSolvingProblem =
  | 'format'
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongOperation'
  | 'wrongRemainder'
  | 'unclearSolution'
  | 'revealedSolution'
  | 'missingModel'
  | 'missingFigure'
  | 'missingSteps'
  | 'missingInfo'
  | 'invalidOptions'
  | 'outsideRange'
  | 'levelMismatch'

export interface ProblemSolvingContext {
  area: ProblemSolvingArea
  secondaryAreas?: readonly ProblemSolvingArea[]
}

// ---------------------------------------------------------------------------------------------
// Tallområdet: hentet fra referansebanken, ikke skrevet inn for hånd.

const merge = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, '$1')
const digitsIn = (text: string) => (merge(text).match(/\d+/g) ?? []).map(Number)

/**
 * Største tall eleven kan møte på nivået i området: den minste tierpotensen over det største tallet i
 * referansene i området på dette og lavere nivåer (nivå 1 i Regnefortellinger: 52 → 100; nivå 2: 200 → 1000).
 */
export function numberLimit(area: ProblemSolvingArea, level: AiLevel, bank: readonly ReferenceTask[] = problemSolvingReferences): number {
  const numbers = bank
    .filter((r) => r.area === area && r.level <= level)
    .flatMap((r) => digitsIn(`${r.studentText} ${r.solution}`))
  const max = Math.max(10, ...numbers)
  return 10 ** Math.ceil(Math.log10(max + 1))
}

// ---------------------------------------------------------------------------------------------
// Tall og regnestykker i tekstene.

/** «Steg 1:», «Trinn 2:» og «Del 1:» er etiketter, ikke tall i oppgaven. */
const STEP_LABEL = /\b(steg|trinn|del)\s*\d+\s*:/gi
const withoutLabels = (text: string) => text.replace(STEP_LABEL, ' ')

const NUMBER_WORDS: Record<string, number> = {
  to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12, tjue: 20,
  dobbelt: 2, halvparten: 2, halvt: 2,
}
const NUMBER_WORD = new RegExp(`(?<!\\p{L})(${Object.keys(NUMBER_WORDS).join('|')})(?!\\p{L})`, 'giu')

/** Tallene i oppgaveteksten (uten etiketter og uten svaralternativene i en flervalgsoppgave), også tall skrevet med ord. */
export function givenNumbers(studentText: string): number[] {
  const body = withoutLabels(studentText)
    .split('\n')
    .filter((line) => !/^\s*[A-F][).:]\s/.test(line))
    .join('\n')
  const words = [...body.matchAll(NUMBER_WORD)].map(([w]) => NUMBER_WORDS[w.toLowerCase()])
  return [...digitsIn(body), ...words]
}

interface Equation {
  expression: string
  operands: number[]
  operators: string[]
  result: number
}

const OP = String.raw`[+\-−·x×*:/]`
const EQUATION = new RegExp(String.raw`(?<![\d.,])(\d+(?:\s*${OP}\s*\d+)+)\s*=\s*(\d+)`, 'g')

/** Regnestykkene med «=» i teksten, i rekkefølge («Steg 1:» er ikke en del av stykket). */
export function equationsIn(text: string): Equation[] {
  return [...merge(withoutLabels(text)).matchAll(EQUATION)].map(([, expression, result]) => ({
    expression,
    operands: (expression.match(/\d+/g) ?? []).map(Number),
    operators: (expression.match(new RegExp(OP, 'g')) ?? []).map((o) => ({ '−': '-', x: '·', '×': '·', '*': '·', '/': ':' })[o] ?? o),
    result: Number(result),
  }))
}

/** Det første regneuttrykket (minst ett regnetegn) i teksten, uten «= …». */
function expressionIn(text: string): { expression: string; value: number } | null {
  const m = new RegExp(String.raw`(?<![\d.,])\d+(?:\s*${OP}\s*\d+)+`).exec(merge(withoutLabels(text)))
  if (!m) return null
  const value = evaluate(m[0])
  return value === null ? null : { expression: m[0], value }
}

/** Tallene i den siste setningen med tall, utenfor regnestykkene (eller resultatet av det siste stykket i den). */
function answerSentenceNumbers(solution: string): number[] {
  const sentences = merge(withoutLabels(solution)).split(/(?<=[.!?])\s+|\n+/)
  for (const sentence of sentences.reverse()) {
    const free = sentence.replace(EQUATION, ' ').replace(new RegExp(String.raw`\d+(?:\s*${OP}\s*\d+)+`, 'g'), ' ')
    const numbers = (free.match(/\d+/g) ?? []).map(Number)
    if (numbers.length) return numbers
    const equations = equationsIn(sentence)
    if (equations.length) return [equations.at(-1)!.result]
  }
  return []
}

/** Svaret fasiten gir: det første tallet utenfor regnestykkene i den siste setningen med tall, ellers resultatet av det siste stykket. */
export function finalAnswer(solution: string): number | null {
  return answerSentenceNumbers(solution)[0] ?? null
}

// ---------------------------------------------------------------------------------------------
// Hva situasjonen beskriver.

/** Noe kommer til («får», «levert tilbake», «i tillegg») – men ikke «får igjen» (vekslepenger). */
const ADDS = /\bfår\b(?![^.?!]*\bigjen\b)|\bkommer\b[^.?!]*\b(til|i tillegg)\b|\bi tillegg\b|\blevert\w* tilbake|\blegger (til|på)\b|\bkjøper\b[^.?!]*\bflere\b|\bsparer\b|\bøker\b/i
/** Noe tas bort eller sammenlignes. */
const REMOVES =
  /\bigjen\b|\bta(s|r)? bort\b|\bgir bort\b|\bbort\b|\bbruk(er|te)\b|\bspis(er|te)\b|\blån(es|t|te)? ut\b|\bselg(er|es)|\bsolgte\b|\bmist(er|et)\b|\bfærre\b|\bforskjell|\bkutt(es|er)?\b|\bbetal(er|te) med\b|\bikke\b|\bhvor (mange|mye) (flere|mer)\b|\bresten\b|\bmangler\b|\bkortere\b|\blengre enn\b|\beldre\b|\byngre\b/i
/** Like grupper («4 poser med 6 i hver», «hver bolle koster 8 kr», «3 ganger så mange»). */
const GROUPS =
  /\bi hver\b|\bpå hver\b|\bved hvert?\b|\bi hvert\b|\bhver (dag|uke|time|rad|pose|eske|pakke|bok|bolle|kartong|lag|gruppe|bord|benk|side|elev|barn|venn|buss|bil|tur)\b|\bganger så\b|\bper\b|\bstykket\b|\bhver\b[^.?!]{0,30}\bkoster\b|\b(koster|veier|er) \d+ \p{L}+ hver\b/iu
/** Likedeling. */
const SHARES = /\bdel(er|es|t|te)? (likt|på|i)\b|\bfordel\w*|\blikt\b/i

type Operation = '+' | '-' | '·' | ':'

/**
 * Om regnearten passer handlingen i fortellingen (ett regnesteg): noe kommer til → +, noe tas bort eller
 * sammenlignes → −, like grupper → ·, likedeling → :. Bare tydelige motsigelser avvises.
 */
export function operationFits(operation: Operation, story: string): boolean {
  const [adds, removes, groups, shares] = [ADDS.test(story), REMOVES.test(story), GROUPS.test(story), SHARES.test(story)]
  if (operation === '·') return groups
  if (operation === ':') return groups || shares
  if (groups && !adds && !removes) return false
  if (operation === '+') return !(removes && !adds)
  return !(adds && !removes)
}

// ---------------------------------------------------------------------------------------------
// Oppgavetyper.

/** Eleven lager selv en (regne)fortelling eller en flervalgsoppgave. */
const CREATE = /\b(lag|skriv)( så)? (en|ei|et|egen|egne|to)\b[^.?!]*(fortelling|flervalg)|fortelling som passer\b/i
/** Eleven vurderer andres løsning, en påstand eller en modell (nivå 3). */
const ASSESSMENT = new RegExp(
  `${CLAIM.source}|gjort feil|tenkt (riktig|feil)|har (\\p{L}+ )?glemt|riktig løsning|regner slik|er modellen riktig|stemmer modellen|hvilke påstander`,
  'iu',
)
/** Nivå 3: vurdere, finne feil, forklare eller tolke svaret ut fra situasjonen. */
const REASONING =
  /forklar|begrunn|hvorfor|vis (alle )?(steg|utregning)|hvordan (du )?(tenk|vet|fant)|finn feil|gjort feil|har (\p{L}+ )?glemt|hvem har|tenkt (riktig|feil)|stemmer|vurder|rimelig|\btrengs\b|nok til|\blag (en|ei|et)\b|er modellen riktig|påstand|mer enn én|til sammen\b[^]*\bganger så|ganger så\b[^]*\btil sammen/iu
/** Synlige steg i oppgaveteksten (nivå 1). */
const STEP_LINES = /\bsteg\s*1\b[\s\S]*\bsteg\s*2\b|(^|\n)\s*a\)[\s\S]*\n\s*b\)/i
/** Merkede steg som skal bort på nivå 2 og 3: «Steg 1:» eller delspørsmål «a)» (store bokstaver er svaralternativer). */
const STEP_MARKS = /\b[Ss]teg\s*\d+\s*:|(^|\n)\s*[a-c]\)\s/
/** Modell som skal leses i teksten (ikke tegnes av eleven). */
const READ_MODEL =
  /\b(se på|les av|bruk|tolk\w*)\s+(den(ne)?\s+)?(blokkmodellen|modellen|tallinjen|tabellen|tegningen)\b|\b(blokkmodellen|modellen|tallinjen|tabellen)\s+(viser|under|over|nedenfor|ovenfor|her)\b|\bdenne (blokk)?modellen\b|\bfølgende (blokk)?modell\b/i
/** Modellen står i teksten: blokker «[ 45 ]», en tallinje «0 - 100 - 200» eller en tabellrad «| 1 | 8 |». */
const TEXT_MODEL = /\[[^\]\n]*\]|\d+\s*[-–—]+\s*\d+\s*[-–—]+\s*\d+|\|[^\n|]+\|[^\n|]+\|/
/** Bilde eller illustrasjon – appen viser aldri bilder i Problemløsing. */
const PICTURE = /\b(bildet|bilde(t)? under|illustrasjonen|fotografiet)\b/i
/** Tabell som eleven lager, fyller ut eller leser. */
const TABLE = /\b(lag|fyll\w*|bruk|les|tegn|skriv)\b[^.?!]*\btabell/i
/** Innhold utenfor Problemløsing på 4. trinn. */
const OUTSIDE_TOPIC = /\bbrøk|\btidel|\bhundredel|\bdesimal|\bvinkel|\bareal\b|\bomkrets|\bprosent|\blikning|\bvolum\b/i
/** Overslag: det riktige alternativet er det nærmeste. */
const ESTIMATE = /nærmest|overslag|omtrent|uten å regne nøyaktig|rund\w* av/i
/** Regnefortellinger handler om regneuttrykk. */
const EXPRESSION_WORDS = /regneuttrykk|uttrykk|regnefortelling|fortelling|regnestykke/i

const isAssessment = (text: string) => ASSESSMENT.test(text)
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?]$/, '').trim()

/** Verdien av et alternativ som bare er et tall (eventuelt med enhet: «32», «86 kr»). */
const optionNumber = (option: ChoiceOption) => {
  const m = /^(\d[\d ]*)(\s+\p{L}+)?$/u.exec(option.text.trim())
  return m ? Number(m[1].replace(/ /g, '')) : null
}

/**
 * Gale svar som kan forklares med en tankefeil: feil regneart eller et glemt steg (alle par av tall i
 * oppgaven og mellomsvar, og tre tall i oppgaven), bare første steg, eller en telle- eller tierfeil.
 */
function plausibleWrongAnswers(given: number[], intermediate: number[], correct: number): Set<number> {
  const values = [...given, ...intermediate]
  const plausible = new Set<number>([...values, ...[1, 2, 3, 10, 100].flatMap((d) => [correct + d, correct - d])])
  const pairs = (a: number, b: number) => [a + b, Math.abs(a - b), a * b, ...(b > 0 && a % b === 0 ? [a / b] : []), ...(a > 0 && b % a === 0 ? [b / a] : [])]
  // Bare ulike opplysninger kombineres (ikke det samme tallet med seg selv).
  values.forEach((a, i) => values.forEach((b, j) => i !== j && pairs(a, b).forEach((v) => plausible.add(v))))
  given.forEach((a, i) =>
    given.forEach((b, j) =>
      given.forEach((c, k) => {
        if (i === j || j === k || i === k) return
        for (const v of [a + b + c, a + b - c, a * b - c, a * b + c, a - b - c, a - b + c]) plausible.add(v)
      }),
    ),
  )
  return plausible
}

/** Kontrollen av svaralternativene (alle områder: flervalgsoppgaver kan også brukes som støtte). */
function optionsProblem(studentText: string, solution: string, options: ChoiceOption[]): ProblemSolvingProblem | null {
  if (options.length > 6) return 'invalidOptions'
  if (options.some((o, i) => o.letter !== 'ABCDEF'[i])) return 'invalidOptions'
  if (new Set(options.map((o) => normalize(o.text))).size !== options.length) return 'invalidOptions'
  const letters = correctLetters(solution)
  if (letters.length === 0) return 'unclearSolution'
  if (letters.some((l) => !options.some((o) => o.letter === l))) return 'invalidOptions'
  // Nøyaktig ett riktig alternativ, med mindre elevteksten sier at flere kan være riktige.
  if (letters.length > 1 && !MANY_CORRECT.test(studentText)) return 'invalidOptions'
  if (isAssessment(studentText) && options.every((o) => optionNumber(o) === null && evaluate(o.text) === null)) return null

  const chosen = options.filter((o) => letters.includes(o.letter))
  const numbers = options.map(optionNumber)
  if (numbers.every((n) => n !== null)) {
    const values = numbers as number[]
    const results = equationsIn(solution).map((e) => e.result)
    if (ESTIMATE.test(studentText)) {
      // Overslag: det riktige alternativet er det som ligger nærmest det nøyaktige svaret – og bare ett gjør det.
      const exact = expressionIn(studentText)?.value ?? results.at(-1)
      if (exact === undefined) return null
      const distances = values.map((v) => Math.abs(v - exact))
      const best = Math.min(...distances)
      if (distances.filter((d) => d === best).length > 1) return 'invalidOptions'
      return letters.length === 1 && distances[options.findIndex((o) => o.letter === letters[0])] === best ? null : 'wrongSolution'
    }
    if (letters.length !== 1) return 'invalidOptions'
    const value = optionNumber(chosen[0])!
    const question = mainQuestion(studentText) ?? studentText
    const computed = results.at(-1)
    if (computed !== undefined && computed !== value) {
      // Svaret må rundes opp når alle skal få plass: «78 : 20 = 3 rest 18» gir 4 busser.
      if (!(asksRoundUp(question) && roundUpOk(studentText, solution, value))) return 'wrongSolution'
    }
    if (computed === undefined && !digitsIn(solution).includes(value)) return 'wrongSolution'
    if (asksRoundUp(question) && roundUpWrong(studentText, solution, value)) return 'wrongRemainder'
    // Distraktorene skal kunne forklares med en tankefeil – ikke være tilfeldige tall.
    const plausible = plausibleWrongAnswers(givenNumbers(studentText), results, value)
    if (values.some((v) => v !== value && !plausible.has(v))) return 'invalidOptions'
    return null
  }

  const expressions = options.map((o) => evaluate(o.text))
  if (expressions.every((v) => v !== null)) {
    // Regneuttrykk som alternativer: det riktige gir svaret i fasiten, regnearten passer fortellingen,
    // og ingen av de gale gir det samme svaret.
    if (letters.length !== 1) return 'invalidOptions'
    const index = options.findIndex((o) => o.letter === letters[0])
    const value = expressions[index]!
    if (!digitsIn(solution).includes(value)) return 'wrongSolution'
    if (expressions.some((v, i) => i !== index && v === value)) return 'invalidOptions'
    const ops = options[index].text.match(new RegExp(OP, 'g')) ?? []
    if (ops.length === 1) {
      const op = (({ '−': '-', x: '·', '×': '·', '*': '·', '/': ':' }) as Record<string, string>)[ops[0]] ?? ops[0]
      const story = studentText.split('\n').filter((l) => !/^\s*[A-F][).:]\s/.test(l)).join(' ')
      if (!operationFits(op as Operation, story)) return 'wrongOperation'
    }
  }
  return null
}

/** Kapasiteten i en «alle skal få plass»-situasjon («plass til 20», «20 i hver», «tar 4»). */
const capacityOf = (text: string) => {
  const m = /plass til (\d+)|(\d+) (?:\p{L}+ )?(?:i|på) hver|\btar (\d+)/iu.exec(merge(text))
  return m ? Number(m[1] ?? m[2] ?? m[3]) : null
}

/** Antallene som kan være de som skal ha plass: tall i oppgaven og mellomsvar som er større enn kapasiteten. */
const roundUpTotals = (studentText: string, solution: string, capacity: number) =>
  [...equationsIn(solution).map((e) => e.result), ...givenNumbers(studentText)].filter((t) => t > capacity)

/** Spørsmålene i oppgaveteksten («Resten tar buss.» er ikke et spørsmål om hva som blir til overs). */
const questionsIn = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.includes('?')).join(' ')

/** Svaret er riktig rundet opp for minst ett av antallene i situasjonen. */
function roundUpOk(studentText: string, solution: string, stated: number) {
  const capacity = capacityOf(studentText)
  if (!capacity) return false
  return roundUpTotals(studentText, solution, capacity).some((t) => roundUpProblem(t, capacity, stated, questionsIn(studentText), solution) === null)
}

/** Svaret er rest-svaret (antall hele grupper) når alle skal få plass – og ikke riktig for noe annet antall. */
function roundUpWrong(studentText: string, solution: string, stated: number) {
  const capacity = capacityOf(studentText)
  if (!capacity || roundUpOk(studentText, solution, stated)) return false
  return roundUpTotals(studentText, solution, capacity).some((t) => roundUpProblem(t, capacity, stated, questionsIn(studentText), solution) === 'wrongRemainder')
}

/**
 * Kontrollerer én AI-oppgave i en problemløsingsøkt. Rekkefølge: format og innhold utenfor temaet,
 * tallområdet, figurer som ikke vises, nivået, svaralternativer, fasit og regnesteg, og til slutt kravene
 * til fagområdet (regneuttrykk, modell, flere steg, svaralternativer). Kravene til fagområdet gjelder bare
 * økter med ett område.
 */
export function problemSolvingProblem(task: AiTaskDraft, { area, secondaryAreas = [] }: ProblemSolvingContext): ProblemSolvingProblem | null {
  // Oppgavesettet i Problemløsing er tekstoppgaver: et regnestykke appen retter viser regneuttrykket eleven skal finne.
  if (isMathDraft(task)) return 'format'
  const single = secondaryAreas.length === 0
  const { studentText, solution } = task
  const all = `${studentText} ${solution}`

  if (DECIMAL.test(all) || NEGATIVE.test(all) || OUTSIDE_TOPIC.test(studentText)) return 'offTopic'
  if (digitsIn(withoutLabels(all)).some((n) => n > numberLimit(area, task.level))) return 'outsideRange'
  // Modellen eller figuren må stå i teksten – appen viser ikke figurer eller bilder i Problemløsing.
  if (PICTURE.test(studentText)) return 'missingFigure'
  if ((MISSING_FIGURE.test(studentText) || READ_MODEL.test(studentText)) && !TEXT_MODEL.test(studentText)) return 'missingFigure'

  // Nivået: støtte og resonnement, ikke bare større tall.
  const assessment = isAssessment(studentText)
  if (task.level === 1 && assessment) return 'levelMismatch'
  if (task.level > 1 && STEP_MARKS.test(studentText)) return 'levelMismatch'
  if (task.level === 3 && !REASONING.test(studentText)) return 'levelMismatch'

  const options = parseOptions(studentText)
  if (options.length >= 2) {
    const problem = optionsProblem(studentText, solution, options)
    if (problem) return problem
  }

  const equations = equationsIn(solution)
  const results = equations.map((e) => e.result)
  const final = finalAnswer(solution)
  const given = givenNumbers(studentText)
  const create = CREATE.test(studentText)
  const question = mainQuestion(studentText) ?? studentText

  if (create) {
    // Eleven lager fortellingen: fasiten må si hvilket uttrykk den skal passe til og hva det gir.
    const target = expressionIn(studentText)
    if (equations.some((e) => evaluate(e.expression) !== e.result)) return 'wrongSolution'
    if (target && !equations.some((e) => evaluate(e.expression) === target.value && e.result === target.value)) return 'unclearSolution'
  } else if (options.length < 2 && !assessment) {
    // Svaret står ikke i oppgaveteksten («… = 52» eller «Svaret er 52»).
    if (final !== null && (equationsIn(studentText).some((e) => e.result === final) || /\bsvar(et)? (er|blir)\s*\d/i.test(studentText))) return 'revealedSolution'
    // Alle tallene fasiten regner med, finnes i oppgaven eller er mellomsvar (ellers mangler en opplysning).
    const known = new Set([...given, 1, ...(final !== null ? [final, final - 1, final + 1] : [])])
    for (const equation of equations) {
      if (equation.operands.some((n) => !known.has(n))) return area === 'flerstegsoppgaver' ? 'missingInfo' : 'wrongSolution'
      known.add(equation.result)
    }
    // Svaret må være resultatet av det siste steget – ikke et mellomsvar, og ikke et annet tall enn regnestykket gir.
    const last = results.at(-1)
    if (final !== null && last !== undefined && final !== last && !asksRoundUp(question)) {
      if (results.slice(0, -1).includes(final) || !answerSentenceNumbers(solution).includes(last)) return 'wrongSolution'
    }
    // Når alle skal få plass, rundes svaret opp (samme kontroll som i Divisjon).
    if (final !== null && asksRoundUp(question) && roundUpWrong(studentText, solution, final)) return 'wrongRemainder'
  }

  if (!single) return null
  if (area === 'regnefortelling-regneuttrykk') {
    if (!EXPRESSION_WORDS.test(studentText)) return 'wrongArea'
    // Ett regnesteg: regnearten må passe handlingen. To steg: gange krever like grupper, deling likedeling.
    const operations = equations.flatMap((e) => e.operators) as Operation[]
    if (!create && !assessment && options.length < 2) {
      const story = withoutLabels(studentText)
      if (operations.length === 1 && !operationFits(operations[0], story)) return 'wrongOperation'
      if (operations.length > 1 && operations.some((op) => (op === '·' || op === ':') && !operationFits(op, story))) return 'wrongOperation'
    }
  }
  if (area === 'bruke-modeller' && !usesModel(studentText) && !TABLE.test(studentText)) return 'missingModel'
  if (area === 'flerstegsoppgaver') {
    // Minst to regnesteg: tre opplysninger i oppgaven, og løsningsforslaget viser hvert steg.
    if (given.length < 3) return 'missingSteps'
    // Å tolke svaret og runde opp fordi alle skal være med, er også et steg (78 elever, 20 i hver buss: 4 busser).
    const roundUpStep = final !== null && asksRoundUp(question) && roundUpOk(studentText, solution, final) ? 1 : 0
    if (!assessment && equations.reduce((n, e) => n + e.operators.length, 0) + roundUpStep < 2) return 'missingSteps'
    if (task.level === 1 && !STEP_LINES.test(studentText)) return 'levelMismatch'
  }
  if (area === 'flervalg-begrunnelse' && options.length < 2 && !create) return 'wrongArea'
  return null
}
