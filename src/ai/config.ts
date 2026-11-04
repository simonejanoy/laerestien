// Innstillinger for AI-assistenten. Brukes av API-serveren (server/), ikke i nettleseren.
// Modellen (gemini-3.5-flash-lite) tenker ikke som standard («minimal»). Oppgaver og
// elevvurderinger får «high», siden reglene krever at alle utregninger kontrolleres.
// Ikke legg til temperature, top_p, top_k eller candidate_count – de er utfaset for modellen.

export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high'

/** Hva AI-en brukes til: oppgavegenerering, profilforslag eller fri chat. */
export type AiUse = 'tasks' | 'profile' | 'chat'

export const aiConfig = {
  model: 'gemini-3.5-flash-lite',
  thinkingLevel: {
    tasks: 'high',
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
