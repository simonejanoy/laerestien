import { BookOpen, Calendar, Clock } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { useSessions } from '../sessions/sessionsContext'
import { SessionBrowser } from './SessionBrowser'
import { TopicGoals } from './TopicGoals'
import { TopicPlan } from './TopicPlan'
import { topicDetails, unitById } from './mockData'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

export function TopicPage() {
  const { topicId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sessions, getStatus, getTasks } = useSessions()

  // «Tema» her er en periode i årsplanen (også repetisjon).
  const topic = unitById(topicId ?? '')
  if (!topic) return <FullPageMessage text="Fant ikke temaet." />

  const details = topicDetails.find((d) => d.topicId === topic.id)
  const topicSessions = sessions.filter((s) => s.topicId === topic.id)
  const sessionCount = details?.weeks.reduce((sum, w) => sum + w.sessions.length, 0) ?? 0

  // Valgt økt fra ?okt=, ellers neste økt som ikke er gjennomført.
  const selectedIndex = Math.max(
    0,
    topicSessions.findIndex((s) =>
      searchParams.has('okt') ? s.id === searchParams.get('okt') : getStatus(s.id) !== 'completed',
    ),
  )
  const selected = topicSessions[selectedIndex]

  return (
    <div className="flex max-w-[1128px] flex-col gap-[25px]">
      <header className="flex flex-col gap-2.5">
        <PageBreadcrumbs items={[{ label: 'Alle tema', to: '/tema' }, { label: topic.name }]} />
        <h1 className="text-h1 text-on-background">{topic.name}</h1>
        <div className="flex items-center gap-[15px] text-small text-secondary">
          {sessionCount > 0 && (
            <span className="flex items-center gap-[5px]">
              <BookOpen className="size-6" />
              {sessionCount} økter
            </span>
          )}
          <span className="flex items-center gap-[5px]">
            <Calendar className="size-6" />
            {topic.weeks} uker
          </span>
          {sessionCount > 0 && (
            <span className="flex items-center gap-[5px]">
              <Clock className="size-6" />
              {Math.round(sessionCount / topic.weeks)} per uke
            </span>
          )}
        </div>
      </header>

      {details ? (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[644fr_460fr]">
          {selected ? (
            <SessionBrowser
              session={selected}
              tasks={getTasks(selected.id)}
              previous={topicSessions[selectedIndex - 1]}
              next={topicSessions[selectedIndex + 1]}
              onSelect={(s) => setSearchParams({ okt: s.id }, { replace: true })}
            />
          ) : (
            <p className="rounded-lg bg-surface-light p-8 text-small text-secondary">
              Ingen økter er satt opp for dette temaet ennå.
            </p>
          )}
          <div className="flex flex-col gap-6">
            <TopicPlan
              weeks={details.weeks}
              linkFor={(n) => {
                const session = topicSessions.find((s) => s.numbers.includes(n))
                return session && `/okt/${session.id}`
              }}
            />
            <TopicGoals goals={details.goals} />
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-light p-8 text-small text-secondary">
          Planen for dette temaet er ikke laget ennå.
        </p>
      )}
    </div>
  )
}
