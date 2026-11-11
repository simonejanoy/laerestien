import type { SessionTask } from '../../types'
import { MessageCard } from './StatusScreens'
import { initialMathState, initialTextState, isMathState, type TaskAnswerState } from './studentTasks'
import { TaskScreen } from './TaskScreen'
import { TextTaskScreen } from './TextTaskScreen'

/** Bare i lærerens forhåndsvisning: svarene holdes utenfor skjermene, per oppgave-ID. */
export interface PreviewAnswers {
  answers: Record<string, TaskAnswerState>
  onAnswer: (taskId: string, state: TaskAnswerState) => void
}

interface StudentTaskFlowProps {
  /** Oppgavene på elevens nivå, i rekkefølgen eleven får dem. */
  tasks: SessionTask[]
  /** Oppgaven eleven er på (0-basert). Etter siste oppgave vises avslutningen. */
  index: number
  onNext: () => void
  /** Uten denne (som for eleven) holder hver oppgaveskjerm sin egen tilstand. */
  preview?: PreviewAnswers
  /** Perioden i årsplanen økta hører til (Session.topicId). Mønster og algoritmer og Regning har egen melding for tekstsvar. */
  topicId?: string
}

/**
 * Oppgaveflyten eleven ser: én oppgave om gangen, og «Bra jobba!» etter siste. Brukes både i
 * elevvisningen og i lærerens forhåndsvisning. Hvor framdriften og svarene lagres (eller ikke),
 * bestemmer den som bruker flyten.
 */
export function StudentTaskFlow({ tasks, index, onNext, preview, topicId }: StudentTaskFlowProps) {
  const task = tasks[index]
  if (!task) return <MessageCard title="Bra jobba!" text="Du har gjort alle oppgavene i denne økta." />

  const saved = preview?.answers[task.id]
  const onChange = (state: TaskAnswerState) => preview?.onAnswer(task.id, state)

  return (
    <div className="px-20 pb-12">
      {task.kind === 'text' ? (
        <TextTaskScreen
          key={task.id}
          task={task}
          index={index}
          total={tasks.length}
          onNext={onNext}
          honestDone={topicId === 'monster-og-algoritmer' || topicId === 'regning'}
          splitParts={topicId === 'regning'}
          textBoxes={topicId === 'regning'}
          controlled={preview && { state: saved && !isMathState(saved) ? saved : initialTextState(), onChange }}
        />
      ) : (
        <TaskScreen
          key={task.id}
          task={task}
          index={index}
          total={tasks.length}
          onNext={onNext}
          controlled={preview && { state: saved && isMathState(saved) ? saved : initialMathState(), onChange }}
        />
      )}
    </div>
  )
}
