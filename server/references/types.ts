import type { AiLevel, ReferenceArea, ReferenceTopic } from '../../src/ai/contract.ts'

// Referansebanken: originale referanseoppgaver som bare brukes som kontekst for Gemini.
// De legges aldri inn som elevoppgaver, og de returneres aldri direkte til læreren.
// PDF-ene de er laget fra er dokumentasjon og kvalitetssikringsgrunnlag – programmet leser dem ikke.

export interface ReferenceSource {
  /** «gruppen» for prosjektgruppens egne oppgaver. */
  kind: string
  /** PDF-en referansen står i. */
  document: string
}

export interface ReferenceTask {
  /** Stabil ID, f.eks. «M1-N1-01» (fagområde 1, nivå 1, nr. 01). */
  id: string
  /** Hovedtema, f.eks. «multiplikasjon» eller «tall-og-plassverdi». */
  topic: ReferenceTopic
  /** Fagområde. */
  area: ReferenceArea
  areaTitle: string
  level: AiLevel
  title: string
  /** F.eks. «Hoderegning», «Tallinje» eller «Feilanalyse». */
  format: string
  /** Faglig hensikt. */
  purpose: string
  /** Oppgavetekst eller regnestykke slik eleven ser det. */
  studentText: string
  solution: string
  /** Eventuell representasjon (figuren finnes bare i PDF-en). */
  representationHint: string | null
  teacherNote: string | null
  source: ReferenceSource
}

export interface ReferenceBank {
  schemaVersion: number
  topic: string
  description: string
  referenceCount: number
  references: ReferenceTask[]
}
