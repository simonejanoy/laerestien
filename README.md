# Lærestien

Matteapp for 4. trinn. Læreren planlegger og starter økter, elevene får oppgaver på sitt nivå, og læreren følger arbeidet og ser statistikk.

Laget med React, TypeScript, Tailwind CSS (v4) og Firebase (Authentication + Firestore).

## Kom i gang

1. Installer avhengigheter:
   ```sh
   npm install
   ```
2. Kopier `.env.example` til `.env.local` og fyll inn verdiene fra Firebase Console → Prosjektinnstillinger → Dine apper. `.env.local` skal ikke inn i git.
3. Start appen:
   ```sh
   npm run dev
   ```
4. For AI-assistenten: kopier `GEMINI_API_KEY=` fra `.env.example` til en ny fil `.env`, lim inn nøkkelen og start API-serveren i et eget terminalvindu:
   ```sh
   npm run dev:api
   ```

## AI-assistent (Gemini)

Assistenten hjelper læreren med å lage og tilpasse oppgaver. Den bruker `gemini-3.5-flash-lite` via Googles Gen AI SDK (`@google/genai`).

- **Nøkkelen** ligger i `.env` som `GEMINI_API_KEY` (hent den på [aistudio.google.com/apikey](https://aistudio.google.com/apikey)). `.env` er i `.gitignore`. Siden variabelen ikke har `VITE_`-prefiks, kommer den aldri med til nettleseren.
- **Alle kall** går via API-serveren i [`server/`](server/) (`npm run dev:api`, port 8787). Vite videresender `/api` dit. Serveren godtar bare innloggede lærere, og elevopplysninger bare for lærerens egen klasse.
- **Systemprompten** ligger i [`src/ai/systemPrompt.md`](src/ai/systemPrompt.md) og sendes som `systemInstruction`.
- **Modell, thinking level og maks output-tokens** står i [`src/ai/config.ts`](src/ai/config.ts).
- **Testforespørsler** for reglene står i [`src/ai/testforesporsler.md`](src/ai/testforesporsler.md).

Til produksjon må API-serveren kjøre et sted (f.eks. Cloud Run) med `GEMINI_API_KEY` og `VITE_FIREBASE_PROJECT_ID` som miljøvariabler.

## Firebase-oppsett

- **Authentication:** slå på «E-post/passord».
- **Firestore:** lim inn [`firestore.rules`](firestore.rules) under Regler og publiser.
- **Lærerkode:** lag dokumentet `config/signup` med feltet `teacherCode` (string). Lærere må oppgi koden når de registrerer seg.

## Brukere

- **Lærere** registrerer seg selv via «Ny lærer? Registrer deg» på innloggingssiden.
- **Elever** lages av læreren under «Elever» i sidemenyen (navn, e-post, passord og nivå).
- Alle logger inn på samme side. Rollen i `users/{uid}` avgjør om man kommer til lærer- eller elevvisningen.

## Mappestruktur

```
src/
  components/   felles UI (ui/) og oppsett (layout/)
  context/      innlogging (AuthContext)
  features/     én mappe per del av appen: auth, calendar, sessions, tasks,
                topics, live, student, statistics, class
  ai/           AI-assistenten: systemprompt, konfigurasjon og kall til API-serveren
  lib/          Firebase og Firestore-funksjoner
  types/        felles TypeScript-typer
```

Farger og tekststiler fra Figma ligger som Tailwind-tokens i `src/index.css`.

## Status

Øktene, oppgavene, «Følg elevenes arbeid» og statistikken bruker foreløpig testdata. Innlogging, lærer- og elevkontoer og start/pause av økter går mot Firebase.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm run dev:api` – API-serveren for AI-assistenten
- `npm run build` – typesjekk og produksjonsbygg
- `npm run lint` – lint med oxlint
