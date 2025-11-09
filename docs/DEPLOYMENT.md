# Nebula - Quick Start Guide for Developers

This guide will help you get Nebula running for public distribution.

## Two Deployment Strategies

### Strategy A: Backend Service (Recommended)

**Best for:** Public distribution where users don't need API keys

**Pros:**
- Users download and run - no setup required
- Your API keys stay secure on the server
- Centralized rate limiting and caching
- Easy to add premium features

**Cons:**
- Requires setting up a backend server
- Server costs (though minimal with serverless options)

**Setup Steps:**

1. **Create a backend server** following the [Backend API Spec](./BACKEND_SPEC.md)

2. **Deploy to a hosting service:**
   - Vercel (Free tier available) - Easiest
   - Railway (Free tier available)
   - DigitalOcean ($5/month)
   - AWS Lambda (Pay per use)
   - Firebase Functions (Free tier available)

3. **Configure environment variables on your server:**
   ```
   HYPIXEL_KEY=your_hypixel_api_key
   STRIPE_SECRET_KEY=your_stripe_key (optional)
   FIREBASE_ADMIN_SDK=your_firebase_credentials (optional)
   ```

4. **Build Nebula with backend URL:**
   ```bash
   # Create .env for building
   echo "BACKEND_API_URL=https://your-backend.example.com" > .env
   
   # Build the distributable
   npm run dist
   ```

5. **Distribute the installer:**
   - Upload to GitHub Releases
   - Share the download link
   - Users download and run - no configuration needed!

---

### Strategy B: Users Provide Their Own Keys

**Best for:** Developer community, power users

**Pros:**
- No backend server needed
- No server costs
- Users have full control

**Cons:**
- Users must obtain Hypixel API key
- Higher barrier to entry
- Each user hits Hypixel API directly

**Setup Steps:**

1. **Build the app without any .env:**
   ```bash
   npm run dist
   ```

2. **Create setup instructions for users:**
   ```markdown
   # Nebula Setup
   
   1. Download and install Nebula
   2. Get a Hypixel API key:
      - Join hypixel.net
      - Run command: /api new
      - Copy the key that appears
   3. Create a file named `.env` in the Nebula installation folder
   4. Add this line: HYPIXEL_KEY=your_key_here
   5. Restart Nebula
   ```

3. **Distribute with clear instructions**

---

## Recommended: Strategy A with Free Backend

Here's the easiest free setup:

### Option 1: Vercel (Recommended)

1. **Create a simple API:**

```javascript
// api/ping.js
export default function handler(req, res) {
  res.json({ success: true, cache_player: 300000 });
}

// api/player/[name].js
const fetch = require('node-fetch');

export default async function handler(req, res) {
  const { name } = req.query;
  const HYPIXEL_KEY = process.env.HYPIXEL_KEY;
  
  try {
    // Get UUID
    const mojangRes = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${name}`
    );
    if (!mojangRes.ok) {
      return res.json({ name, level: 0, unresolved: true });
    }
    const { id: uuid } = await mojangRes.json();
    
    // Get stats
    const hypixelRes = await fetch(
      `https://api.hypixel.net/v2/player?uuid=${uuid}`,
      { headers: { 'API-Key': HYPIXEL_KEY } }
    );
    const { player } = await hypixelRes.json();
    
    // Process and return (implement processBedwarsStats)
    const stats = processBedwarsStats(player, name);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

2. **Deploy to Vercel:**

```bash
npm install -g vercel
vercel login
vercel
```

3. **Set environment variables:**
```bash
vercel env add HYPIXEL_KEY production
```

4. **Get your backend URL:**
```
https://your-project.vercel.app
```

5. **Build Nebula:**
```bash
echo "BACKEND_API_URL=https://your-project.vercel.app" > .env
npm run dist
```

**Cost:** FREE for most usage levels

---

### Option 2: Railway

1. **Create a Node.js server** (see BACKEND_SPEC.md)

2. **Deploy:**
```bash
npm install -g railway
railway login
railway init
railway up
```

3. **Add environment variables in Railway dashboard:**
   - HYPIXEL_KEY
   - (Optional) STRIPE_SECRET_KEY

4. **Get your Railway URL and build Nebula**

**Cost:** $5/month after free tier

---

## Building for Distribution

### Local Build

```bash
# Install dependencies
npm install

# Create .env (if using backend)
echo "BACKEND_API_URL=https://your-backend.com" > .env

# Build distributable
npm run dist
```

Output: `release/` folder contains installers

### GitHub Actions (Recommended)

1. **Add secrets to GitHub repository:**
   - Settings → Secrets → Actions
   - Add `BACKEND_API_URL` (optional)

2. **Create tag and push:**
```bash
git tag v1.0.0
git push --tags
```

3. **GitHub Actions automatically:**
   - Builds the installer
   - Creates a release
   - Uploads installers

4. **Users download from Releases page**

---

## Configuration Summary

### Minimal (No Backend, No Keys)
```bash
# .env file - empty or doesn't exist
# App will show "No API configured" message
npm run dist
```

### With Backend Only
```bash
# .env file
BACKEND_API_URL=https://your-backend.vercel.app

npm run dist
```

### Full Developer Setup
```bash
# .env file
HYPIXEL_KEY=your_key
DISCORD_CLIENT_ID=your_id
FIREBASE_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project
# ... other Firebase configs

npm run dist
```

---

## Testing Your Build

1. **Test without .env:**
   ```bash
   # Delete .env if it exists
   rm .env
   
   # Run the app
   npm run start
   ```
   Expected: App runs but shows "No API configured" when loading stats

2. **Test with backend:**
   ```bash
   # Create .env with backend URL
   echo "BACKEND_API_URL=https://your-backend.com" > .env
   
   # Run the app
   npm run start
   ```
   Expected: Stats load successfully from backend

3. **Test the distributable:**
   ```bash
   # Build
   npm run dist
   
   # Install the generated installer from release/
   # Run the installed app
   # Join Hypixel and test stats loading
   ```

---

## Troubleshooting

### Users get "No API configured" error

**Solution 1:** Set up a backend and build with `BACKEND_API_URL`

**Solution 2:** Provide instructions for users to add their own `HYPIXEL_KEY`

### Backend returns errors

- Check backend logs
- Verify `HYPIXEL_KEY` is set on backend
- Test backend endpoints with curl
- Check rate limits on Hypixel API

### App doesn't auto-update

- Ensure you're testing a packaged build (not `npm run start`)
- Check GitHub releases exist
- Verify `package.json` has correct `repository` URL
- Auto-update only works in production builds

---

## Next Steps

1. Choose deployment strategy (A or B)
2. Set up backend (if using Strategy A)
3. Build and test locally
4. Create GitHub release
5. Share with users!

## Support

- [Backend API Specification](./BACKEND_SPEC.md)
- [GitHub Issues](https://github.com/JonasLmbt/Nebula/issues)
- [Main README](../README.md)
