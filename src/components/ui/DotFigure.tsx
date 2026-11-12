import { dotLayout, type DotsFigure } from '../../ai/patternDisplay'

/**
 * Figurtall som prikker, side om side, med «Figur 1» over og «5 prikker» under hver figur. Prikkene som er nye
 * siden forrige figur har en lysere farge, så veksten er lett å se. Figuren det spørres etter tegnes ikke
 * (den er ikke med i antallene). Rekka brytes over flere linjer på smal skjerm.
 */
export function DotFigure({ figure, size = 'md' }: { figure: DotsFigure; size?: 'sm' | 'md' }) {
  const layout = dotLayout(figure.counts)
  if (!layout) return null
  const gap = size === 'sm' ? 12 : 18
  const r = size === 'sm' ? 4 : 6
  return (
    <div className="flex w-full flex-wrap items-end justify-center gap-x-8 gap-y-4" role="img" aria-label={figure.counts.map((c, i) => `Figur ${i + 1}: ${c} ${c === 1 ? 'prikk' : 'prikker'}`).join('. ')}>
      {layout.map((dots, i) => {
        const cols = Math.max(...dots.map((d) => d.col)) + 1
        const rows = Math.max(...dots.map((d) => d.row)) + 1
        const count = figure.counts[i]
        return (
          <figure key={i} className="flex flex-col items-center gap-2">
            <figcaption className="text-small text-muted">Figur {i + 1}</figcaption>
            <svg width={cols * gap} height={rows * gap} viewBox={`0 0 ${cols * gap} ${rows * gap}`} aria-hidden className="max-w-full">
              {dots.map((d, j) => (
                <circle key={j} cx={d.col * gap + gap / 2} cy={d.row * gap + gap / 2} r={r} className={d.isNew ? 'fill-secondary' : 'fill-primary'} />
              ))}
            </svg>
            <span className="text-small text-primary">
              {count} {count === 1 ? 'prikk' : 'prikker'}
            </span>
          </figure>
        )
      })}
    </div>
  )
}
