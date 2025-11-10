# Nebula Backend Deployment (Ubuntu + nginx + UFW)

## 1. Voraussetzungen
- Ubuntu Server (root oder sudo Nutzer)
- Node.js (LTS) + npm
- nginx installiert (`sudo apt install -y nginx`)
- UFW aktiv (optional)

## 2. Backend Service als systemd Unit
Erstelle Datei `/etc/systemd/system/nebula-backend.service`:

```
[Unit]
Description=Nebula Backend API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nebula/Nebula/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/nebula/Nebula/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=3
User=root
# Optional: Beschränkungen
# NoNewPrivileges=true
# ProtectSystem=full
# ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Dann aktivieren:
```
sudo systemctl daemon-reload
sudo systemctl enable nebula-backend
sudo systemctl start nebula-backend
sudo systemctl status nebula-backend --no-pager
```

Logs ansehen:
```
sudo journalctl -u nebula-backend -n 100 --no-pager
```

## 3. Reverse Proxy über nginx (empfohlen)
Erstelle Datei `/etc/nginx/sites-available/nebula`:

```
server {
    listen 80;
    server_name YOUR_DOMAIN_HERE;

    # Security & Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Optional: einfache Rate Limit Zone (pro IP ~60req/min)
    limit_req_zone $binary_remote_addr zone=nebulaapi:10m rate=60r/m;

    location / {
        # Aktivieren einer Rate Limit
        limit_req zone=nebulaapi burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "keep-alive";
    }

    # Healthcheck schnell erreichbar
    location /ping {
        proxy_pass http://127.0.0.1:3001/ping;
    }
}
```

Aktivieren & testen:
```
sudo ln -s /etc/nginx/sites-available/nebula /etc/nginx/sites-enabled/nebula
sudo nginx -t
sudo systemctl reload nginx
curl -sS http://YOUR_DOMAIN_HERE/ping
```

## 4. HTTPS aktivieren (Let's Encrypt)
```
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN_HERE --agree-tos -m you@example.com --redirect
```
Nach erfolgreichem Zertifikat kannst du die `BACKEND_API_URL` im Client auf `https://YOUR_DOMAIN_HERE` setzen.

## 5. Firewall (UFW)
Wenn nur Ports 22/80/443 offen sein sollen:
```
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # öffnet 80 & 443
sudo ufw status
```
Port 3001 muss NICHT explizit geöffnet sein, wenn nur via Reverse Proxy erreichbar.

Zum Debug temporär direkt öffnen:
```
sudo ufw allow 3001/tcp
# Testen
curl http://SERVER_IP:3001/ping
# Danach wieder schließen
sudo ufw delete allow 3001/tcp
```

## 6. Backend .env
Beispiel `/opt/nebula/Nebula/backend/.env`:
```
PORT=3001
HYPIXEL_KEY=REPLACE_WITH_REAL_KEY
CACHE_TTL_MS=300000
```

## 7. Client .env
Im Desktop Projekt (nicht auf Server):
```
BACKEND_API_URL=https://YOUR_DOMAIN_HERE
```
Kein `HYPIXEL_KEY` im Client hinterlegen.

## 8. Update Prozess
Bei Codeänderung:
```
cd /opt/nebula/Nebula/backend
git pull
npm ci
npm run build
sudo systemctl restart nebula-backend
```

## 9. Diagnose Schnellreferenz
```
# Service Status
sudo systemctl status nebula-backend --no-pager
# Logs
sudo journalctl -u nebula-backend -n 50 --no-pager
# Health
curl -sS http://127.0.0.1:3001/ping
# Debug Endpoint
curl -sS http://127.0.0.1:3001/debug | jq
```

## 10. Sicherheitstipps
- API-Key regelmäßig rotieren (/api new im Spiel, dann .env anpassen und Service neu starten).
- Keine zusätzlichen offenen Ports außer 22/80/443.
- Optionale Fail2Ban-Regeln für wiederholte 429/403 Requests.
- Rate Limits im Backend + Proxy kombinieren.

## 11. Optional: Fail2Ban (Skizze)
Filter (regex) auf nginx access log für zu viele Requests einer IP. Nicht Teil der Grundinstallation.

---
Bei Fragen oder Bedarf nach Caddy-Konfiguration kann ein zusätzliches Beispiel ergänzt werden.
