# Manual Testing Checklist

This document describes manual tests to verify the API key optional functionality works correctly.

## Test 1: No .env File (Clean Install Scenario)

**Scenario:** End user downloads and runs the app without any configuration.

**Setup:**
```bash
# Ensure no .env file exists
rm .env

# Build and run
npm run build
npm run start
```

**Expected Behavior:**
- ✅ App starts successfully
- ✅ No errors on startup
- ✅ Window opens normally
- ❌ Stats lookup fails with user-friendly message:
  - "No API key configured..."
  - "The app needs either a backend service or a local Hypixel API key..."
  - Includes hint about /api new for advanced users

**Test Steps:**
1. Start the app
2. Join a Hypixel Bedwars lobby
3. Use `/who` command
4. Check overlay for error message
5. Verify error message is helpful and not technical

**Pass Criteria:**
- App doesn't crash
- Error message is clear and helpful
- No console errors about missing .env

---

## Test 2: Backend URL Only (Public Distribution Scenario)

**Scenario:** App is built with backend URL for public distribution.

**Setup:**
```bash
# Create .env with only backend URL
echo "BACKEND_API_URL=https://example-backend.com" > .env

# Build and run
npm run build
npm run start
```

**Expected Behavior:**
- ✅ App starts successfully
- ✅ Attempts to connect to backend
- ❌ Falls back gracefully if backend doesn't exist
  - Shows appropriate error about backend unavailable
  - Doesn't show "add HYPIXEL_KEY" message

**Test Steps:**
1. Start the app
2. Check console for backend ping attempt
3. Use `/who` in Hypixel
4. Verify error message mentions backend, not local key

**Pass Criteria:**
- Backend connection is attempted
- Failure is graceful with backend-specific message
- No requests to Hypixel API directly

---

## Test 3: User API Key Only (Developer Mode)

**Scenario:** Developer runs with their own Hypixel API key.

**Setup:**
```bash
# Create .env with Hypixel key
echo "HYPIXEL_KEY=your-real-key-here" > .env

# Build and run
npm run build
npm run start
```

**Expected Behavior:**
- ✅ App starts successfully
- ✅ Stats load from Hypixel API
- ✅ Player data appears in overlay
- ✅ Caching works (5 min TTL)

**Test Steps:**
1. Start the app
2. Join Hypixel Bedwars lobby
3. Use `/who` command
4. Verify player stats appear
5. Check same player again (should use cache)

**Pass Criteria:**
- Stats load successfully
- Data is accurate
- Cache prevents duplicate API calls
- No backend requests made

---

## Test 4: Discord Not Configured

**Scenario:** Discord integration is not configured.

**Setup:**
```bash
# .env without Discord config
cat > .env << EOF
HYPIXEL_KEY=your-key-here
EOF

# Build and run
npm run build
npm run start
```

**Expected Behavior:**
- ✅ App starts normally
- ✅ Discord login shows as disabled/unavailable
- ❌ Discord login returns error with `featureDisabled: true`
  - "Discord login is not available in this build"
  - Helpful message for users

**Test Steps:**
1. Start app
2. Try to initiate Discord login (if accessible from UI)
3. Check response has `featureDisabled` flag
4. Verify error message is user-friendly

**Pass Criteria:**
- App works without Discord
- Feature shows as disabled, not broken
- Error messages are clear

---

## Test 5: Firebase Not Configured

**Scenario:** Firebase cloud sync is not configured.

**Setup:**
```bash
# .env without Firebase config
cat > .env << EOF
HYPIXEL_KEY=your-key-here
EOF
```

**Expected Behavior:**
- ✅ App starts normally
- ✅ Cloud sync features disabled
- ✅ Settings save locally only
- ❌ Firebase operations return `featureDisabled: true`

**Test Steps:**
1. Start app
2. Try to sync settings to cloud
3. Verify local storage still works
4. Check Firebase init returns false gracefully

**Pass Criteria:**
- App works without Firebase
- Local settings storage works
- No Firebase errors in console
- Feature gracefully disabled

---

## Test 6: Full Configuration (All Features)

**Scenario:** Developer with all services configured.

**Setup:**
```bash
# .env with everything
cat > .env << EOF
BACKEND_API_URL=https://your-backend.com
HYPIXEL_KEY=your-key-here
DISCORD_CLIENT_ID=your-discord-id
FIREBASE_API_KEY=your-firebase-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_AUTH_DOMAIN=your-domain
FIREBASE_STORAGE_BUCKET=your-bucket
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
EOF
```

**Expected Behavior:**
- ✅ All features available
- ✅ Backend used as primary source
- ✅ Fallback to user key if backend fails
- ✅ Discord login works
- ✅ Firebase sync works

**Test Steps:**
1. Verify stats load (backend preferred)
2. Try Discord login
3. Try cloud settings sync
4. Test all features

**Pass Criteria:**
- All features work
- Backend is preferred over direct API
- Fallback chain works correctly

---

## Test 7: API Router Fallback Chain

**Scenario:** Test the 3-tier fallback system.

**Setup:**
```bash
# .env with both backend and user key
cat > .env << EOF
BACKEND_API_URL=https://non-existent-backend.example.com
HYPIXEL_KEY=your-real-key-here
EOF
```

**Expected Behavior:**
- ✅ Backend is tried first
- ✅ Backend fails (doesn't exist)
- ✅ Falls back to user API key
- ✅ Stats load successfully from Hypixel

**Test Steps:**
1. Start app
2. Monitor console for backend attempt
3. Look for "Backend failed, trying fallback" message
4. Verify stats load from Hypixel API
5. Confirm success message shows user key source

**Pass Criteria:**
- Backend attempted first
- Fallback to user key works
- Stats load successfully
- Console shows fallback chain

---

## Test 8: Packaged Build Without Config

**Scenario:** Distributed installer with no configuration.

**Setup:**
```bash
# Remove .env
rm .env

# Build distributable
npm run dist

# Install the generated installer
# Run the installed app
```

**Expected Behavior:**
- ✅ Installer works
- ✅ App launches
- ✅ Graceful error about no API configured
- ❌ Stats don't load but app is usable

**Test Steps:**
1. Build installer
2. Install on clean system
3. Launch app
4. Verify error messages
5. Check app doesn't crash

**Pass Criteria:**
- Clean install works
- No crashes
- Clear error messages
- App is otherwise functional

---

## Test 9: Environment Variable Loading

**Scenario:** Verify dotenv loads correctly.

**Setup:**
```bash
# Create .env
echo "NEBULA_DEVTOOLS=1" > .env

# Run app
npm run start
```

**Expected Behavior:**
- ✅ DevTools open automatically
- ✅ Environment variables loaded
- ✅ Config accessible via process.env

**Test Steps:**
1. Start app with NEBULA_DEVTOOLS=1
2. Verify DevTools window opens
3. Check process.env in DevTools console

**Pass Criteria:**
- DevTools open when flag is set
- Environment variables accessible

---

## Test 10: Error Message Quality

**Scenario:** Verify all error messages are user-friendly.

**Setup:** Run tests 1-5 above

**Check for:**
- ✅ No technical stack traces shown to users
- ✅ Clear, actionable error messages
- ✅ Hints for how to fix issues
- ✅ Distinction between "feature disabled" vs "error"
- ✅ Appropriate error codes/flags (missingConfig, featureDisabled)

**Pass Criteria:**
- All errors have helpful messages
- No raw exceptions shown
- Users know what to do next

---

## Automated Test Script

Run this to test basic scenarios:

```bash
#!/bin/bash

echo "Test 1: No config"
rm .env
npm run build
echo "✓ Build succeeded without .env"

echo ""
echo "Test 2: Backend only"
echo "BACKEND_API_URL=https://example.com" > .env
npm run build
echo "✓ Build succeeded with backend URL"

echo ""
echo "Test 3: API key only"
echo "HYPIXEL_KEY=test-key" > .env
npm run build
echo "✓ Build succeeded with API key"

echo ""
echo "Test 4: Clean .env"
rm .env
echo "✓ Cleaned up .env"

echo ""
echo "All build tests passed!"
echo "Now manually test runtime behavior"
```

---

## Test Results

Document your test results:

| Test | Status | Notes |
|------|--------|-------|
| 1. No .env | ⬜ | |
| 2. Backend only | ⬜ | |
| 3. API key only | ⬜ | |
| 4. Discord disabled | ⬜ | |
| 5. Firebase disabled | ⬜ | |
| 6. Full config | ⬜ | |
| 7. Fallback chain | ⬜ | |
| 8. Packaged build | ⬜ | |
| 9. Env loading | ⬜ | |
| 10. Error messages | ⬜ | |

Legend: ✅ Pass | ❌ Fail | ⬜ Not tested
