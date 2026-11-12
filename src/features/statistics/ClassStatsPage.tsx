import { ChevronDown, ChevronUp, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LevelBadge } from '../../components/ui/LevelBadge'
import type { Level } from '../../types'
import { students } from '../class/students'
import { StudentCarousel } from './StudentCarousel'
import { TopicTasksDialog } from './TopicTasksDialog'
import { classMastery, classPatterns, readyForChallenge, topicInsights, weekTopic } from './mockData'
import { MasteryTable, PatternContent, StatPanel } from './parts'

const levels: Level[] = [1, 2, 3]
const levelNumber = { 1: 'text-level1', 2: 'text-level2', 3: 'text-level3' } as const

export function ClassStatsPage() {
  const [showAllPatterns, setShowAllPatterns] = useState(false)
  const [topic, setTopic] = useState<string | null>(null)

  const patterns = showAllPatterns ? classPatterns : classPatterns.slice(0, 1)

  return (
    <div className="flex max-w-[1133px] flex-col gap-8">
      {/* Statistikk er et toppnivå i sidemenyen: tittelen holder, uten brødsmuler. */}
      <div className="flex flex-col gap-8">
        <h1 className="text-h1 text-black">Statistikk</h1>
        <p className="text-h3 text-black">Matematikk - klasse 4A</p>
      </div>

      <StudentCarousel students={students} />

      <h2 className="text-h3 text-black">Generell statistikk for klasse 4A</h2>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-1.5 rounded-lg bg-surface-light px-5 py-[19px] text-on-background shadow-[2px_4px_4px_rgba(0,0,0,0.25)]">
            <p className="text-small">Ukens tema</p>
            <h3 className="text-h2">{weekTopic.name}</h3>
            <p className="pb-5 text-small">{weekTopic.period}</p>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="pb-2.5 text-small font-normal text-secondary">Undertema</th>
                  {levels.map((level) => (
                    <th key={level} className="w-24 pb-2.5 text-center font-normal">
                      <LevelBadge level={level} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekTopic.subtopics.map((row) => (
                  <tr key={row.name} className="border-t border-surface">
                    <td className="py-3 text-small text-on-surface">{row.name}</td>
                    {row.perLevel.map((count, i) => (
                      <td key={i} className={`py-3 text-center text-base font-semibold ${levelNumber[levels[i]]}`}>
                        {count}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-secondary">Antall elever per nivå · {students.length} elever totalt</p>
          </section>

          <StatPanel title={showAllPatterns ? 'Oppdagede mønstre' : 'Oppdaget mønster'}>
            {patterns.map((pattern) => (
              <div key={pattern.text} className="flex flex-col gap-4">
                <PatternContent pattern={pattern} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowAllPatterns((s) => !s)}
              className="flex w-full cursor-pointer items-center justify-between rounded bg-secondary px-4 py-2 text-[15px] tracking-[0.3px] text-on-secondary hover:bg-secondary/90"
            >
              {showAllPatterns ? 'Vis færre mønstre' : 'Se flere mønstre'}
              {showAllPatterns ? <ChevronUp className="size-6" /> : <ChevronDown className="size-6" />}
            </button>
          </StatPanel>
        </div>

        <div className="flex flex-col gap-8">
          <StatPanel title="Temaoversikt">
            <p className="-mt-1 text-small text-secondary">Fylte felt viser andelen riktige svar i temaet. Velg et tema for å se grunnlaget.</p>
            <MasteryTable
              rows={classMastery}
              columns={['Tema', 'Status', 'Trenger mer øving på']}
              onSelect={(row) => setTopic(row.topic)}
            />
          </StatPanel>

          <StatPanel title="Klar for mer utfordring" className="gap-3">
            <ul className="flex flex-col gap-1.5">
              {readyForChallenge.map(({ studentId, topic: challengeTopic }) => {
                const student = students.find((s) => s.id === studentId)
                if (!student) return null
                const [first, last] = student.name.split(' ')
                return (
                  <li key={studentId}>
                    <Link
                      to={`/statistikk/elev/${studentId}`}
                      className="flex items-center gap-3 rounded-lg bg-background px-2.5 py-1.5 hover:bg-tertiary"
                    >
                      {student.photo ? (
                        <img src={student.photo} alt="" className="size-7 rounded-full object-cover object-top" />
                      ) : (
                        <span className="flex rounded-full bg-surface p-1 text-primary">
                          <UserRound className="size-5" />
                        </span>
                      )}
                      <span className="flex-1 text-small text-on-background">
                        {first} {last?.[0]}.
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full bg-level2-surface py-0.5 pr-2.5 pl-2 text-small text-on-background">
                        <span className="size-2 rounded-full bg-understanding" aria-hidden />
                        {challengeTopic}
                      </span>
                      <span className="text-h3 text-secondary" aria-hidden>
                        ›
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </StatPanel>
        </div>
      </div>

      <TopicTasksDialog
        topic={topic}
        insight={topicInsights.find((t) => t.topic === topic) ?? null}
        classSize={students.length}
        onClose={() => setTopic(null)}
      />
    </div>
  )
}
