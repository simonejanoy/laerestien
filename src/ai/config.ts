// Innstillinger for AI-assistenten. Brukes av API-serveren (server/). Appen leser bare
// tidsgrensen, for å vise «Vi prøver en reservemodell» mens læreren venter.
// Primærmodellen (gemini-3.8-flash) bruker «low» for oppgavegenerering.
// Elevprofiler bruker «high», mens fri chat bruker «low».
// Ikke legg til temperature, top_p, top_k eller candidate_count – de er utfaset for modellen.

/** Gemini 3.8 støtter bare disse nivåene. */
export type ThinkingLevelName = 'low' | 'medium' | 'high'

/** Hva AI-en brukes til: oppgavegenerering, profilforslag eller fri chat. */
export type AiUse = 'tasks' | 'profile' | 'chat'

export const aiConfig = {
  /**
   * Versjonen av AI-reglene. Fra versjon 6 dekker den både systemprompten (systemPrompt.md) og
   * instruksjonene i brukermeldingen (server/prompts.ts). Oppdateres når en av dem endres, logges
   * på serveren og lagres på hver AI-generert oppgave.
   * 4: grunnreglene. 5: «Samsvar med eksisterende oppgavesett» (9.11.2026).
   * 6: referansebank for multiplikasjon, fagområde, oppgavesettet i bestillingen (10.11.2026).
   * 7: nye oppgaver følger nivåets støttestruktur, og strategier i instruksjonen må være matematisk
   *    gyldige for akkurat regnestykket (10.11.2026).
   */
  rulesVersion: '7',
  /** Prøves først. */
  primaryModel: 'gemini-3.8-flash',
  /** Brukes automatisk hvis primærmodellen når tidsgrensen eller svarer 500, 503 eller 504. */
  fallbackModel: 'gemini-3.5-flash-lite',
  /**
   * Standard tidsgrenser i millisekunder (profil og chat). Samlet ventetid blir høyst omtrent
   * primary + fallback. Modellene kjøres aldri samtidig, og det er ingen ekstra nye forsøk.
   */
  timeoutMs: {
    primary: 12_000,
    fallback: 20_000,
  },
  /**
   * Egne tidsgrenser per bruk. Oppgavegenerering går raskere over til reservemodellen: primærmodellen
   * avbrytes etter 4 sekunder.
   */
  timeoutMsByUse: {
    tasks: { primary: 4_000 },
  } as Partial<Record<AiUse, Partial<Record<'primary' | 'fallback', number>>>>,
  /**
   * Generelle oppgaver: AI-en lager reservekandidater, og nivåer som mangler oppgaver etter
   * kvalitetskontrollen fylles opp målrettet. Læreren får nøyaktig det bestilte antallet, eller ingen.
   */
  taskGeneration: {
    /** Ekstra kandidater per nivå utover det bestilte (og utover det som mangler ved utfylling). */
    reservePerLevel: 1,
    /** Høyst så mange utfyllinger etter første generering. */
    maxRefillAttempts: 2,
  },
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

/** Tidsgrensene for én bruk: standard, med eventuelle egne grenser for bruken. */
export function timeoutsFor(use: AiUse): { primary: number; fallback: number } {
  return { ...aiConfig.timeoutMs, ...aiConfig.timeoutMsByUse[use] }
}
