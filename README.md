# Nebula

Nebula is a lightweight Bedwars stats overlay for Hypixel that automatically detects players from your game chat.

## Features

### 🎮 Automatic Player Detection
- Monitors Minecraft chat log in real-time
- Detects players from various sources:
  - `/who` command output
  - Join/leave messages
  - Party members
  - Final kills
- Supports multiple Minecraft clients:
  - Vanilla
  - Lunar
  - Badlion
  - PvPLounge
  - LabyMod
  - Feather

### 📊 Smart Stats Loading
- Efficient Hypixel API usage:
  - 10-minute stat caching
  - Rate limiting (max 3 concurrent requests)
  - Automatic queue management
  - UUID caching
- Incremental updates (only loads new players)
- Preserves API key limits

### 🔧 Technical Details
- Electron-based overlay
- TypeScript for type safety
- IPC communication between processes
- File monitoring via `tail`

## Setup

### Installation
1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Add your Hypixel API key to `.env`:
```env
HYPIXEL_KEY=your-key-here
```

### Development
- Full build & run: `npm run start`
- Quick iteration (main process): `npm run dev`
- Build only: `npm run build`

### Distributables & Updates

Nebula kann als Windows‑Installer gebaut und automatisch aktualisiert werden (electron-builder + electron-updater).

1) Lokalen Installer bauen

```powershell
npm run dist
```

Die Artefakte liegen in `release/` (NSIS Installer und Portable EXE). Hinweis: Falls der lokale Build auf Windows wegen fehlender Symlink‑Rechte fehlschlägt, nutze den GitHub Actions Build (siehe unten).

2) Releases via GitHub Actions

- Erstelle ein Git‑Tag im Format `vX.Y.Z` und pushe es:

```powershell
git tag v1.0.1
git push --tags
```

- Die Action `.github/workflows/release.yml` baut auf `windows-latest` und lädt die Artefakte (EXE, `latest.yml`, Blockmaps) zum GitHub Release hoch.

3) Auto‑Update für Nutzer

- Die App prüft im gepackten Modus automatisch auf Updates und lädt diese im Hintergrund.
- Beim nächsten Neustart ist die neue Version aktiv. Optional kann per IPC `update:install` sofort neu gestartet werden.

Voraussetzungen/Technik:
- `package.json > build.publish` zeigt auf `github` (Repo: `JonasLmbt/Nebula`).
- Der Auto‑Updater ist nur aktiv, wenn die App gepackt läuft (`app.isPackaged`).

## Usage

1. Start the overlay
2. Join a Bedwars lobby
3. Player stats will automatically appear when:
   - Players are detected in chat
   - `/who` command is used
   - Party members join/leave
   - Final kills occur

## Privacy Notice

Nebula reads your Minecraft chat log file to detect players. It only processes:
- Chat messages marked with `[CHAT]`
- Player names and game events
- No personal messages or other chat content

The app connects to:
- Mojang API (UUID lookups)
- Hypixel API (player stats)

All data is processed locally and cached temporarily (10 minutes).

## Technical Notes

### Log File Locations
Default paths checked (in order of recency):
```
%APPDATA%/.minecraft/logs/latest.log
%APPDATA%/.minecraft/logs/blclient/minecraft/latest.log
%APPDATA%/.lunarclient/offline/1.8.9/logs/latest.log
%APPDATA%/.pvplounge/logs/latest.log
%APPDATA%/.minecraft/logs/fml-client-latest.log
```

### Rate Limiting
- Max 3 concurrent Hypixel API requests
- 150ms delay between requests
- 10-minute cache for player stats
- Automatic UUID caching
