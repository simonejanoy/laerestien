// Innstillinger for AI-assistenten. Brukes av API-serveren (server/), ikke i nettleseren.
// Modellen (gemini-3.8-flash) bruker «low» for oppgavegenerering.
// Elevprofiler bruker «high», mens fri chat bruker «low».
// Ikke legg til temperature, top_p, top_k eller candidate_count – de er utfaset for modellen.

export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high'

/** Hva AI-en brukes til: oppgavegenerering, profilforslag eller fri chat. */
export type AiUse = 'tasks' | 'profile' | 'chat'

export const aiConfig = {
  model: 'gemini-3.8-flash',
  thinkingLevel: {
    tasks: 'low',
    profile: 'high',
    chat: 'low',
  } satisfies Record<AiUse, ThinkingLevelName>,
  /** Tenkingen teller med i output-tokens, så grensene er romslige ved «high». */
  maxOutputTokens: {
    tasks: 16_384,
    profile: 8_192,
    chat: 4_096,
  } satisfies Record<AiUse, number>,
}
