import { isMathDraft, type AiTaskDraft, type DivisionArea, type DivisionType } from '../src/ai/contract.ts'

// Faglige kontroller for AI-oppgaver i Divisjon. Ingen ordsøk alene: der det går, leses
// delestykket (eksplisitt «a : b» eller de to tallene i situasjonen) og svaret regnes ut.
// Kontrollene gjelder alltid – også når læreren har skrevet «Andre ønsker».

/** Hvorfor en divisjonsoppgave ikke kan brukes. */
export type DivisionProblem =
  | 'divisionByZero'
  | 'wrongSolution'
  | 'wrongDivisionType'
  | 'wrongRemainder'
  | 'missingModel'
  | 'missingRelation'
  | 'outsideTables'
  | 'offTopic'

export interface DivisionContext {
  area: DivisionArea
  secondaryAreas?: readonly DivisionArea[]
  divisionType?: DivisionType
  /**
   * Læreren har bedt om at alle skal få plass («Andre ønsker»): oppgaver med rest må spørre hvor mange
   * grupper som trengs totalt, og fasiten må runde opp. Se wishRequiresRoundUp.
   */
  roundUpRequired?: boolean
}

/** Ønsker som sier at alle personer eller gjenstander skal få plass, eller at svaret skal rundes opp. */
const ROUND_UP_WISH =
  /få plass|plass til alle|(skal|må) (være |bli |komme )?med\b|ingen (skal|må) (bli igjen|stå igjen|stå over)|rund\w* opp|oppover|hvor mange \p{L}+ (som )?(trengs|må)|antall \p{L}+ (som )?(trengs|må)/iu

/** Om lærerens ønske krever at svaret rundes opp fordi alle skal få plass. */
export const wishRequiresRoundUp = (wishes: string) => ROUND_UP_WISH.test(wishes)

/** Største divisor og største antall hele grupper (gangetabellen). */
export const MAX_DIVISOR = 10
export const MAX_QUOTIENT = 10

const merge = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, '$1')
/**
 * Deletegnet mellom to tall: «24 : 6» eller «24:6» – ikke kolon foran en liste («hopp på 5: 30, 25 …»).
 * Brukes i regex-kildene under.
 */
const DIV = String.raw`(?:\s+[:/]\s+|[:/])`
const numbersIn = (text: string) => (merge(text).match(/\d+/g) ?? []).map(Number)

const DIVISION_BY_ZERO = new RegExp(
  String.raw`\d${DIV}0(?!\d)|` +
    /\b(del\w*|fordel\w*)\b[^.?!]{0,40}\b(på|mellom|i) 0\b|\b0 (like (store )?)?(grupper|deler|lag|barn|elever|poser|esker|bunker)\b/.source,
  'i',
)
export const DECIMAL = /\d[,.]\d/
export const NEGATIVE = /(^|[\s(=])[-−]\d|minusgrad|kuldegrad|under null/i
const BLANK_PRODUCT = /(_+|□|\?)\s*[·x×*]\s*\d+\s*=\s*\d+|\d+\s*[·x×*]\s*(_+|□|\?)\s*=\s*\d+/
const DIVISION_SIGNAL =
  /\d\s+[:/]\s+(\d|_)|\d[:/]\d|_+\s*[:/]|\b(del|dele|deler|deles|delt|delte)\b|\bfordel|\blikt\b|\bi hver\b|\bpå hver|\bved hvert?\b|\bmed \d+ (\p{L}+ )?i hver|til overs|\brest\b|divisjon|delestykk|\bgrupper?\b|\bhopp\w*|\brader\b|kolonner|blokk|plass til|regnefamili/iu
const MULTIPLICATION_WORD = /\d\s*[·x×*]\s*(\d|_)|_+\s*[·x×*]|gange|multiplik/i
const DIVISION_WORD = /\d\s+[:/]\s+(\d|_)|\d[:/]\d|_+\s*[:/]|\bdel(e|er|es|t|estykke\w*)?\b|divisjon/i
/** Rest med tall («3 rest 2», «2 epler til overs», «de 2 som blir igjen») eller et spørsmål om hva som blir til overs. */
const REMAINDER_WORD = /\brest\s+[1-9]|\b[1-9]\d*\s+(\p{L}+\s+){0,2}(til overs|igjen)\b|hvor mange (\p{L}+ ){0,3}(blir )?(til overs|igjen)/iu
/** Et ukjent tall i et delestykke («__ : 8 = 9», «72 : __ = 8»). */
const BLANK_DIVISION = /(_+|□)\s*[:/]|[:/]\s*(_+|□)/
/** Et ferdig delestykke med svar i oppgaveteksten («Vis 32 : 4 = 8 …») – da er det ikke noe svar å regne ut. */
const COMPLETE_DIVISION = new RegExp(String.raw`\d${DIV}\d+\s*=\s*\d`)
/** Eleven skal lage noe selv (regnefortelling): fasiten er en beskrivelse, ikke ett svar. */
const CREATE = /\blag (en|to|ei|et|egne?)\b|regnefortelling/i
/** Eleven vurderer en påstand – kontrolleres i assessmentProblem. */
const CLAIM = /\b(har \p{L}+ rett|stemmer det|sier at|hevder|skrev|skriver|finn feilen)\b/iu
/** Situasjonen krever at alle får plass: svaret er antall grupper som trengs (rundes opp). */
const ROUND_UP = /\btrengs\b|\btrenger\b|\bmå (de|vi|du|han|hun|man|klassen|skolen) (ha|bestille|bruke|kjøpe|leie)\b|for at alle|alle (skal )?få plass|plass til alle|\bbestille\b/i
/** Spørsmålet gjelder bare hele (fulle) grupper. */
const FULL_GROUPS = /\b(fulle|hele|helt fulle)\b/i
const ASKS_REMAINDER = /til overs|\bigjen\b|\brest(en)?\b|den siste/i

/** Spørsmålet krever at alle får plass (hvor mange grupper som trengs) – ikke bare hvor mange hele grupper det blir. */
export const asksRoundUp = (question: string) => !FULL_GROUPS.test(question) && ROUND_UP.test(question)

/**
 * Svaret når alle skal få plass: `total` fordelt i grupper på `divisor`. Går delingen opp, er svaret kvotienten.
 * Blir det rest, er rest-svaret (antall hele grupper) ikke godt nok – svaret er én gruppe mer. Spør oppgaven
 * også hva som blir til overs, må resten stå i fasiten. Brukes av Divisjon og Problemløsing (flerstegsoppgaver).
 */
export function roundUpProblem(total: number, divisor: number, stated: number, studentText: string, solution: string): 'wrongRemainder' | 'wrongSolution' | null {
  const [q, r] = [Math.floor(total / divisor), total % divisor]
  if (r === 0) return stated === q ? null : 'wrongSolution'
  if (stated === q) return 'wrongRemainder'
  if (stated !== q + 1) return 'wrongSolution'
  if (ASKS_REMAINDER.test(studentText) && !numbersIn(solution).includes(r)) return 'wrongSolution'
  return null
}

/** Konkrete representasjoner eleven bruker eller tolker. */
const MODEL = /tallinje|rutenett|blokkmodell|\bblokk(en|a)?\b|\bhopp\w*|\brader?\b|\bkolonner?\b|\bruter\b|\[\s*[\d?]*\s*\]/i
const DRAW = /\b(tegn\w*|ring\w* rundt|fordel\w*|vis\w*|marker\w*|legg\w*)\b/i
/** Eleven forklarer hva tallene betyr i modellen eleven selv lager. */
const EXPLAIN = /\bforklar\w*\b[^.?!]*\b(betyr|viser)\b/i
const DRAWABLE = /\b(prikker|kryss|ringer?|sirkler?|streker|klosser|like grupper|bunker|figur)\b/i

/** Delestykkene som står i teksten: «a : b» (ikke «Fyll inn: 28», der kolon følger et ord). */
function explicitDivisions(text: string): [number, number][] {
  return [...merge(text).matchAll(new RegExp(String.raw`(\d+)${DIV}(\d+)`, 'g'))].map(([, a, b]) => [Number(a), Number(b)])
}

function explicitProducts(text: string): [number, number][] {
  return [...merge(text).matchAll(/(\d+)\s*[·x×*]\s*(\d+)/g)].map(([, a, b]) => [Number(a), Number(b)])
}

/**
 * Delestykket oppgaven handler om: ett eksplisitt «a : b» i oppgaveteksten, ellers de to tallene i
 * situasjonen (det største er tallet som deles). Null når det ikke kan leses sikkert.
 */
export function divisionOf(studentText: string): { total: number; divisor: number } | null {
  const explicit = explicitDivisions(studentText)
  const distinct = [...new Map(explicit.map(([a, b]) => [`${a}:${b}`, [a, b] as const])).values()]
  if (distinct.length === 1) return { total: distinct[0][0], divisor: distinct[0][1] }
  if (distinct.length > 1 || explicitProducts(studentText).length > 0 || BLANK_PRODUCT.test(studentText) || BLANK_DIVISION.test(studentText)) return null
  const numbers = [...new Set(numbersIn(studentText).filter((n) => n > 0))]
  if (numbers.length !== 2) return null
  const [divisor, total] = numbers.sort((a, b) => a - b)
  return { total, divisor }
}

/** Svaret i fasiten: det første tallet utenfor regnestykkene, ellers resultatet av det siste regnestykket. */
export function statedAnswer(solution: string): number | null {
  const text = merge(solution)
  const free = text.replace(/\d+(?:\s*[:/·x×*+\-−]\s*\d+)+(?:\s*=\s*\d+)?(?:\s*rest\s*\d+)?/g, ' ')
  const first = /\d+/.exec(free)
  if (first) return Number(first[0])
  const results = [...text.matchAll(/=\s*(\d+)/g)]
  return results.length ? Number(results.at(-1)![1]) : null
}

/** Det første spørsmålet med «hvor mange», fram til en betingelse («når», «hvis», «med», komma). */
export function mainQuestion(text: string) {
  const question = text.split(/(?<=[.?!])\s+/).find((s) => /hvor mange/i.test(s))
  return question ? question.split(/,|\bnår\b|\bhvis\b|\bmed\b|\bslik at\b/i)[0] : null
}

/**
 * Divisjonstypen spørsmålet viser: «hvor mange får hver / er det i hver» er delingsdivisjon (antall
 * grupper er kjent), «hvor mange poser / hopp / bord» er målingsdivisjon (størrelsen er kjent).
 */
export function divisionTypeOf(text: string): DivisionType | null {
  const question = mainQuestion(text)
  if (!question) return null
  return /\bhver(t|n)?\b|\bper\b/i.test(question) ? 'deling' : 'maling'
}

/** Typen fasiten eller tilpasningen sier at oppgaven er – bare når én av dem er nevnt. */
function namedType(text: string): DivisionType | null {
  const deling = /delingsdivisjon/i.test(text)
  const maling = /målingsdivisjon/i.test(text)
  return deling === maling ? null : deling ? 'deling' : 'maling'
}

/** Om teksten faktisk ber eleven bruke eller tolke en representasjon – ikke bare nevner ordet «modell». */
export const usesModel = (text: string) =>
  MODEL.test(text) || (DRAW.test(text) && DRAWABLE.test(text)) || (/\b(tegn|vis)\w*\b/i.test(text) && /modell/i.test(text) && EXPLAIN.test(text))

/** Om oppgaven viser sammenhengen mellom gange og dele. */
function showsRelation(task: AiTaskDraft) {
  if (isMathDraft(task)) {
    if (task.operator === '/') return /gange|gangestykk|multiplik|·|motsatt/i.test(task.instruction)
    if (task.operator === '*') return /\bdel|delestykk|divisjon|:/i.test(task.instruction)
    return false
  }
  const all = `${task.studentText} ${task.solution}`
  return BLANK_PRODUCT.test(task.studentText) || FAMILY.test(task.studentText) || (MULTIPLICATION_WORD.test(all) && DIVISION_WORD.test(all))
}

/** Regnefamilie: «Bruk tallene 6, 9 og 54». */
const FAMILY = /tallene (\d+), (\d+) og (\d+)/i

/** Regnefamilie: tallene må høre sammen (a · b = c), og fasiten må bare bruke dem. */
function familyProblem(studentText: string, solution: string) {
  const m = FAMILY.exec(merge(studentText))
  if (!m) return false
  const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])].sort((a, b) => a - b)
  if (x * y !== z) return true
  const allowed = new Set([x, y, z])
  return [...explicitDivisions(solution), ...explicitProducts(solution)].some(([a, b]) => !allowed.has(a) || !allowed.has(b))
}

/**
 * Kontrollerer én AI-oppgave i en divisjonsøkt. Rekkefølge: divisjon på 0, tall som ikke hører til
 * (desimaltall, negative tall), at oppgaven er divisjon, tallområdet, fasiten og resten, divisjonstypen
 * og kravene til fagområdet (sammenheng med gange, rest og modell). Fagområdekravene gjelder bare
 * økter med ett område – oppsummeringsøkter med flere områder får de felles kontrollene.
 */
export function divisionProblem(task: AiTaskDraft, { area, secondaryAreas = [], divisionType, roundUpRequired = false }: DivisionContext): DivisionProblem | null {
  const single = secondaryAreas.length === 0
  const allowsRemainder = area === 'divisjon-med-rest' || secondaryAreas.includes('divisjon-med-rest')
  const studentText = isMathDraft(task) ? task.instruction : task.studentText
  const solution = isMathDraft(task) ? '' : task.solution
  const all = `${studentText} ${solution}`

  if (isMathDraft(task)) {
    if (task.operator === '/' && task.b === 0) return 'divisionByZero'
    if (!['/', '*'].includes(task.operator)) return 'offTopic'
  }
  if (DIVISION_BY_ZERO.test(all)) return 'divisionByZero'
  if (DECIMAL.test(all) || NEGATIVE.test(all)) return 'offTopic'

  const divisions: [number, number][] = isMathDraft(task)
    ? task.operator === '/' ? [[task.a, task.b]] : []
    : explicitDivisions(all)
  const products: [number, number][] = isMathDraft(task) ? (task.operator === '*' ? [[task.a, task.b]] : []) : explicitProducts(all)
  const division = isMathDraft(task) ? null : divisionOf(task.studentText)
  if (division) divisions.push([division.total, division.divisor])
  if (divisions.some(([, b]) => b === 0)) return 'divisionByZero'
  const stated = isMathDraft(task) ? null : statedAnswer(task.solution)

  // Et gangestykke i en situasjon med like grupper («3 poser med 4 i hver, hvor mange til sammen?») er ikke
  // divisjon – med mindre oppgaven også deler (f.eks. rutenett med ett gangestykke og to delestykker).
  if (division && stated !== null && stated === division.total * division.divisor && stated !== Math.floor(division.total / division.divisor)) {
    if (explicitDivisions(all).length === 0) return 'offTopic'
  }
  // Divisjon: et ord eller tegn for deling i oppgaveteksten, eller en fasit som er svaret på delestykket i
  // situasjonen («Hver taxi tar 4 elever …»: 29 : 4 gir 7 eller 8).
  const answersDivision =
    !!division && stated !== null && [Math.floor(division.total / division.divisor), Math.ceil(division.total / division.divisor)].includes(stated)
  if (!isMathDraft(task) && !DIVISION_SIGNAL.test(studentText) && !BLANK_PRODUCT.test(studentText) && !answersDivision) return 'offTopic'

  // Tallområdet: delestykker og gangestykker innenfor gangetabellen.
  if (divisions.some(([a, b]) => b > MAX_DIVISOR || Math.floor(a / b) > MAX_QUOTIENT)) return 'outsideTables'
  if (products.some(([a, b]) => Math.min(a, b) > MAX_DIVISOR || Math.max(a, b) > MAX_QUOTIENT * MAX_DIVISOR)) return 'outsideTables'
  if (!isMathDraft(task) && familyProblem(task.studentText, task.solution)) return 'wrongSolution'

  // Rest: bare der økta har rest. Ellers skal alle delestykkene gå opp.
  const hasRemainder = divisions.some(([a, b]) => a % b !== 0) || REMAINDER_WORD.test(all)
  if (hasRemainder && !allowsRemainder) return 'wrongRemainder'
  if (single && area === 'divisjon-med-rest' && !hasRemainder) return 'wrongRemainder'
  // Også når delestykket ikke kan leses (flere tall): med ønsket om at alle skal få plass er «hele grupper og rest» feil.
  if (roundUpRequired && hasRemainder && FULL_GROUPS.test(mainQuestion(studentText) ?? '')) return 'wrongRemainder'

  // Fasiten: svaret må stemme med delestykket og situasjonen (ikke for vurderingsoppgaver og «lag selv»).
  if (isMathDraft(task)) {
    // Tallene i instruksjonen må være de samme som i regnestykket appen retter.
    const told = divisionOf(task.instruction)
    if (told && task.operator === '/' && (told.total !== task.a || told.divisor !== task.b)) return 'wrongSolution'
  } else if (division && !CREATE.test(task.studentText) && !CLAIM.test(task.studentText) && !COMPLETE_DIVISION.test(task.studentText)) {
    const { total, divisor } = division
    const [q, r] = [Math.floor(total / divisor), total % divisor]
    const question = mainQuestion(task.studentText) ?? task.studentText
    if (stated === null) return 'wrongSolution'
    // Læreren ba om at alle skal få plass: en oppgave med rest må spørre hvor mange som trengs – ikke om
    // hele grupper og hva som blir til overs – og fasiten må runde opp.
    if (roundUpRequired && r > 0 && (!asksRoundUp(question) || stated !== q + 1)) return 'wrongRemainder'
    if (stated === total * divisor && stated !== q) {
      // Gange i en situasjon med like grupper (godtatt over fordi oppgaven også deler).
    } else if (r === 0) {
      if (stated !== q) return 'wrongSolution'
    } else if (asksRoundUp(question)) {
      // Konteksten krever at alle får plass: rest-svaret (q) er ikke godt nok.
      const problem = roundUpProblem(total, divisor, stated, task.studentText, task.solution)
      if (problem) return problem
    } else {
      // Hele grupper og rest: antall hele grupper og hvor mange som blir til overs.
      if (stated === q + 1) return 'wrongRemainder'
      if (stated !== q || !numbersIn(task.solution).includes(r)) return 'wrongSolution'
    }
  }

  // Divisjonstypen: oppgavetekst, fasit og tilpasning må være enige – og passe økta.
  if (!isMathDraft(task) || /hvor mange/i.test(task.instruction)) {
    const asked = divisionTypeOf(studentText)
    const named = namedType(`${solution} ${task.adaptation}`)
    if (asked && named && asked !== named) return 'wrongDivisionType'
    if (single && divisionType && ((asked && asked !== divisionType) || (named && named !== divisionType))) return 'wrongDivisionType'
  }

  if (!single) return null
  if (area === 'multiplikasjon-divisjon' && !showsRelation(task)) return 'missingRelation'
  if (area === 'modeller' && !usesModel(studentText)) return 'missingModel'
  return null
}
