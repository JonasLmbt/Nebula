# Nebula

Nebula is a lightweight Bedwars stats overlay for Hypixel that automatically detects players from your game chat.

## 🚀 For End Users

**Just download and run!** No configuration needed.

1. Download the latest release from [GitHub Releases](https://github.com/JonasLmbt/Nebula/releases)
2. Install and run the application
3. Join a Bedwars lobby on Hypixel
4. Player stats will automatically appear in the overlay

That's it! The app works out of the box without any API keys or configuration.

> **Note**: Some advanced features (Discord integration, cloud sync, Plus subscription) may not be available in all builds. The core stats overlay functionality always works.

## 📋 Features

### Automatic Player Detection
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

### Smart Stats Loading
- Efficient API usage with caching
- Automatic rate limiting
- Incremental updates (only loads new players)
- Works even when Hypixel API is under load

### Privacy
- All data processed locally on your computer
- No personal information is collected
- Only reads Minecraft chat for player detection
- Connects to Mojang and Hypixel APIs for stats only

## 🔧 For Developers

Want to run your own instance or contribute to development? See below.

### Two Deployment Options

#### Option A: Backend Service (Recommended for Distribution)

Best for: Sharing the app with others without requiring them to have API keys.

1. Set up a backend service that handles API calls
2. Configure only `BACKEND_API_URL` in `.env`
3. Users can run the app without any configuration

Your backend should implement:
- `GET /ping` - Health check
- `GET /api/player/:name` - Get player stats
- `POST /api/plus/verify` - Verify Stripe payments (optional)

#### Option B: Developer Mode (API Keys)

Best for: Local development and testing.

1. Get your own API keys:
   - Hypixel: Run `/api new` on Hypixel server
   - Discord: Create app at [Discord Developer Portal](https://discord.com/developers/applications)
   - Firebase: Create project at [Firebase Console](https://console.firebase.google.com/)

2. Copy `.env.example` to `.env` and configure your keys

3. Run the app in development mode

### Installation

```bash
npm install
```

### Development

```bash
# Quick iteration (main process only)
npm run dev

# Full build & run
npm run start

# Build only
npm run build
```

### Environment Configuration

See `.env.example` for detailed configuration options. Key points:

- **For public distribution**: Only set `BACKEND_API_URL`
- **For development**: Set `HYPIXEL_KEY` and optionally Discord/Firebase configs
- **Never commit** `.env` file (it's in `.gitignore`)
- **Keep secrets server-side** (Stripe, Firebase Admin, etc.)

## 📦 Building & Distribution

### Local Build

Build a distributable for testing:

```bash
npm run dist
```

Artifacts are created in `release/` directory (NSIS installer and portable EXE).

> **Note**: If building fails on Windows due to symlink permissions, use GitHub Actions instead (see below).

### Automated Releases (GitHub Actions)

Create and push a version tag to automatically build and release:

```bash
git tag v1.0.1
git push --tags
```

The workflow `.github/workflows/release.yml` will:
- Build on Windows
- Create a GitHub Release
- Upload installer and auto-update files

### Auto-Updates

When running a packaged build:
- App automatically checks for updates on startup
- Downloads updates in background
- Prompts user to install on next restart
- Can trigger immediate install via IPC `update:install`

> **Note**: Auto-updater only works in packaged builds (`app.isPackaged`).

## 🔐 Security & Privacy

### For End Users
- No API keys needed
- All processing happens on your computer  
- Only reads Minecraft chat logs (no personal messages)
- Connects to public APIs (Mojang, Hypixel) for player stats

### For Developers

**Important Security Rules:**

1. **Never commit secrets** to the repository:
   - `.env` is in `.gitignore` - keep it that way
   - Don't hardcode API keys in source code

2. **Keep backend secrets server-side only:**
   - Stripe API keys (Secret Key, Webhook Secret)
   - Firebase Admin SDK credentials
   - Any other sensitive credentials

3. **What's safe in the client:**
   - Firebase web config (API key, project ID) - protected by Firestore rules
   - Discord Client ID - public identifier
   - Backend API URL - public endpoint

4. **For public distribution:**
   - Use a backend service to proxy API calls
   - Don't include any API keys in the distributed build
   - Set `BACKEND_API_URL` to point to your secure backend

## 🛠️ API Integration

### Backend API Specification

If you're setting up a backend service, implement these endpoints:

```
GET  /ping
Response: { success: true, cache_player: 300000 }

GET  /api/player/:name
Response: {
  name: string,
  level: number,
  fkdr: number,
  wlr: number,
  // ... other stats
}

POST /api/plus/verify
Body: { userId: string, sessionId: string }
Response: { success: true, expiresAt: number, message: string }
```

### Local Development Without Backend

1. Get a Hypixel API key: `/api new` on Hypixel server
2. Add to `.env`: `HYPIXEL_KEY=your-key-here`
3. Optional: Configure Discord/Firebase for additional features

The app will automatically use local API keys when no backend is configured.

## 📝 Usage

### For End Users

1. Download and install the app
2. Start the overlay
3. Join a Bedwars lobby on Hypixel
4. Player stats will automatically appear when:
   - Players are detected in chat
   - `/who` command is used
   - Party members join/leave
   - Final kills occur

### For Developers

When running from source:
```bash
npm run dev    # Quick development mode
npm run start  # Full build and run
```

## 🔍 Technical Details

### Minecraft Client Support

Automatically detects and monitors log files from:
- Vanilla Minecraft
- Lunar Client
- Badlion Client  
- PvPLounge
- LabyMod
- Feather Client

### Log File Locations

Default paths checked (in order of recency):
```
%APPDATA%/.minecraft/logs/latest.log
%APPDATA%/.minecraft/logs/blclient/minecraft/latest.log
%APPDATA%/.lunarclient/offline/1.8.9/logs/latest.log
%APPDATA%/.pvplounge/logs/latest.log
%APPDATA%/.minecraft/logs/fml-client-latest.log
```

### Performance & Rate Limiting

- Max 3 concurrent API requests
- 150ms delay between requests
- 5-minute cache for player stats
- Automatic UUID caching
- Smart queue management

### Architecture

- **Frontend**: Electron + HTML/CSS/TypeScript
- **Chat Parser**: Real-time log file monitoring with `tail`
- **API Router**: 3-tier fallback system (Backend → User Key → Error)
- **State Management**: IPC communication between main and renderer processes

## 💎 Premium Features

### Nebula Plus

Optional premium features are managed securely through a backend service:

- **Payment**: Stripe checkout (no secrets in client)
- **Verification**: Backend validates purchases using Stripe webhooks
- **Status Check**: Client queries backend for subscription status
- **Security**: All sensitive operations handled server-side

**For developers implementing Plus:**
1. Set up Stripe account and webhook endpoint
2. Configure `BACKEND_API_URL` in `.env`
3. Implement `/api/plus/verify` endpoint on backend
4. Backend stores subscription status in Firebase/database

**Important**: Stripe secrets (API keys, webhook secrets) must **never** be in the client app. They belong exclusively on the backend server.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/JonasLmbt/Nebula.git
cd Nebula

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your Hypixel API key (optional, for local development)
# Edit .env and set HYPIXEL_KEY=your-key-here

# Run in development mode
npm run dev
```

## 📄 License

This project is licensed under the MIT License – see the `LICENSE` file for details.
