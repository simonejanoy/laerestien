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
- **Elever** er lagt inn på forhånd i Firebase (prototype). Læreren lager ikke elever selv.
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

## Testelev (fiktiv)

Nora i klasse 4A brukes til å demonstrere flyten mellom lærer og elev. Hun logger inn med `nora@teigen.no` (passordet står ikke i koden). Profilen i Firebase heter «Nora Teigen», men i appen vises hun som «Nora L.» (navnet i klasselista). Alle elevene og kontoene i prototypen er fiktive.

Det som må finnes i Firebase:

- **Authentication → Users:** `nora@teigen.no`.
- **Firestore → `users/{uid}`** (samme uid som i Authentication): `name: "Nora Teigen"`, `role: "student"`, `classId: "4A"`, gjerne `email: "nora@teigen.no"`. Valgfritt: `level` (1–3) – ellers får hun nivået i klasselista (3).

Kontoen kobles til raden hennes i klasselista ([`roster.ts`](src/features/class/roster.ts)) på uid eller e-post – ikke på navn, så navnet i profilen og navnet som vises kan være forskjellige. Mangler e-posten i profilen, skriver appen inn e-posten fra innloggingen første gang eleven logger inn (bare det feltet; se `firestore.rules`). Mangler profilen eller noen av feltene, sier innloggingssiden hva som mangler.

## Økta som pågår

- Læreren starter økta (Start økt). Hver start er en ny gjennomføring med egen ID, så framdrift fra en tidligere gjennomføring aldri vises i en ny.
- Eleven ser «Venter på læreren» til økta er startet, og får oppgavene på sitt nivå av seg selv. Å avslutte økta beholder økta i Firestore med status «avsluttet», så eleven får beskjed og læreren ser de endelige resultatene.
- Når eleven leverer en oppgave, lagres det i `liveSessions/{klasse}/progress/{gjennomføring}__{uid}` (hvilke oppgaver som er levert, og om de var riktige – ingen navn eller svartekst). «Følg elevenes arbeid» lytter på dette og oppdateres med en gang.
- Elevens svar og hvor eleven er, lagres også i nettleseren, så de er der etter omlasting.
- **Husk å publisere [`firestore.rules`](firestore.rules) på nytt** etter endringer – ellers kan ikke elevene levere, og e-posten skrives ikke inn i elevprofilen.
- Innloggingen deles mellom alle faner i samme nettleserprofil. Ha læreren og eleven i hver sin profil, f.eks. et vanlig og et privat vindu.

## Status

Øktene, oppgavene og statistikken bruker foreløpig testdata. Innlogging, lærer- og elevkontoer, start, pause og avslutning av økter og elevenes framdrift i «Følg elevenes arbeid» går mot Firebase.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm run dev:api` – API-serveren for AI-assistenten
- `npm run build` – typesjekk og produksjonsbygg
- `npm run lint` – lint med oxlint
- `npm test` – tester (Node)
- `npm run test:e2e` – nettlesertester (Playwright, bruker den lokale Chrome-installasjonen)
