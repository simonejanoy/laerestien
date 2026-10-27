import { Check } from 'lucide-react'
import { levelStyles } from '../../components/ui/levelStyles'
import type { Level, LevelGroup } from '../../types'

interface LevelTabsProps {
  levels: LevelGroup[]
  selected: Level
  countFor: (level: Level) => number
  onSelect: (level: Level) => void
}

/** «Velg nivå»: én fane per nivå, valgt fane har farget ramme. */
export function LevelTabs({ levels, selected, countFor, onSelect }: LevelTabsProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-h3 text-primary">Velg nivå</h2>
      <div role="tablist" className="flex items-start gap-3">
        {levels.map((group) => {
          const style = levelStyles[group.level]
          const isSelected = group.level === selected
          return (
            <button
              key={group.level}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelect(group.level)}
              className={`flex flex-1 cursor-pointer flex-col items-start gap-2 rounded-lg p-3.5 text-left transition-opacity ${style.surface} ${
                isSelected ? `border-2 ${style.border}` : 'border border-transparent opacity-60 hover:opacity-90'
              }`}
            >
              <span className="flex w-full items-center justify-between">
                <span className={`rounded px-2 py-1 text-small ${style.text}`}>Nivå {group.level}</span>
                <span className="text-xs text-secondary">{countFor(group.level)} opp.</span>
              </span>
              <span className="text-small text-primary">{group.title}</span>
              {isSelected && (
                <span className={`flex items-center gap-[5px] text-xs ${style.text}`}>
                  <Check className="size-3" strokeWidth={2.8} />
                  Valgt nivå
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
