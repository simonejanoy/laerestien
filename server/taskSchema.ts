import { Type, type Schema } from '@google/genai'

// Strukturert output for oppgavegenerering. Feltnavnene leses av parseTaskResult
// i src/ai/contract.ts.

export const taskSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    melding: {
      type: Type.STRING,
      description:
        'Kort beskjed til læreren, f.eks. hva som er rettet, hva som ikke kunne følges, eller et oppfølgingsspørsmål. Tom streng hvis ikke nødvendig.',
    },
    oppgaver: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nivaa: {
            type: Type.INTEGER,
            description: 'Vanskelighetsnivå: 1, 2 eller 3 (1 er minst utfordrende).',
            minimum: 1,
            maximum: 3,
          },
          oppgavetekst: { type: Type.STRING, description: 'Oppgavetekst beregnet på eleven.' },
          fasit: { type: Type.STRING, description: 'Fasit eller løsningsforslag til læreren.' },
          kompetansemaal: {
            type: Type.STRING,
            description: 'Kompetansemålet oppgaven støtter, bare hvis læreren har oppgitt det. Ellers tom streng.',
          },
          tilpasning: { type: Type.STRING, description: 'Kort forklaring på tilpasningen til trinn og utfordring.' },
        },
        required: ['nivaa', 'oppgavetekst', 'fasit', 'kompetansemaal', 'tilpasning'],
        propertyOrdering: ['nivaa', 'oppgavetekst', 'fasit', 'kompetansemaal', 'tilpasning'],
      },
    },
  },
  required: ['melding', 'oppgaver'],
  propertyOrdering: ['melding', 'oppgaver'],
}
