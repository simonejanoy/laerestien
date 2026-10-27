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
  lib/          Firebase og Firestore-funksjoner
  types/        felles TypeScript-typer
```

Farger og tekststiler fra Figma ligger som Tailwind-tokens i `src/index.css`.

## Status

Øktene, oppgavene, «Følg elevenes arbeid» og statistikken bruker foreløpig testdata. Innlogging, lærer- og elevkontoer og start/pause av økter går mot Firebase.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm run build` – typesjekk og produksjonsbygg
- `npm run lint` – lint med oxlint
