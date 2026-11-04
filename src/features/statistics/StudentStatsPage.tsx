import { ArrowLeft, ArrowRight, Sparkles, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Student, StudentStats } from '../../types'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { students } from '../class/students'
import { ProgressChart } from './ProgressChart'
import { StudentCarousel } from './StudentCarousel'
import { SuggestedTasksDialog } from './SuggestedTasksDialog'
import { months, statsFor, suggestedTasks } from './mockData'
import { DotTag, MasteryTable, PatternContent, StatPanel } from './parts'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}s`)

export function StudentStatsPage() {
  const { studentId } = useParams()
  const index = students.findIndex((s) => s.id === studentId)
  const student = students[index]
  const [dialogOpen, setDialogOpen] = useState(false)
  // Gjelder bare eleven oppgavene ble lagt til for – ellers ble meldingen stående (med feil navn) når man byttet elev.
  const [added, setAdded] = useState<{ studentId: string; count: number } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const shownId = useRef(student?.id)

  // Rolig inntoning når man bytter elev. Siden beholdes (ingen remount); bare innholdet tones inn.
  useEffect(() => {
    if (!student || shownId.current === student.id) return
    shownId.current = student.id
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    contentRef.current?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
  }, [student])

  if (!student) return <FullPageMessage text="Fant ikke eleven." />

  const stats = statsFor(student, index)
  const firstName = student.name.split(' ')[0]

  return (
    <div className="flex max-w-[1133px] flex-col gap-8">
      <Link
        to="/statistikk"
        className="flex items-center gap-2.5 self-start rounded-lg bg-secondary px-6 py-2 text-body text-on-secondary hover:bg-secondary/90"
      >
        <ArrowLeft className="size-[22px]" />
        Tilbake
      </Link>

      <PageBreadcrumbs
        inClass
        items={[{ label: 'Statistikk', to: '/statistikk' }, { label: `${firstName} ${student.name.split(' ')[1]?.[0] ?? ''}.` }]}
      />
      <h1 className="text-h1 text-black">Statistikk</h1>

      <div ref={contentRef} className="flex flex-col gap-8">
        <StudentSummary student={student} stats={stats} onShowSuggestions={() => setDialogOpen(true)} />

        {added?.studentId === student.id && (
          <p role="status" className="rounded-lg bg-level2-surface px-5 py-3 text-small text-on-surface">
            {added.count} oppgaver er lagt til for {firstName}.
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[615fr_486fr]">
          <div className="flex flex-col gap-8">
            <StatPanel title="Faglig progresjon" small className="px-5">
              <ProgressChart values={stats.progress} labels={months} />
              <p className="text-small text-secondary">Oppnådde læringsmål gjennom skoleåret</p>
            </StatPanel>
            <StatPanel title={`Dette har vi lagt merke til hos ${firstName}`} small className="gap-3">
              <PatternContent pattern={stats.pattern} reserveSpace />
            </StatPanel>
          </div>

          <StatPanel title={`Slik går det for ${firstName}`} small>
            <p className="-mt-1 text-small text-secondary">
              Mestring per tema, basert på {possessive(firstName)} oppgaver dette skoleåret
            </p>
            <MasteryTable rows={stats.mastery} columns={['Tema', 'Mestring', 'Neste steg']} />
          </StatPanel>
        </div>
      </div>

      <StudentCarousel students={students} activeId={student.id} />

      <SuggestedTasksDialog
        key={student.id}
        open={dialogOpen}
        studentName={firstName}
        initialTasks={suggestedTasks}
        onClose={() => setDialogOpen(false)}
        onConfirm={(tasks) => {
          setAdded({ studentId: student.id, count: tasks.length })
          setDialogOpen(false)
        }}
      />
    </div>
  )
}

function Trend({ value }: { value: number }) {
  if (value === 0) return <span className="text-small text-secondary">Som forrige uke</span>
  return (
    <span className={`text-small ${value > 0 ? 'text-understanding' : 'text-needs-support'}`}>
      {value > 0 ? '▲' : '▼'} {Math.abs(value)} % fra forrige uke
    </span>
  )
}

/** Elevboksen øverst: bilde, nøkkeltall, sterke/svake temaer og AI-forslag. */
function StudentSummary({
  student,
  stats,
  onShowSuggestions,
}: {
  student: Student
  stats: StudentStats
  onShowSuggestions: () => void
}) {
  const [first, last] = student.name.split(' ')
  const card = 'flex flex-1 flex-col rounded-lg bg-background px-3.5'

  return (
    <section className="flex flex-col drop-shadow-[2px_4px_2px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-stretch gap-6 rounded-t-lg bg-surface-light p-5">
        <div className="flex flex-col gap-3 p-2">
          <h2 className="text-h3 text-black">
            {first} {last?.[0]}.
          </h2>
          {student.photo ? (
            <img src={student.photo} alt="" className="size-[149px] rounded bg-surface-variant object-cover object-top" />
          ) : (
            <span className="flex size-[149px] items-center justify-center rounded bg-surface-variant text-primary">
              <User className="size-[110px]" strokeWidth={1} />
            </span>
          )}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:pt-9">
          <div className={`${card} justify-center gap-0.5 py-5`}>
            <span className="text-h2 text-on-background">{stats.firstTry} %</span>
            <span className="pb-5 text-small text-secondary">riktig på første forsøk</span>
            <Trend value={stats.firstTryTrend} />
          </div>
          <div className={`${card} gap-3 py-3`}>
            <span className="text-small text-secondary">Sterk i temaene:</span>
            {stats.strong.map((t) => (
              <DotTag key={t} tone="good">
                {t}
              </DotTag>
            ))}
          </div>
          <div className={`${card} gap-3 py-3`}>
            <span className="text-small text-secondary">Trenger støtte i:</span>
            {stats.support.map((t) => (
              <DotTag key={t} tone="support">
                {t}
              </DotTag>
            ))}
          </div>
          <div className={`${card} justify-center gap-0.5 py-5`}>
            <span className="text-h2 text-on-background">
              {stats.tasksDone} av {stats.tasksTotal}
            </span>
            <span className="pb-5 text-small text-secondary">oppgaver denne uka</span>
            <Trend value={stats.tasksTrend} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-b-lg bg-secondary py-3 pr-3 pl-5 text-[15px] font-medium text-on-secondary">
        <Sparkles className="size-[22px] shrink-0" />
        <p className="flex-1">
          AI har laget 5 oppgaver til {first} basert på hva {first} trenger støtte i
        </p>
        <button
          type="button"
          onClick={onShowSuggestions}
          className="flex w-full cursor-pointer items-center sm:w-auto sm:min-w-[19rem] justify-center gap-2 rounded-md border border-on-primary py-[9px] pr-3.5 pl-4 text-on-primary hover:bg-on-primary/10"
        >
          Se foreslåtte oppgaver
          <ArrowRight className="size-[18px]" />
        </button>
      </div>
    </section>
  )
}
