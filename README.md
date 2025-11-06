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
