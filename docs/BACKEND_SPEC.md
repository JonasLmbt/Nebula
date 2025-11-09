# Nebula Backend API Specification

This document describes the backend API that Nebula clients can connect to for stats lookup and premium features.

## Overview

The backend service acts as a proxy between the Nebula client and external APIs (Hypixel, Mojang, Stripe). This allows you to:

- Distribute the app without requiring users to have API keys
- Protect your API keys from exposure in the client
- Add rate limiting and caching server-side
- Implement premium features securely

## Base URL

Configure in `.env`:
```
BACKEND_API_URL=https://your-backend.example.com
```

## Endpoints

### 1. Health Check

**GET** `/ping`

Check if the backend is available and get cache configuration.

**Response:**
```json
{
  "success": true,
  "cache_player": 300000
}
```

**Fields:**
- `success` (boolean): Always true if backend is up
- `cache_player` (number, optional): Cache timeout in milliseconds for client to use

---

### 2. Get Player Stats

**GET** `/api/player/:name`

Fetch Bedwars statistics for a player by their username.

**Parameters:**
- `name` (string): Minecraft username

**Response (Success):**
```json
{
  "name": "PlayerName",
  "level": 45,
  "experience": 225000,
  "ws": 5,
  "fkdr": 2.45,
  "wlr": 1.82,
  "bblr": 1.23,
  "fk": 1234,
  "fd": 503,
  "wins": 456,
  "losses": 250,
  "bedsBroken": 890,
  "bedsLost": 723,
  "kills": 3456,
  "deaths": 2100,
  "mode": "Doubles",
  "winsPerLevel": 10.13,
  "fkPerLevel": 27.42,
  "bedwarsScore": 2.05,
  "networkLevel": 89,
  "guildName": "ExampleGuild",
  "guildTag": "[TAG]",
  "rankTag": "[MVP++]",
  "rankColor": "#FFAA00",
  "uuid": "069a79f444e94726a5befca90e38aaf5"
}
```

**Response (Player not found / Nick):**
```json
{
  "name": "UnknownPlayer",
  "level": 0,
  "ws": 0,
  "fkdr": 0,
  "wlr": 0,
  "bblr": 0,
  "fk": 0,
  "wins": 0,
  "rankTag": null,
  "rankColor": null,
  "unresolved": true
}
```

**Response (Error):**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60000
}
```

**Notes:**
- Backend should cache player data for 5-10 minutes
- Handle Mojang UUID lookups internally
- Handle Hypixel API requests internally
- Implement rate limiting to protect your API key

---

### 3. Verify Plus Purchase

**POST** `/api/plus/verify`

Verify a Stripe checkout session and activate Plus subscription.

**Request Body:**
```json
{
  "userId": "discord_user_id_here",
  "sessionId": "cs_test_stripe_session_id"
}
```

**Response (Success):**
```json
{
  "success": true,
  "expiresAt": 1704067200000,
  "message": "Plus activated successfully! Enjoy your premium features."
}
```

**Response (Error):**
```json
{
  "error": "Invalid session ID or payment not completed"
}
```

**Server-side Logic:**
1. Validate the Stripe session ID using Stripe API
2. Check payment was successful
3. Calculate expiry date (monthly/yearly)
4. Store subscription in database (Firestore, PostgreSQL, etc.)
5. Return expiry timestamp

**Security Notes:**
- This endpoint must use your Stripe Secret Key
- Never expose Stripe secrets to the client
- Verify the session hasn't already been processed
- Use webhook for reliable payment confirmation

---

## Implementation Examples

### Node.js / Express

```javascript
const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const HYPIXEL_KEY = process.env.HYPIXEL_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

// Health check
app.get('/ping', (req, res) => {
  res.json({ 
    success: true, 
    cache_player: 300000 
  });
});

// Get player stats
app.get('/api/player/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    // 1. Get UUID from Mojang
    const mojangRes = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${name}`
    );
    if (!mojangRes.ok) {
      return res.json({ 
        name, level: 0, fkdr: 0, unresolved: true 
      });
    }
    const { id: uuid } = await mojangRes.json();
    
    // 2. Get player data from Hypixel
    const hypixelRes = await fetch(
      `https://api.hypixel.net/v2/player?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    );
    if (!hypixelRes.ok) {
      throw new Error('Hypixel API error');
    }
    const { player } = await hypixelRes.json();
    
    // 3. Process Bedwars stats
    const stats = processBedwarsStats(player, name);
    stats.uuid = uuid.replace(/-/g, '');
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Plus purchase
app.post('/api/plus/verify', async (req, res) => {
  try {
    const { userId, sessionId } = req.body;
    
    // Verify with Stripe
    const stripe = require('stripe')(STRIPE_SECRET);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== 'paid') {
      return res.json({ error: 'Payment not completed' });
    }
    
    // Calculate expiry (example: 30 days)
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    // Store in database (implement your storage)
    await storePlusSubscription(userId, expiresAt, session);
    
    res.json({
      success: true,
      expiresAt,
      message: 'Plus activated!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Backend running on port 3000'));
```

### Python / Flask

```python
from flask import Flask, jsonify, request
import requests
import os
from datetime import datetime, timedelta

app = Flask(__name__)

HYPIXEL_KEY = os.getenv('HYPIXEL_KEY')
STRIPE_SECRET = os.getenv('STRIPE_SECRET_KEY')

@app.route('/ping')
def ping():
    return jsonify({
        'success': True,
        'cache_player': 300000
    })

@app.route('/api/player/<name>')
def get_player(name):
    try:
        # Get UUID
        mojang_res = requests.get(
            f'https://api.mojang.com/users/profiles/minecraft/{name}'
        )
        if not mojang_res.ok:
            return jsonify({
                'name': name,
                'level': 0,
                'fkdr': 0,
                'unresolved': True
            })
        
        uuid = mojang_res.json()['id']
        
        # Get Hypixel data
        hypixel_res = requests.get(
            f'https://api.hypixel.net/v2/player?uuid={uuid}',
            headers={'API-Key': HYPIXEL_KEY}
        )
        player = hypixel_res.json()['player']
        
        # Process stats
        stats = process_bedwars_stats(player, name)
        stats['uuid'] = uuid.replace('-', '')
        
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/plus/verify', methods=['POST'])
def verify_plus():
    try:
        data = request.json
        user_id = data['userId']
        session_id = data['sessionId']
        
        # Verify with Stripe
        import stripe
        stripe.api_key = STRIPE_SECRET
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status != 'paid':
            return jsonify({'error': 'Payment not completed'})
        
        # Calculate expiry
        expires_at = int((datetime.now() + timedelta(days=30)).timestamp() * 1000)
        
        # Store subscription (implement your storage)
        store_plus_subscription(user_id, expires_at, session)
        
        return jsonify({
            'success': True,
            'expiresAt': expires_at,
            'message': 'Plus activated!'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=3000)
```

## Deployment Options

### Option 1: Cloud Functions (Firebase, AWS Lambda, Vercel)

Best for: Simple deployments with automatic scaling

```bash
# Example: Vercel deployment
npm install -g vercel
vercel deploy
```

### Option 2: Traditional Server (DigitalOcean, Heroku, Railway)

Best for: More control, persistent connections

```bash
# Example: Railway deployment
npm install -g railway
railway login
railway init
railway up
```

### Option 3: Container (Docker)

Best for: Consistent environments, easy scaling

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## Security Best Practices

1. **Never expose secrets in the client**
   - Keep all API keys server-side
   - Use environment variables
   - Don't log sensitive data

2. **Rate Limiting**
   - Implement per-IP rate limits
   - Add request throttling
   - Use caching to reduce API calls

3. **Input Validation**
   - Sanitize username inputs
   - Validate all request parameters
   - Use proper error handling

4. **CORS Configuration**
   - Only allow requests from your app
   - Use proper CORS headers
   - Consider API authentication

5. **Monitoring**
   - Log all requests
   - Monitor API usage
   - Set up alerts for errors

## Testing

Test your backend with these curl commands:

```bash
# Health check
curl https://your-backend.example.com/ping

# Get player stats
curl https://your-backend.example.com/api/player/Technoblade

# Verify plus (requires valid session ID)
curl -X POST https://your-backend.example.com/api/plus/verify \
  -H "Content-Type: application/json" \
  -d '{"userId":"123","sessionId":"cs_test_..."}'
```

## Questions?

If you need help setting up the backend or have questions about the API specification, please open an issue on GitHub.
