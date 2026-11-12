import type { AiLevel, DivisionType, ReferenceArea, ReferenceTopic } from '../../src/ai/contract.ts'

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
  /** Tall og regning: områdets ID i referansefilen, når den er en annen enn `area` (ID-en finnes i en annen bank). */
  sourceArea?: string
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
  /** Problemløsing: løsningsforslag med alle steg (bare til læreren og kontrollen – sendes ikke til AI-en). */
  workedSolution?: string
  /** Problemløsing: «kort» svar eller «forklaring». */
  answerForm?: 'kort' | 'forklaring'
  /**
   * Strategier i divisjon: divisjonstypen referansen viser (delingsdivisjon: antall grupper er kjent; målingsdivisjon:
   * størrelsen på hver gruppe er kjent), eller «begge» når eleven skal skille dem. Oppgavetekst og fasit må være enige.
   */
  divisionType?: DivisionType | 'begge'
  /** Flervalg: alternativene i rekkefølge (A, B, C …). De står også i elevteksten. */
  options?: string[]
  /** Flervalg: bokstavene til de riktige alternativene. Mer enn én bare når elevteksten sier det. */
  correctOptions?: string[]
  source: ReferenceSource
}

export interface ReferenceBank {
  schemaVersion: number
  topic: string
  description: string
  referenceCount: number
  references: ReferenceTask[]
}
