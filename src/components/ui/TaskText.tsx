import { isBlankCell, isBoxEquationLine, operatorTemplate, readDataBlock, textBlocks, type DataBlock } from '../../ai/taskText'

/** Feltene eleven fyller ut i teksten (tomme ruter i tabeller og □ i likninger), i rekkefølge. Bare i elevvisningen. */
export interface TextSlots {
  values: string[]
  onChange: (index: number, value: string) => void
  readOnly: boolean
}

interface TaskTextProps {
  text: string
  as?: 'p' | 'h2'
  className?: string
  /** Elevvisningen: tomme ruter og □ blir inputbokser. Uten (lærerkortet) vises de som tomme ruter. */
  slots?: TextSlots
  /** Elevvisningen: regnetegnet eleven har valgt, vist der det mangler («10 [·] 5 = 50»). */
  operator?: string
}

/**
 * Oppgavetekst i Regning, lest fra det faste tekstformatet: søylediagrammer med ■ vises som rader med telbare ruter som
 * starter på samme sted, tabeller som ekte tabeller med linjer og overskriftsrad (uten |), og likninger med □ og
 * regnestykker der regnetegnet mangler vises med en boks der eleven svarer. Resten av teksten vises med linjeskift som før.
 */
export function TaskText({ text, as: Tag = 'p', className = '', slots, operator }: TaskTextProps) {
  // Nummeret til hver boks regnes ut her, før noe tegnes, i samme rekkefølge som svaret lagres (slotCount). Numrene må
  // ikke deles ut mens boksene tegnes: React kan tegne en komponent flere ganger, og da fikk boksene feil nummer og
  // tallet eleven skrev, forsvant.
  const blocks = layoutBlocks(text, !!slots, operator !== undefined)
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {blocks.map((block, i) => {
        if (block.kind === 'data') return <DataView key={i} data={block.data} slots={slots} start={block.start} />
        return block.parts.map((part, j) =>
          typeof part === 'string' ? (
            part.trim() ? (
              <Tag key={`${i}-${j}`} className="whitespace-pre-wrap">
                {part.trim()}
              </Tag>
            ) : null
          ) : part.kind === 'equation' ? (
            <BoxEquation key={`${i}-${j}`} line={part.line} slots={slots!} start={part.start} />
          ) : (
            <OperatorLine key={`${i}-${j}`} line={part.line} operator={operator ?? ''} />
          ),
        )
      })}
    </div>
  )
}

type Part = string | { kind: 'equation'; line: string; start: number } | { kind: 'operator'; line: string }
type LaidOut = { kind: 'data'; data: DataBlock; start: number } | { kind: 'text'; parts: Part[] }

/** Blokkene i teksten, med nummeret til den første boksen i hver tabell og likning (bokser telles i rekkefølge). */
function layoutBlocks(text: string, withSlots: boolean, withOperator: boolean): LaidOut[] {
  let next = 0
  return textBlocks(text).map((block): LaidOut => {
    if (block.kind === 'data') {
      const data = readDataBlock(block.text)
      const start = next
      if (withSlots && data.kind === 'table') next += data.rows.flat().filter(isBlankCell).length
      return { kind: 'data', data, start }
    }
    // Vanlig tekst, med likninger og regnestykker på egne linjer.
    const parts: Part[] = []
    for (const line of block.text.split('\n')) {
      if (withSlots && isBoxEquationLine(line)) {
        parts.push({ kind: 'equation', line, start: next })
        next += (line.match(/□/g) ?? []).length
      } else if (withOperator && operatorTemplate(line)) parts.push({ kind: 'operator', line })
      else if (typeof parts.at(-1) === 'string') parts[parts.length - 1] += `\n${line}`
      else parts.push(line)
    }
    return { kind: 'text', parts }
  })
}

/** En liten inputboks som bare tar tall (høyst seks sifre). Brukes i tabeller, likninger og svarfeltene i Regning. */
export function NumberInput({ value, label, readOnly, onChange }: { value: string; label: string; readOnly: boolean; onChange: (value: string) => void }) {
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="h-11 w-16 rounded-lg border-2 border-secondary bg-background text-center text-xl text-on-background outline-none read-only:bg-tertiary"
    />
  )
}

/** Boks nr. `index` i teksten. */
function NumberBox({ value, label, slots, index }: { value: string; label: string; slots: TextSlots; index: number }) {
  return <NumberInput value={value} label={label} readOnly={slots.readOnly} onChange={(v) => slots.onChange(index, v)} />
}

/** «□ + □ + 5 = 45»: én boks for hver □, i samme rekkefølge som i likningen. */
function BoxEquation({ line, slots, start }: { line: string; slots: TextSlots; start: number }) {
  const pieces = line.trim().split('□')
  return (
    <p className="flex flex-wrap items-center gap-2 font-medium whitespace-pre" aria-label="Likning">
      {pieces.map((piece, k) => {
        const index = k < pieces.length - 1 ? start + k : -1
        return (
          <span key={k} className="flex items-center gap-2">
            {piece.trim() && <span>{piece.trim()}</span>}
            {index >= 0 && <NumberBox value={slots.values[index] ?? ''} label={`Tallet som mangler, nr. ${index + 1}`} slots={slots} index={index} />}
          </span>
        )
      })}
    </p>
  )
}

/** «10 __ 5 = 50»: regnetegnet eleven velger med knappene vises i ruta. */
function OperatorLine({ line, operator }: { line: string; operator: string }) {
  const t = operatorTemplate(line)!
  return (
    <p className="flex flex-wrap items-center gap-3 font-medium" aria-label={`Regnestykke: ${t.left}, regnetegn som mangler, ${t.right} er lik ${t.result}`}>
      <span>{t.left}</span>
      <span className="flex size-11 items-center justify-center rounded-lg border-2 border-dashed border-secondary text-2xl">{operator}</span>
      <span>
        {t.right} = {t.result}
      </span>
    </p>
  )
}

/** Søylediagram eller tabell. */
function DataView({ data, slots, start }: { data: DataBlock; slots?: TextSlots; start: number }) {
  if (data.kind === 'bars') {
    // Hver ■ er en egen rute med litt luft imellom, så stemmene er lette å telle. Alle søylene starter på samme sted.
    return (
      <div className="grid w-fit max-w-full grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 overflow-x-auto text-[0.85em]" role="img" aria-label={data.rows.map((r) => `${r.label}: ${r.count} ■`).join(', ')}>
        {data.rows.map((row, i) => (
          <div key={i} className="contents">
            <span className="font-medium">{row.label}</span>
            <span className="flex gap-1.5">
              {Array.from({ length: row.count }, (_, k) => (
                <span key={k} aria-hidden className="block size-[0.9em] shrink-0 rounded-[3px] bg-primary" />
              ))}
            </span>
          </div>
        ))}
      </div>
    )
  }
  // Tabell med linjer, overskriftsrad og tall høyrejustert. Brede tabeller kan rulles sidelengs.
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="border-collapse text-[0.85em]">
        <thead>
          <tr>
            {data.header.map((cell, c) => (
              <th key={c} scope="col" className="border border-card-border bg-surface-light px-3 py-1.5 text-left font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const blank = isBlankCell(cell)
                // Boksnummeret regnes ut fra plasseringen: de tomme rutene telles rad for rad fra den første boksen i tabellen.
                const index = blank && slots ? start + blanksBefore(data.rows, r, c) : -1
                return (
                  <td key={c} className={`border border-card-border px-3 py-1.5 ${/^\d/.test(cell) || blank ? 'text-right tabular-nums' : 'text-left'}`}>
                    {blank ? (
                      slots ? (
                        <NumberBox value={slots.values[index] ?? ''} label={`Tallet i ${data.header[c] ?? 'kolonnen'} for ${row[0]}`} slots={slots} index={index} />
                      ) : (
                        <span aria-label="Tomt felt" className="inline-block h-6 w-10 rounded border-2 border-dashed border-secondary align-middle" />
                      )
                    ) : (
                      cell
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Antall tomme ruter før ruta i rad `r`, kolonne `c` (rad for rad). */
function blanksBefore(rows: string[][], r: number, c: number) {
  let count = 0
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows[i].length; j++) {
      if (i === r && j === c) return count
      if (isBlankCell(rows[i][j])) count++
    }
  }
  return count
}
