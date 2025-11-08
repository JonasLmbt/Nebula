# Discord OAuth2 Setup Guide

This guide explains how to set up Discord authentication for Nebula's Profile & Cloud Sync features.

## Prerequisites

- A Discord account
- Access to Discord Developer Portal

## Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Enter a name (e.g., "Nebula Stats Overlay")
4. Click **"Create"**

## Step 2: Get OAuth2 Credentials

1. In your application, go to **OAuth2** → **General**
2. Copy your **Client ID**
3. Click **"Reset Secret"** to generate a new **Client Secret**
4. Copy the **Client Secret** (you won't be able to see it again!)

## Step 3: Configure Redirect URI

1. Still in **OAuth2** → **General**
2. Under **"Redirects"**, click **"Add Redirect"**
3. Add: `http://localhost:3000/auth/discord/callback`
   - ⚠️ If you're using a different backend URL, adjust accordingly
4. Click **"Save Changes"**

## Step 4: Add to .env File

1. Copy `.env.example` to `.env` (if you haven't already)
2. Add your credentials:

```env
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```

## Step 5: Backend Setup (Future)

⚠️ **Current Status**: The Discord OAuth flow is implemented in the app, but requires a backend server to handle the callback.

### Temporary Manual Flow

For now, the app will:
1. Open Discord authorization in your browser
2. After you authorize, Discord redirects to the callback URL
3. You manually copy the `code` parameter from the URL
4. Paste it into the app prompt

**Example redirect URL:**
```
http://localhost:3000/auth/discord/callback?code=ABC123XYZ...
```
You need to copy `ABC123XYZ...` and paste it when prompted.

### Full Backend (Coming Soon)

For automatic flow, you'll need a backend server (Node.js/Express recommended):

```javascript
// Example Express route
app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  
  // Send code to Electron app via IPC or deep link
  // For example, redirect to: nebula://auth?code=${code}
  
  res.send('Login successful! You can close this tab.');
});
```

## OAuth2 Scopes

The app requests the following Discord scopes:
- `identify` - Read basic user info (username, avatar, ID)

## Security Notes

- **Never commit** your `.env` file to git (it's in `.gitignore`)
- **Never share** your Client Secret publicly
- Keep your Discord application credentials secure
- Rotate secrets if they're ever exposed

## Troubleshooting

### "Discord Client ID not configured"
- Make sure `DISCORD_CLIENT_ID` is set in your `.env` file
- Restart the app after adding environment variables

### "Failed to exchange Discord auth code"
- Check that your Client Secret is correct
- Ensure the redirect URI in Discord settings matches exactly
- The auth code expires after ~10 minutes - try again

### Token Refresh Fails
- Tokens expire after 7 days (Discord default)
- The app automatically refreshes tokens at 80% of expiry
- If refresh fails, you'll need to login again

## Future Features (Planned)

Once a backend is deployed:
- ✅ Automatic OAuth callback handling
- ✅ Cloud sync for settings
- ✅ Premium subscription management
- ✅ Cross-device settings sync
- ✅ Account statistics tracking

---

**Need help?** Open an issue on GitHub or join our Discord community.
