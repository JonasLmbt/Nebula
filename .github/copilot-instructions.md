## Overview
Nebula is a small Electron app (TypeScript) — an overlay that shows Hypixel Bedwars statistics.

- Main process: `src/main.ts` (Electron lifecycle, IPC, HTTP fetches)
- Renderer: `src/renderer/index.html` (no bundler; inline HTML/CSS/JS)
- Build: `npm run build` → `tsc` → output to `./dist`
- Start: `npm run start` (build + `electron ./dist/main.js`)
- Dev: `npm run dev` (runs `ts-node ./src/main.ts` for faster main-process iteration)

## Conventions & Patterns
- Renderer runs with `nodeIntegration: true` and `contextIsolation: false` (you can `require('electron')` directly in `index.html`).
- The renderer is not bundled — edit `src/renderer/index.html` directly for UI changes.
- The main process compiles via `tsc`; the built entry is `dist/main.js`.
- Environment: copy `.env.example` → `.env` and set `HYPIXEL_KEY` (Hypixel API key). Without a key, `bedwars:stats` returns an error object.

## IPC channels (integration points)
- `bedwars:stats` (invoke) — expects `(name: string)`; returns an object or `{ error: string }` (implemented in `src/main.ts`).
  Example shape: `{ name, level, ws, fkdr, wlr, bblr, fk, wins }` or `{ error }`.
- `window:minimize` (send)
- `window:close` (send)
- `window:resize` (invoke) — payload: `{ edge: 'left'|'right'|'top'|'bottom'|'top-left'|..., dx: number, dy: number }`

## Networking / external dependencies
- `src/main.ts` calls the Mojang API and Hypixel API (`fetch` via `node-fetch`). Ensure `HYPIXEL_KEY` is configured.
- Note: `node-fetch` and `dotenv` are imported in source (`node-fetch`, `dotenv/config`). If they’re missing from `package.json`, install them: `npm i node-fetch dotenv`.

## Common developer workflows
- Quick iteration during development (often only main changes): `npm run dev` (ts-node). Renderer changes are instantly visible since `index.html` is loaded directly.
- Full build + run: `npm run start` (compiles with `tsc` and starts Electron with `dist/main.js`).
- Open DevTools temporarily by uncommenting `win.webContents.openDevTools({ mode: 'detach' });` in `src/main.ts`.

## Code and security notes for contributors
- The renderer has direct Node access — when adding packages/endpoints, consider XSS/remote-code risks.
- If you change the IPC contract, update both the handlers in `src/main.ts` and the calls in `src/renderer/index.html`.

## Frequently-touched files
- `src/main.ts` — Electron lifecycle, IPC, API fetches, resize logic
- `src/renderer/index.html` — UI, interactions, DOM manipulation, CSS variables
- `package.json` — scripts: `build`, `start`, `dev`
- `tsconfig.json` — output paths (`outDir: ./dist`), `rootDir: ./src`, `strict: true`

If anything is unclear or you want me to automatically adjust a file (e.g., add a missing `dependencies` block in `package.json`), let me know — I’ll update the instructions precisely.
