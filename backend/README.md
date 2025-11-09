# Nebula Backend

A lightweight Express server that proxies Hypixel API requests for the Nebula desktop client. Keeps your production Hypixel API key private, enables central caching, and offers endpoints for Plus feature verification.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /ping | Health check, returns cache TTL hint (cache_player). |
| GET | /api/player/:name | Returns Bedwars stats object. Caches results for CACHE_TTL_MS. |
| POST | /api/plus/verify | (Stub) Verify Stripe payment session and activate Plus. |

Response shape (player stats):
```
{
  name, level, ws, fkdr, wlr, bblr, fk, wins,
  rankTag, rankColor, guild: { name, tag } | null,
  uuid, unresolved? // if Mojang lookup failed
}
```

## Quick Start
```powershell
# On Hetzner VM (Ubuntu/Debian)
sudo apt update
sudo apt install -y git curl build-essential
# Install Node (use LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone your repo (or copy only backend/)
git clone https://github.com/JonasLmbt/Nebula.git
cd Nebula/backend
cp .env.example .env
# EDIT .env and set HYPIXEL_KEY (from /api new in-game)

npm install
npm run build
npm start
```

## Systemd Service (Optional)
Create `/etc/systemd/system/nebula-backend.service`:
```
[Unit]
Description=Nebula Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nebula/backend
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/opt/nebula/backend/.env
User=nebula
Group=nebula

[Install]
WantedBy=multi-user.target
```
Then:
```powershell
sudo adduser --system --group nebula
sudo mkdir -p /opt/nebula
sudo chown nebula:nebula /opt/nebula
# copy backend/ to /opt/nebula/backend
sudo systemctl daemon-reload
sudo systemctl enable nebula-backend
sudo systemctl start nebula-backend
sudo systemctl status nebula-backend
```

## Firewall & Security
```powershell
sudo ufw allow 3001/tcp
sudo ufw enable
sudo ufw status
```
Add HTTPS (Caddy / nginx reverse proxy + TLS):
```
# Example with Caddy (install caddy, then /etc/caddy/Caddyfile)
nebula.example.com {
  reverse_proxy localhost:3001
}
```

## Hypixel IP Whitelist
Log into Hypixel developer portal (same place you manage your API key) and add the public IPv4 of your Hetzner server. Find it with:
```powershell
curl -4 ifconfig.me
```
After adding, requests from the backend count only against your single production key; the desktop client never exposes it.

## Client Integration
In the desktop project `.env` file used for building releases:
```
BACKEND_API_URL=https://nebula.example.com
# Do NOT set HYPIXEL_KEY in the client for production.
```
The main process already disables local key fallback when `BACKEND_API_URL` is present.

## Rate Limiting & Caching
- 60 requests/minute per IP (simple in-memory counter).
- Player stats cached for 5 minutes (configurable via `CACHE_TTL_MS`).
- Mojang UUID lookups cached separately.

For multi-instance scaling, replace in-memory cache with Redis.

## Next Steps / TODO
- Implement `/api/plus/verify` server-side (Stripe checkout verification + Firestore update).
- Add Discord token exchange if moved server-side.
- Replace simple rate limiter with Redis or better algorithm if traffic grows.

## Troubleshooting
- 429 errors: Your client is hitting rate limit (increase window or deploy caching).
- 503 on /api/player: HYPIXEL_KEY missing in backend `.env`.
- Slow responses: Check Hetzner bandwidth, consider increasing cache TTL.

Enjoy! 🎮
