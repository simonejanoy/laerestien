import type { TaskFigure as Figure } from '../../types'
import { ColorFigure } from './ColorFigure'
import { DotFigure } from './DotFigure'
import { GeometryFigure } from './GeometryFigure.ts'

/**
 * Tegner figuren til en oppgave: rutefigur, analog klokke, plan figur, vinkel, figurtall med prikker eller fargemønster. Brukes i lærerens
 * oppgavekort og i elevvisningen (som også er lærerens elevvisning), så figuren ser lik ut overalt.
 */
export function TaskFigure({ figure, size = 'md' }: { figure: Figure; size?: 'sm' | 'md' }) {
  if (figure.kind === 'shape' || figure.kind === 'angle') return <GeometryFigure figure={figure} size={size} />
  if (figure.kind === 'dots') return <DotFigure figure={figure} size={size} />
  if (figure.kind === 'colors') return <ColorFigure figure={figure} size={size} />
  return figure.kind === 'grid' ? <GridFigure rows={figure.rows} size={size} /> : <Clock time={figure.time} size={size} />
}

/** Rutefigur der hver rute er 1 cm². */
function GridFigure({ rows, size }: { rows: string[]; size: 'sm' | 'md' }) {
  const cell = size === 'sm' ? 18 : 30
  const width = Math.max(...rows.map((r) => r.length)) * cell
  const height = rows.length * cell

  return (
    <svg
      width={width + 2}
      height={height + 2}
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      role="img"
      aria-label="Figur på rutenett. Hver rute er 1 cm²."
      className="max-w-full"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === '#' ? (
            <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} className="fill-surface-light stroke-primary" strokeWidth={1.5} />
          ) : null,
        ),
      )}
    </svg>
  )
}

/** Analog klokke med time- og minuttviser, tegnet som på arbeidsarkene. */
function Clock({ time, size }: { time: string; size: 'sm' | 'md' }) {
  const [h, m] = time.split(':').map(Number)
  const px = size === 'sm' ? 96 : 150
  // Vinkel i grader med klokka, fra kl. 12.
  const minuteAngle = m * 6
  const hourAngle = (h % 12) * 30 + m * 0.5
  const point = (angle: number, length: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: 50 + length * Math.cos(rad), y: 50 + length * Math.sin(rad) }
  }
  const hour = point(hourAngle, 24)
  const minute = point(minuteAngle, 36)

  return (
    <svg width={px} height={px} viewBox="0 0 100 100" role="img" aria-label="Analog klokke" className="shrink-0 text-primary">
      <circle cx={50} cy={50} r={46} className="fill-background" stroke="currentColor" strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => {
        const outer = point(i * 30, 42)
        const inner = point(i * 30, i % 3 === 0 ? 32 : 36)
        return (
          <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" strokeWidth={i % 3 === 0 ? 3.5 : 2} />
        )
      })}
      <line x1={50} y1={50} x2={hour.x} y2={hour.y} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
      <line x1={50} y1={50} x2={minute.x} y2={minute.y} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={50} cy={50} r={3.5} fill="currentColor" />
    </svg>
  )
}
