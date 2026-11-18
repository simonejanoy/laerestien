// Innstillinger for AI-assistenten. Brukes av API-serveren (server/). Appen leser bare
// tidsgrensen, for å vise «Vi prøver en reservemodell» mens læreren venter på elevforslag eller chat.
// Oppgavegenerering (generelle oppgaver, repetisjon og «Juster med AI») bruker gemini-3.5-flash-lite direkte.
// Elevforslag og fri chat prøver gemini-3.8-flash først og har gemini-3.5-flash-lite som reserve. Alle bruker «low».
// Ikke legg til temperature, top_p, top_k eller candidate_count – de er utfaset for modellen.

/** Gemini 3.8 støtter bare disse nivåene. */
export type ThinkingLevelName = 'low' | 'medium' | 'high'

/** Hva AI-en brukes til: oppgavegenerering eller fri chat. */
export type AiUse = 'tasks' | 'chat'

export const aiConfig = {
  /**
   * Versjonen av AI-reglene. Fra versjon 6 dekker den både systemprompten (systemPrompt.md) og
   * instruksjonene i brukermeldingen (server/prompts.ts). Oppdateres når en av dem endres, logges
   * på serveren og lagres på hver AI-generert oppgave.
   * 4: grunnreglene. 5: «Samsvar med eksisterende oppgavesett» (9.11.2026).
   * 6: referansebank for multiplikasjon, fagområde, oppgavesettet i bestillingen (10.11.2026).
   * 7: nye oppgaver følger nivåets støttestruktur, og strategier i instruksjonen må være matematisk
   *    gyldige for akkurat regnestykket (10.11.2026).
   * 8: figurer i geometri – AI-en kan velge en plan figur eller en vinkel som appen tegner selv (feltet
   *    figur i svaret), figur, spørsmål og fasit må stemme, og eleven bes ikke tegne. Ved «Juster med AI»
   *    beholdes figuren med mindre læreren uttrykkelig ber om å endre eller fjerne den (11.11.2026).
   * 9: nye oppgaver på samme nivå skal være forskjellige fra hverandre – ikke samme formulering med bare nye tall –
   *    og læreren kan bestille oppgaver på utvalgte nivåer (12.11.2026).
   * 10: AI-støttet repetisjon – en anonym oppsummering av klassens resultater per nivå og undertema styrer innholdet,
   *     og AI-en begrunner kort forslaget i melding (12.11.2026).
   */
  rulesVersion: '10',
  /**
   * Oppgavegenerering: generelle oppgaver (også repetisjon og utfyllingene) og «Juster med AI». Modellen kalles direkte,
   * én gang per kall, uten primær- og reservemodell. Tidsgrensen er den samme som modellen hadde før (`timeoutMs.fallback`).
   */
  taskModel: 'gemini-3.5-flash-lite',
  /** Elevforslag og fri chat: prøves først. */
  primaryModel: 'gemini-3.8-flash',
  /** Elevforslag og fri chat: brukes automatisk hvis primærmodellen når tidsgrensen eller svarer 500, 503 eller 504. */
  fallbackModel: 'gemini-3.5-flash-lite',
  /**
   * Standard tidsgrenser i millisekunder (chat). Samlet ventetid blir høyst omtrent
   * primary + fallback. Modellene kjøres aldri samtidig, og det er ingen ekstra nye forsøk.
   */
  timeoutMs: {
    primary: 12_000,
    fallback: 20_000,
  },
  /**
   * Egne tidsgrenser per bruk. Elevforslag (bruk «tasks» med primær- og reservemodell) går raskere over til
   * reservemodellen: primærmodellen avbrytes etter 4 sekunder. Oppgavegenerering bruker ikke primærmodellen.
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
    chat: 'low',
  } satisfies Record<AiUse, ThinkingLevelName>,
  /** Tenkingen teller med i output-tokens. */
  maxOutputTokens: {
    tasks: 16_384,
    chat: 4_096,
  } satisfies Record<AiUse, number>,
}

/** Tidsgrensene for én bruk: standard, med eventuelle egne grenser for bruken. */
export function timeoutsFor(use: AiUse): { primary: number; fallback: number } {
  return { ...aiConfig.timeoutMs, ...aiConfig.timeoutMsByUse[use] }
}
