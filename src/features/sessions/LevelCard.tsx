import { Link } from 'react-router-dom'
import { LevelBadge } from '../../components/ui/LevelBadge'
import { levelStyles } from '../../components/ui/levelStyles'
import { UsersProfilesIcon } from '../../components/ui/icons'
import type { LevelGroup } from '../../types'

interface LevelCardProps {
  group: LevelGroup
  to: string
  /** Kompakt variant på temasiden: uten fast høyde og elevantall. */
  compact?: boolean
}

/** Kort for ett nivå i «Oppgaver» – åpner oppgavene for nivået. */
export function LevelCard({ group, to, compact = false }: LevelCardProps) {
  const style = levelStyles[group.level]

  return (
    <Link
      to={to}
      className={`flex flex-col justify-center gap-3 overflow-hidden rounded-lg px-[18px] py-[15px] transition-shadow hover:shadow-md ${
        compact ? '' : 'min-h-[200px]'
      } ${style.surface}`}
    >
      <div className="flex items-center justify-between">
        <LevelBadge level={group.level} />
        <span className="text-small text-primary/50">{group.taskCount} oppgaver</span>
      </div>

      <div className="flex flex-col gap-1.5 pb-2.5">
        <p className="text-h3 text-primary">{group.title}</p>
        <p className="text-body text-primary">{group.subtitle}</p>
        <p className="text-small leading-normal text-primary/50">{group.description}</p>
      </div>

      {!compact && (
        <div className="flex items-center gap-1 text-small text-primary/75">
          <UsersProfilesIcon className={style.text} />
          {group.studentCount} elever
        </div>
      )}
    </Link>
  )
}
