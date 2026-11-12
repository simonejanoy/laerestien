import { PATTERN_COLORS, type ColorsFigure } from '../../ai/patternDisplay'

/**
 * Fargemønster: én fylt sirkel per ledd, i rekke, med fargenavnet under – så fargene kan skilles også av elever som
 * er fargeblinde. Plassen det spørres etter er ikke med. Rekka brytes over flere linjer på smal skjerm.
 */
export function ColorFigure({ figure, size = 'md' }: { figure: ColorsFigure; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 22 : 36
  return (
    <ol className="flex w-full flex-wrap items-start justify-center gap-x-3 gap-y-3" aria-label={`Fargemønster: ${figure.items.join(', ')}`}>
      {figure.items.map((color, i) => (
        <li key={i} className="flex min-w-12 flex-col items-center gap-1">
          <span
            aria-hidden
            className="block rounded-full border-2 border-primary"
            style={{ width: px, height: px, backgroundColor: PATTERN_COLORS[color] ?? 'transparent' }}
          />
          <span className="text-small text-primary">{color}</span>
        </li>
      ))}
    </ol>
  )
}
