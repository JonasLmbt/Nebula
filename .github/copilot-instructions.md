## Kurzüberblick
Nebula ist eine kleine Electron-App (TypeScript) — ein Overlay, das Bedwars-Statistiken von Hypixel anzeigt.

- Hauptprozess: `src/main.ts` (Electron, IPC, HTTP-Fetches)
- Renderer: `src/renderer/index.html` (keine Bundling-Pipeline, Inline-HTML/CSS/JS)
- Build: `npm run build` → `tsc` → Ausgabepfad `./dist`
- Start: `npm run start` (build + `electron ./dist/main.js`)
- Dev: `npm run dev` (führt `ts-node ./src/main.ts` — schnelleres Iterieren am Main-Prozess)

## Wichtige Konventionen & Patterns
- Renderer hat `nodeIntegration: true` und `contextIsolation: false` (direkter `require('electron')` in `index.html`).
- Renderer ist nicht gebündelt: ändere `src/renderer/index.html` direkt für UI-Änderungen.
- Main-Prozess kompiliert über `tsc` → der gebaute Einstieg ist `dist/main.js`.
- Environment: Kopiere `.env.example` → `.env` und setze `HYPIXEL_KEY` (Hypixel API-Key). Ohne Key gibt `bedwars:stats` eine Fehler-Antwort.

## IPC-Kanäle (wichtige Integrationspunkte)
- `bedwars:stats` (invoke) — erwartet `(name: string)`; Rückgabe: Objekt oder `{ error: string }`. (Implementierung in `src/main.ts`.)
  Beispiel-Shape: { name, level, ws, fkdr, wlr, bblr, fk, wins } oder { error }
- `window:minimize` (send)
- `window:close` (send)
- `window:resize` (invoke) — Payload: `{ edge: 'left'|'right'|'top'|'bottom'|'top-left'|..., dx: number, dy: number }`

## Netwerk / externe Abhängigkeiten
- `src/main.ts` ruft Mojang-API und Hypixel-API auf (`fetch` via `node-fetch`). Achte auf `HYPIXEL_KEY`.
- Hinweis: `node-fetch` und `dotenv` werden im Quelltext importiert (`node-fetch`, `dotenv/config`). Falls sie nicht in `package.json` auftauchen, installiere sie: `npm i node-fetch dotenv`.

## Typische Entwickler-Workflows
- Schnell starten während Entwicklung (ändert oft nur Main): `npm run dev` (ts-node). Renderer-Änderungen sind sofort sichtbar, weil `index.html` direkt geladen wird.
- Voller Build + Start: `npm run start` (führt `tsc` und startet Electron mit `dist/main.js`).
- Um DevTools zu öffnen: in `src/main.ts` die Zeile `win.webContents.openDevTools({ mode: 'detach' });` temporär einkommentieren.

## Code- und Sicherheits-Hinweise für Contributors
- Renderer hat direkten Node-Zugriff — beim Hinzufügen neuer Packages/Endpunkte auf mögliche XSS/remote-code-Risiken achten.
- Wenn du Änderungen am IPC-Contract machst, aktualisiere sowohl `src/main.ts` (handler) als auch die Aufrufe in `src/renderer/index.html`.

## Dateien, die beim Arbeiten am häufigsten relevant sind
- `src/main.ts` — Electron lifecycle, IPC, API-Fetches, Resize-Logik
- `src/renderer/index.html` — UI, Interaktion, DOM-Manipulation, CSS-Variablen
- `package.json` — Scripts: `build`, `start`, `dev`
- `tsconfig.json` — Ausgabepfade (`outDir: ./dist`), `rootDir: ./src`, `strict: true`

Wenn etwas unklar ist oder du möchtest, dass ich die Datei mit konkreten Ergänzungen (z. B. ein fehlendes `dependencies`-Block in `package.json`) automatisch anpasse, sag kurz Bescheid — ich passe die Instruktion präzise an.
