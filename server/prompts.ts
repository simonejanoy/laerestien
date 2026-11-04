import type { AiTaskDraft, AnonStudentProfile, ProfileRequest, SubjectContext, TaskRequest } from '../src/ai/contract.ts'

// Lager lærerens bestilling (brukermeldingen) ut fra det appen sender.
// Elevdata er anonymisert i appen før de kommer hit.

/** Slår sammen linjer. `false`/`undefined` hoppes over, mens '' gir en tom linje. */
const lines = (...parts: (string | false | undefined)[]) =>
  parts.filter((p): p is string => typeof p === 'string').join('\n')
const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- Ikke oppgitt.')

const subject = (c: SubjectContext) => `Fag: ${c.subject}\nTrinn: ${c.grade}`

function studentData(s: AnonStudentProfile) {
  return lines(
    `Elev: anonym ID ${s.anonId}. Navn og andre personopplysninger er ikke nødvendige og er ikke oppgitt.`,
    `Nivå i appen nå (satt av læreren): ${s.level}`,
    '',
    'Resultater fra appen dette skoleåret (observasjoner, ikke vurderinger):',
    `- Riktig på første forsøk: ${s.firstTryPercent} %`,
    `- Temaer med god mestring: ${s.strong.join(', ') || 'ingen registrert'}`,
    `- Temaer der eleven trenger støtte: ${s.support.join(', ') || 'ingen registrert'}`,
    '',
    'Mestring per tema (fra appen):',
    list(s.mastery.map((m) => `${m.topic}: ${m.status}${m.note ? ` (${m.note})` : ''}`)),
    '',
    'Mønster appen har registrert:',
    list(s.observations),
  )
}

function taskData(task: AiTaskDraft) {
  return lines(
    `Nivå: ${task.level}`,
    `Oppgavetekst til eleven: ${task.studentText}`,
    `Fasit/løsningsforslag: ${task.solution}`,
    `Kompetansemål: ${task.competenceGoal || 'Ikke oppgitt.'}`,
    `Tilpasning: ${task.adaptation || 'Ikke oppgitt.'}`,
  )
}

const jsonNote =
  'Feltet kompetansemaal skal være tomt når læreren ikke har oppgitt offisiell måltekst. Bruk feltet melding til korte beskjeder til læreren, ellers en tom streng.'

export function taskPrompt(request: TaskRequest) {
  switch (request.kind) {
    case 'general': {
      const { lesson } = request
      return lines(
        'Bestilling: Lag generelle undervisningsoppgaver til timen.',
        subject(lesson),
        `Tema for timen: ${lesson.topic} – ${lesson.sessionHeading}`,
        lesson.sessionDescription && `Lærerens beskrivelse av timen: ${lesson.sessionDescription}`,
        '',
        'Lærerens egne mål for timen (lærerens opplysninger, ikke offisiell måltekst):',
        list(lesson.sessionGoals),
        '',
        `Offisiell måltekst fra læreplanen, oppgitt ordrett av læreren: ${request.officialGoals || 'Ikke oppgitt.'}`,
        `Antall: ${request.perLevel} oppgaver på hvert av nivå 1, 2 og 3 (nivå 1 er minst utfordrende).`,
        `Ekstra ønsker fra læreren: ${request.wishes || 'Ingen.'}`,
        '',
        jsonNote,
      )
    }
    case 'individual':
      return lines(
        `Bestilling: Lag ${request.count} individuelt tilpassede oppgaver til én elev. Oppgavene er forslag som læreren åpner og vurderer, og de legges bare til elevens oppgaver hvis læreren velger «Legg til oppgaver».`,
        subject(request.context),
        '',
        studentData(request.student),
        '',
        `Lærerens ønsker: ${request.wishes || 'Øv på det eleven trenger støtte i, og gi litt utfordring i det eleven mestrer.'}`,
        '',
        jsonNote,
      )
    case 'revise':
      return lines(
        'Bestilling: Endre oppgaven under slik læreren ber om. Behold resten av oppgaven med mindre endringen krever noe annet, og forklar kort i melding hva du har endret.',
        'Svar med nøyaktig én oppgave. Hvis du må stille et oppfølgingsspørsmål først, svar uten oppgaver og skriv spørsmålet i melding.',
        subject(request.context),
        `Tema: ${request.context.topic}`,
        request.student && '',
        request.student && 'Oppgaven er et forslag tilpasset denne eleven:',
        request.student && studentData(request.student),
        '',
        'Oppgaven nå:',
        taskData(request.task),
        '',
        `Lærerens ønske: ${request.instruction}`,
        '',
        jsonNote,
      )
  }
}

export function profilePrompt(request: ProfileRequest) {
  return lines(
    'Bestilling: Skriv et kort, foreløpig forslag til profiltekst for eleven, og eventuelt et foreløpig forslag til nivå. Teksten vises for læreren som et AI-generert forslag som læreren kan redigere. Den lagres ikke, og nivået endres bare hvis læreren selv gjør det i appen.',
    'Skill tydelig mellom observasjoner og resultater, lærerens vurderinger og dine egne foreløpige tolkninger. Svar som vanlig tekst, ikke JSON.',
    subject(request.context),
    '',
    studentData(request.student),
    '',
    `Lærerens egne observasjoner og vurderinger: ${request.teacherNotes || 'Ikke oppgitt.'}`,
  )
}
