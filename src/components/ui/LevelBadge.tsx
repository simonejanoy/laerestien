import type { Level } from '../../types'
import { levelStyles } from './levelStyles'

const stepHeights = ['h-[6px]', 'h-[10px]', 'h-[14px]']

/** «Nivåmerke»: trappeikon + «Nivå n» i nivåets farge. */
export function LevelBadge({ level }: { level: Level }) {
  const style = levelStyles[level]
  return (
    <span className={`inline-flex items-center gap-2 rounded-[5px] px-2.5 py-[5px] text-small ${style.surface} ${style.text}`}>
      <span className="flex h-[14px] items-end gap-[3px]" aria-hidden>
        {stepHeights.map((height, i) => (
          <span
            key={height}
            className={`w-1 rounded-[1px] ${height} ${style.bar} ${i < level ? '' : 'opacity-20'}`}
          />
        ))}
      </span>
      Nivå {level}
    </span>
  )
}
