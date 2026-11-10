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
          format: {
            type: Type.STRING,
            enum: ['regnestykke', 'tekst'],
            description:
              'regnestykke: kort regnestykke med to tall og én regneart, vist som appens vanlige hoderegningsoppgaver (fyll ut oppgavetype, instruksjon, tall1, regneart og tall2). tekst: tekstoppgave (fyll ut oppgavetekst og fasit).',
          },
          oppgavetekst: { type: Type.STRING, description: 'Oppgavetekst beregnet på eleven. Tom streng for regnestykke.' },
          fasit: { type: Type.STRING, description: 'Fasit eller løsningsforslag til læreren. Tom streng for regnestykke (appen regner ut svaret).' },
          oppgavetype: { type: Type.STRING, enum: ['Hoderegning', 'Oppstilling'], description: 'Bare for regnestykke.' },
          instruksjon: { type: Type.STRING, description: 'Bare for regnestykke: kort instruksjon over stykket, f.eks. «Regn ut.».' },
          tall1: { type: Type.INTEGER, description: 'Bare for regnestykke: første tall (helt tall, 0 eller større).', minimum: 0 },
          regneart: { type: Type.STRING, enum: ['+', '-', '·', ':'], description: 'Bare for regnestykke.' },
          tall2: { type: Type.INTEGER, description: 'Bare for regnestykke: andre tall (helt tall, 0 eller større).', minimum: 0 },
          kompetansemaal: {
            type: Type.STRING,
            description: 'Kompetansemålet oppgaven støtter, bare hvis læreren har oppgitt det. Ellers tom streng.',
          },
          tilpasning: {
            type: Type.STRING,
            description: 'Kort pedagogisk forklaring av nivået og det faglige innholdet (vises for læreren). Ingen ord om hvordan oppgaven ble laget.',
          },
        },
        required: ['nivaa', 'format', 'oppgavetekst', 'fasit', 'kompetansemaal', 'tilpasning'],
        propertyOrdering: [
          'nivaa',
          'format',
          'oppgavetype',
          'instruksjon',
          'tall1',
          'regneart',
          'tall2',
          'oppgavetekst',
          'fasit',
          'kompetansemaal',
          'tilpasning',
        ],
      },
    },
  },
  required: ['melding', 'oppgaver'],
  propertyOrdering: ['melding', 'oppgaver'],
}
