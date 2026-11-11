// Oppgavetekst delt i vanlig tekst og datablokker (diagrammer og tabeller skrevet som tekst, én rad per linje med |
// mellom kolonnene), likninger med □ og regnestykker der regnetegnet mangler (Regning). AI-en og oppgavereglene skriver
// det faste tekstformatet; appen leser det og viser søylediagrammer, tabeller, inputbokser og knapper.
// Rene funksjoner uten React, så de kan testes i Node. Filen skal ikke importere noe.

export type TextBlock = { kind: 'text' | 'data'; text: string }

/** En linje i et diagram eller en tabell: tekst på begge sider av en |. */
export const isDataLine = (line: string) => /\S\s*\|\s*\S/.test(line)

/** Teksten delt i blokker. Tekst uten datalinjer blir én tekstblokk (vises som før). */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  for (const line of text.split('\n')) {
    const kind = isDataLine(line) ? 'data' : 'text'
    const last = blocks.at(-1)
    if (last && last.kind === kind) last.text += `\n${line}`
    else blocks.push({ kind, text: line })
  }
  return blocks
}

/** Om teksten har et diagram eller en tabell. */
export const hasDataBlock = (text: string) => text.split('\n').some(isDataLine)

/** En datablokk lest som søylediagram (navn og antall ■) eller tabell (overskriftsrad og rader). */
export type DataBlock = { kind: 'bars'; rows: { label: string; count: number }[] } | { kind: 'table'; header: string[]; rows: string[][] }

/** Leser en datablokk: søylediagram når hver rad er «navn | ■■■», ellers tabell med den første raden som overskrift. */
export function readDataBlock(text: string): DataBlock {
  const rows = text.split('\n').map((line) => line.split('|').map((c) => c.trim()))
  if (rows.every((r) => r.length === 2 && /^■+$/.test(r[1].replace(/\s/g, '')))) {
    return { kind: 'bars', rows: rows.map(([label, bar]) => ({ label, count: bar.replace(/\s/g, '').length })) }
  }
  const [header, ...body] = rows
  return { kind: 'table', header, rows: body }
}

/** Et tomt felt i en tabell («__»): eleven skriver tallet der. */
export const isBlankCell = (cell: string) => /^_{2,}$/.test(cell.trim())

/** En linje som bare er en likning med □ («□ + 5 = 18», «20 + 4 = □ + 3»): hver □ blir en inputboks. */
export const isBoxEquationLine = (line: string) => /□/.test(line) && /=/.test(line) && /^[\d□\s+\-−·×*:/()=]+$/.test(line.trim())

/** Et regnestykke der regnetegnet mangler («10 __ 5 = 50»), eller null. */
export function operatorTemplate(line: string): { left: string; right: string; result: string } | null {
  const m = /^\s*(\d+)\s*_{2,}\s*(\d+)\s*=\s*(\d+)\s*$/.exec(line)
  return m ? { left: m[1], right: m[2], result: m[3] } : null
}

/** Setningen som ramser opp regnetegnene – den vises ikke når appen viser knappene. */
const OPERATOR_CHOICES = /\s*Velg (?:mellom|blant) \+, −, · (?:og|eller) :\.?/

/** Regnetegnene eleven velger mellom (knappene lages av appen). */
export const OPERATOR_OPTIONS = ['+', '−', '·', ':'] as const

/** Teksten eleven ser når knappene for regnetegnet vises: uten setningen som ramser opp tegnene. */
export const withoutOperatorChoices = (text: string) => text.replace(OPERATOR_CHOICES, '')

/** Antall felt eleven fyller ut i teksten: tomme ruter i tabeller og □ i likninger, i rekkefølge. */
export function slotCount(text: string): { cells: number; boxes: number } {
  let cells = 0
  let boxes = 0
  for (const block of textBlocks(text)) {
    if (block.kind === 'data') {
      const data = readDataBlock(block.text)
      if (data.kind === 'table') cells += data.rows.flat().filter(isBlankCell).length
    } else {
      for (const line of block.text.split('\n')) if (isBoxEquationLine(line)) boxes += (line.match(/□/g) ?? []).length
    }
  }
  return { cells, boxes }
}

/** Oppgaver med a) og b): teksten før delene og hver del for seg (hver får sitt eget skrivefelt). */
export function lettered(text: string): { intro: string; parts: { label: string; text: string }[] } | null {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => /^\s*[a-d]\)\s/.test(l))
  if (first < 0) return null
  const parts = lines.slice(first).map((l) => /^\s*([a-d])\)\s+(.*)$/.exec(l))
  if (parts.length < 2 || parts.some((p) => !p)) return null
  return { intro: lines.slice(0, first).join('\n'), parts: parts.map((p) => ({ label: `${p![1]})`, text: p![2] })) }
}

/** Om oppgaven ber eleven forklare eller begrunne (da får eleven et eget skrivefelt for forklaringen). */
export const asksExplanation = (text: string) => /\b(forklar|begrunn)/i.test(text)

/** Spørsmålene i teksten utenfor diagrammer og tabeller (setninger som slutter med «?»), i rekkefølge. */
export function questionsIn(text: string): string[] {
  return textBlocks(text)
    .filter((b) => b.kind === 'text')
    .flatMap((b) => b.text.match(/[^.?!\n]+\?/g) ?? [])
    .map((q) => q.trim())
}

/** Teksten uten spørsmålene (de står over svarfeltene i stedet). Tomme linjer som blir igjen, fjernes. */
export function withoutQuestions(text: string, questions: string[]): string {
  let rest = text
  for (const q of questions) rest = rest.replace(q, '')
  return rest
    .split('\n')
    .map((line) => (isDataLine(line) ? line : line.trim()))
    .filter((line) => line.trim() !== '')
    .join('\n')
    .trim()
}

/** Navnene i diagrammet eller tabellen (radene), til svarknappene på spørsmål som «Hva fikk flest stemmer?». */
export function labelsIn(text: string): string[] {
  for (const block of textBlocks(text)) {
    if (block.kind !== 'data') continue
    const data = readDataBlock(block.text)
    return data.kind === 'bars' ? data.rows.map((r) => r.label) : data.rows.map((r) => r[0])
  }
  return []
}
