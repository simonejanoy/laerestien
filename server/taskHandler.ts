import { randomUUID } from 'node:crypto'
import type { Content } from '@google/genai'
import {
  asTextDraft,
  isMathDraft,
  parseTaskResult,
  readStoredVisual,
  readLevelContexts,
  readSessionProfile,
  readRepetition,
  MAX_PER_LEVEL,
  targetLevelsOf,
  type AiLevel,
  type AiLevelContext,
  type AiResponseMeta,
  type AiTaskDraft,
  type AiTextDraft,
  topicOfArea,
  type TaskRequest,
  type TaskResult,
} from '../src/ai/contract.ts'
import { aiConfig } from '../src/ai/config.ts'
import { requireOwnClass, type Teacher } from './auth.ts'
import { HttpError } from './errors.ts'
import type { AiLog, AiLogEntry, CallOptions, GenerateResult, createGenerate } from './gemini.ts'
import { taskPrompt, type GenerationPlan } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { newReferenceSeed, selectReferences, toAiReference } from './references/selectReferences.ts'
import type { ReferenceTask } from './references/types.ts'
import { checkCandidates, signatureOf, stripInternalText, type RemovalReason } from './taskChecks.ts'
import { taskSchema } from './taskSchema.ts'
import { checkRevision } from './visualChecks.ts'

// Oppgavebestillinger fra appen: generelle oppgaver, elevforslag og justering.
// Sluttoppgavene kommer alltid fra et nytt Gemini-kall. Referansene fra referansebanken sendes
// bare som kontekst og returneres aldri selv.
//
// Loggen får bare tekniske data: requestId, regelversjon, modell, fagområde, frø, referanse-ID-er
// og antall. Aldri lærerens fritekst, systemprompten, oppgavetekster eller elevdata.

type Generate = ReturnType<typeof createGenerate>

/** Modellvalg for ett kall (se gemini.ts). Eksportert for testene. */
export type GenerateCallOptions = CallOptions

type GeneralRequest = Extract<TaskRequest, { kind: 'general' }>

const LEVELS: AiLevel[] = [1, 2, 3]

/** «1:3,2:3,3:3» – antall per nivå i loggen. */
const perLevelText = (counts: Partial<Record<AiLevel, number>>) =>
  LEVELS.filter((l) => counts[l] !== undefined).map((l) => `${l}:${counts[l]}`).join(',')

const countByLevel = (tasks: AiTaskDraft[]) =>
  Object.fromEntries(LEVELS.map((l) => [l, tasks.filter((t) => t.level === l).length])) as Record<AiLevel, number>

/** Beskjed til læreren når hele det bestilte antallet ikke kunne lages. */
export const incompleteMessage = (total: number) =>
  `Systemet klarte ikke å lage alle de ${total} oppgavene du bestilte, fordi for mange av AI-forslagene ikke besto kvalitetskontrollen. Ingen oppgaver ble lagt til. Prøv igjen.`

export interface TaskHandlerDeps {
  generate: Generate
  log: AiLog
  /** Referansebanken. Testene kan sende inn sin egen. */
  references?: readonly ReferenceTask[]
  newRequestId?: () => string
  newSeed?: () => number
  now?: () => Date
}

/** Tekstoppgaven uten figurfeltene (for flyter som ikke viser figurer). */
const stripFigure = ({ figure: _figure, invalidFigure: _invalid, noFigure: _none, ...rest }: AiTextDraft): AiTextDraft => rest

const userTurn = (text: string): Content => ({ role: 'user', parts: [{ text }] })
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const readSeed = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined)

export function createTaskHandler({
  generate,
  log,
  references = referenceBanks,
  newRequestId = randomUUID,
  newSeed = newReferenceSeed,
  now = () => new Date(),
}: TaskHandlerDeps) {
  async function tasks(body: unknown, teacher: Teacher): Promise<TaskResult> {
    if (!isObject(body) || !['general', 'individual', 'revise'].includes(body.kind as string)) {
      throw new HttpError(400, 'Ukjent type oppgavebestilling.')
    }
    const request = body as unknown as TaskRequest
    const requestId = newRequestId()
    const createdAt = now().toISOString()
    const trace: AiResponseMeta = { model: '', fallbackUsed: false, requestId, rulesVersion: aiConfig.rulesVersion, createdAt }

    // Bare kjente felter og høyst tre referanseoppgaver per nivå går videre til AI-en.
    if (request.kind === 'general') {
      // Antall per nivå: et positivt heltall (høyst MAX_PER_LEVEL). Nivåene: de læreren valgte, ellers alle tre.
      if (!Number.isInteger(request.perLevel) || request.perLevel < 1 || request.perLevel > MAX_PER_LEVEL) {
        throw new HttpError(400, `Antall oppgaver per nivå må være et helt tall fra 1 til ${MAX_PER_LEVEL}.`)
      }
      if (request.targetLevels !== undefined && (!Array.isArray(request.targetLevels) || targetLevelsOf(request.targetLevels).length !== new Set(request.targetLevels).size)) {
        throw new HttpError(400, 'Velg minst ett nivå (1, 2 eller 3).')
      }
      request.targetLevels = targetLevelsOf(request.targetLevels)
      const targets = request.targetLevels
      request.levels = readLevelContexts(request.levels).filter((l) => targets.includes(l.level))
      // Repetisjon: bare den anonyme, samlede oppsummeringen går videre (se readRepetition).
      request.repetition = readRepetition(request.repetition)
      request.profile = readSessionProfile(request.profile)
      const area = request.profile?.area
      if (area) {
        // Tema med referansebank: referansene velges fra banken for øktas område(r), aldri fra elevoppgavene i økta.
        const seed = readSeed(request.referenceSeed) ?? newSeed()
        const secondaryAreas = request.profile?.secondaryAreas ?? []
        const referenceIds: NonNullable<AiResponseMeta['referenceIds']> = {}
        request.levels = request.levels.map((level): AiLevelContext => {
          const chosen = selectReferences(references, { area, secondaryAreas, level: level.level, seed, divisionType: request.profile?.divisionType })
          referenceIds[String(level.level) as '1' | '2' | '3'] = chosen.map((r) => r.id)
          return { ...level, referenceTasks: chosen.map(toAiReference) }
        })
        Object.assign(trace, { area, topic: topicOfArea(area), referenceSeed: seed, referenceIds })
      }
    }
    if (request.kind === 'individual' || (request.kind === 'revise' && request.student)) {
      requireOwnClass(teacher, request.classId)
    }

    if (request.kind === 'general') return generalTasks(request, trace)

    const answer: GenerateResult = await generate('tasks', [userTurn(taskPrompt(request))], taskSchema, { requestId })
    const meta: AiResponseMeta = { ...trace, model: answer.model, fallbackUsed: answer.fallbackUsed }
    let result = parseAnswer(answer, requestId)
    if (result.tasks.length === 0 && !result.message) {
      throw new HttpError(502, 'AI-en laget ingen brukbare oppgaver. Prøv igjen.')
    }
    if (request.kind === 'revise' && result.tasks[0]) {
      // «Juster med AI»: figuren beholdes som standard, og den justerte oppgaven kontrolleres som ved generering.
      // Avvises den, får læreren en melding, og den opprinnelige oppgaven beholdes (ingen ny versjon i svaret).
      const original = readStoredVisual((request.task as { figure?: unknown })?.figure) ?? undefined
      const checked = checkRevision(result.tasks[0], { original, instruction: String(request.instruction ?? ''), topic: String(request.context?.topic ?? '') })
      if ('problem' in checked) {
        log({ requestId, event: 'revise_rejected', rulesVersion: aiConfig.rulesVersion, model: answer.model, fallbackUsed: answer.fallbackUsed, reason: checked.problem })
        return { tasks: [], message: '', warning: checked.warning, meta }
      }
      result = { ...result, tasks: [checked.draft] }
    } else if (request.kind === 'individual') {
      // Elevforslag har ikke figurer (som før).
      result = { ...result, tasks: result.tasks.map((t) => (isMathDraft(t) ? t : stripFigure(t))) }
    }
    // Elevforslag og justering viser bare tekstoppgaver. Interne ord fjernes fra alle synlige felt.
    const visible = result.tasks.map(asTextDraft).flatMap((t) => {
      const studentText = stripInternalText(t.studentText)
      const solution = stripInternalText(t.solution)
      if (!studentText || !solution) return []
      return [{ ...t, studentText, solution, adaptation: stripInternalText(t.adaptation), competenceGoal: stripInternalText(t.competenceGoal) }]
    })
    log({ requestId, event: `${request.kind}_tasks`, rulesVersion: aiConfig.rulesVersion, model: answer.model, fallbackUsed: answer.fallbackUsed, returned: result.tasks.length })
    return { ...result, message: stripInternalText(result.message), tasks: visible, meta }
  }

  /** Gemini-svaret som oppgaver. Ugyldig JSON eller feil form gir 502 (logget uten oppgavetekst). */
  function parseAnswer(answer: GenerateResult, requestId: string): TaskResult {
    let raw: unknown
    try {
      raw = JSON.parse(answer.text)
    } catch {
      log({ requestId, event: 'invalid_json', textLength: answer.text.length })
      throw new HttpError(502, 'AI-svaret hadde feil format og kan ikke vises. Prøv igjen.')
    }
    const result = parseTaskResult(raw)
    if (!result) {
      log({ requestId, event: 'invalid_schema', textLength: answer.text.length })
      throw new HttpError(502, 'AI-svaret hadde feil format og kan ikke vises. Prøv igjen.')
    }
    return result
  }

  /**
   * Generelle oppgaver: læreren får nøyaktig `perLevel` godkjente oppgaver per nivå, eller ingen.
   * 1. Første generering ber om en reservekandidat per nivå i tillegg.
   * 2. Alle kandidatene går gjennom kvalitetskontrollene.
   * 3. Mangler et nivå fortsatt oppgaver, bes det bare om erstatninger for de nivåene – med en
   *    reserve til, og en liste over det som ikke kan brukes. Høyst `maxRefillAttempts` ganger,
   *    med samme modell som svarte første gang (rett til reservemodellen hvis den svarte).
   * 4. Bare det bestilte antallet returneres. Ubrukte reserver kastes. Mangler det fortsatt noe,
   *    returneres ingen oppgaver.
   */
  async function generalTasks(request: GeneralRequest, trace: AiResponseMeta): Promise<TaskResult> {
    const requestId = trace.requestId!
    const { perLevel } = request
    // Bare nivåene læreren valgte (alle tre når feltet mangler).
    const LEVELS = targetLevelsOf(request.targetLevels)
    const { reservePerLevel, maxRefillAttempts } = aiConfig.taskGeneration
    const accepted: AiTaskDraft[] = []
    const rejected: { task: AiTaskDraft; reason: RemovalReason }[] = []
    const removedTotal: Partial<Record<RemovalReason, number>> = {}
    let message = ''
    let firstAnswer: GenerateResult | undefined
    let candidatesTotal = 0
    let refillAttempts = 0

    const missingOf = () => {
      const counts = countByLevel(accepted)
      return Object.fromEntries(LEVELS.filter((l) => counts[l] < perLevel).map((l) => [l, perLevel - counts[l]])) as Partial<Record<AiLevel, number>>
    }

    /** Det som ikke kan brukes på nivået: oppgavesettet, godkjente kandidater og avviste duplikater. */
    const blockedOn = (level: AiLevel) => {
      const existing = (request.levels ?? []).find((l) => l.level === level)?.existing ?? []
      const duplicates = rejected.filter((r) => ['duplicateInResponse', 'duplicateInSet', 'swappedFactors'].includes(r.reason)).map((r) => r.task)
      const signatures = [...existing, ...accepted.filter((t) => t.level === level), ...duplicates.filter((t) => t.level === level)].map(signatureOf)
      return [...new Set(signatures)].slice(0, 120)
    }

    for (let attempt = 0; attempt <= maxRefillAttempts; attempt++) {
      const missing = missingOf()
      if (attempt > 0 && Object.keys(missing).length === 0) break
      const counts: Partial<Record<AiLevel, number>> =
        attempt === 0
          ? Object.fromEntries(LEVELS.map((l) => [l, perLevel + reservePerLevel]))
          : Object.fromEntries(Object.entries(missing).map(([l, n]) => [l, n + reservePerLevel]))
      const plan: GenerationPlan =
        attempt === 0
          ? { counts }
          : {
              counts,
              refill: {
                missing,
                blocked: Object.fromEntries(Object.keys(missing).map((l) => [l, blockedOn(Number(l) as AiLevel)])),
                allowSwappedFactors: request.profile?.allowSwappedFactors,
              },
            }
      // Utfylling gjenbruker modellen som svarte første gang: rett til reservemodellen hvis den svarte.
      const options: CallOptions | undefined = attempt === 0 ? undefined : { startWith: firstAnswer?.fallbackUsed ? 'fallback' : 'primary' }
      if (attempt > 0) refillAttempts = attempt
      const answer = await generate('tasks', [userTurn(taskPrompt(request, plan))], taskSchema, { requestId, attempt }, options)
      firstAnswer ??= answer

      let candidates: AiTaskDraft[]
      try {
        const result = parseAnswer(answer, requestId)
        if (attempt === 0) {
          message = stripInternalText(result.message)
          // Bare et oppfølgingsspørsmål (ingen oppgaver): ingen utfylling.
          if (result.tasks.length === 0) {
            if (message) return { tasks: [], message, meta: { ...trace, model: answer.model, fallbackUsed: answer.fallbackUsed } }
            throw new HttpError(502, 'AI-en laget ingen brukbare oppgaver. Prøv igjen.')
          }
        }
        // Ved utfylling: bare nivåene det ble bedt om.
        candidates = result.tasks.filter((t) => (counts[t.level] ?? 0) > 0).map((t) => ({ ...t, servedBy: { model: answer.model, fallbackUsed: answer.fallbackUsed } }))
      } catch (error) {
        // Et ugyldig svar i en utfylling teller som et brukt forsøk.
        if (attempt === 0) throw error
        candidates = []
      }
      candidatesTotal += candidates.length

      const checked = checkCandidates(candidates, request, accepted)
      accepted.push(...checked.accepted)
      rejected.push(...checked.rejected)
      for (const [reason, n] of Object.entries(checked.removed) as [RemovalReason, number][]) removedTotal[reason] = (removedTotal[reason] ?? 0) + n
      log({
        requestId,
        event: 'general_tasks_attempt',
        attempt,
        topic: trace.topic ?? 'ingen',
        area: trace.area ?? 'ingen',
        model: answer.model,
        fallbackUsed: answer.fallbackUsed,
        requested: perLevelText(counts),
        received: candidates.length,
        ...Object.fromEntries(Object.entries(checked.removed).map(([reason, n]) => [`removed_${reason}`, n])),
        approved: perLevelText(countByLevel(accepted)),
        missingLevels: perLevelText(missingOf()),
        ...(checked.issues.length > 0 && { issues: checked.issues.join('; ') }),
      })
    }

    const missing = missingOf()
    const delivered = Object.keys(missing).length === 0
    const tasks = delivered ? LEVELS.flatMap((l) => accepted.filter((t) => t.level === l).slice(0, perLevel)) : []
    const answer = firstAnswer!
    const meta: AiResponseMeta = { ...trace, model: answer.model, fallbackUsed: answer.fallbackUsed }
    const finalLog: AiLogEntry = {
      requestId,
      event: 'general_tasks',
      rulesVersion: aiConfig.rulesVersion,
      model: answer.model,
      fallbackUsed: answer.fallbackUsed,
      topic: meta.topic ?? 'ingen',
      area: meta.area ?? 'ingen',
      ...(request.profile?.secondaryAreas?.length && { secondaryAreas: request.profile.secondaryAreas.join(',') }),
      ...(meta.referenceSeed !== undefined && { referenceSeed: meta.referenceSeed }),
      referenceIds: Object.values(meta.referenceIds ?? {}).flat().join(','),
      orderedPerLevel: perLevel,
      candidates: candidatesTotal,
      refillAttempts,
      returned: tasks.length,
      delivered,
      missingLevels: perLevelText(missing),
      ...Object.fromEntries(Object.entries(removedTotal).map(([reason, n]) => [`removed_${reason}`, n])),
    }
    log(finalLog)
    if (!delivered) return { tasks: [], message, warning: incompleteMessage(perLevel * LEVELS.length), incomplete: true, meta }
    return { tasks, message, meta }
  }

  return tasks
}
