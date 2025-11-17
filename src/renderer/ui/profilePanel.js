// renderer/ui/profilePanel.js

import { state } from "../core/state.js";
import { checkFirebase, syncUserSettings } from "../ipc/cloudSync.js";
import { accountMetrics } from "../core/metrics.js";
import { showNotification } from "./notifications.js";

function getApi() {
  const api = window.electronAPI;
  if (!api || typeof api.invoke !== "function") {
    console.warn("[UI] electronAPI.invoke not available");
  }
  return api;
}

// ------------------------------------------------------
// Auth state (backed by state + localStorage)
// ------------------------------------------------------

let userProfile =
  state.userProfile || JSON.parse(localStorage.getItem("userProfile") || "null");
let authTokens =
  state.authTokens || JSON.parse(localStorage.getItem("authTokens") || "null");

let firebaseInitialized = false;

function setAuthState(profile, tokens) {
  userProfile = profile || null;
  authTokens = tokens || null;

  state.userProfile = userProfile;
  state.authTokens = authTokens;

  if (profile) {
    localStorage.setItem("userProfile", JSON.stringify(profile));
  } else {
    localStorage.removeItem("userProfile");
  }

  if (tokens) {
    localStorage.setItem("authTokens", JSON.stringify(tokens));
  } else {
    localStorage.removeItem("authTokens");
  }

  if (!tokens) {
    localStorage.removeItem("authTimestamp");
  }

  updateProfileUI();
}

/**
 * Kann von außen (z. B. auth.js) aufgerufen werden, wenn sich der Login-Status ändert.
 */
export function onAuthChanged(profile, tokens) {
  setAuthState(profile, tokens);
}

// ------------------------------------------------------
// UI: Profil / Sync / Plus / Stats
// ------------------------------------------------------

export function updateProfileUI() {
  const avatar = document.getElementById("profileAvatar");
  const username = document.getElementById("profileUsername");
  const status = document.getElementById("profileStatus");
  const loginBtn = document.getElementById("discordLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const syncStatus = document.getElementById("syncStatus");
  const syncTime = document.getElementById("syncTime");
  const syncNowBtn = document.getElementById("syncNowBtn");
  const accountStatsCard = document.getElementById("accountStatsCard");

  if (userProfile && authTokens) {
    // Logged in
    if (avatar) {
      avatar.classList.remove("empty");
      if (userProfile.avatar) {
        avatar.innerHTML = `<img src="${userProfile.avatar}" alt="${userProfile.username}" />`;
      } else {
        const initial = userProfile.username?.[0]?.toUpperCase() || "?";
        avatar.innerHTML = `<div style="font-size:36px;font-weight:700">${initial}</div>`;
      }
    }
    if (username) username.textContent = userProfile.tag || userProfile.username || "";
    if (status) {
      status.classList.remove("offline");
      status.innerHTML =
        '<span class="status-dot"></span><span>Connected via Discord</span>';
    }
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "flex";
    if (syncStatus) syncStatus.textContent = "Ready to sync";
    if (syncTime) {
      const lastSync = localStorage.getItem("lastSyncTime");
      syncTime.textContent = lastSync
        ? `Last synced: ${new Date(Number(lastSync)).toLocaleString()}`
        : "Never synced - click Sync Now to upload your settings";
    }
    if (syncNowBtn) syncNowBtn.disabled = false;
    if (accountStatsCard) {
      accountStatsCard.style.display = "block";
      updateAccountStats();
    }
  } else {
    // Logged out
    if (avatar) {
      avatar.classList.add("empty");
      avatar.innerHTML = "";
    }
    if (username) username.textContent = "Not logged in";
    if (status) {
      status.classList.add("offline");
      status.innerHTML =
        '<span class="status-dot"></span><span>Local account only</span>';
    }
    if (loginBtn) loginBtn.style.display = "flex";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (syncStatus) syncStatus.textContent = "Not available";
    if (syncTime)
      syncTime.textContent = "Login with Discord to enable cloud sync";
    if (syncNowBtn) syncNowBtn.disabled = true;
    if (accountStatsCard) {
      accountStatsCard.style.display = "block";
      updateAccountStats(); // lokale Metrics
    }
  }

  updatePlusStatus();
}

// Plus-Status UI
export async function updatePlusStatus() {
  const api = getApi();
  const plusStatusText = document.getElementById("plusStatusText");
  const upgradePlusBtn = document.getElementById("upgradePlusBtn");

  if (!plusStatusText || !upgradePlusBtn) return;

  const demoPlus = localStorage.getItem("demoPlus") === "true";
  const demoStartTime = parseInt(
    localStorage.getItem("demoPlusStartTime") || "0",
    10
  );
  const now = Date.now();
  const demoTimeLeft = 10 * 60 * 1000 - (now - demoStartTime);
  const isDemoExpired = demoPlus && demoTimeLeft <= 0;

  if (userProfile && authTokens && api) {
    try {
      const plusData = await api.invoke("plus:checkStatus", userProfile.id);

      if (plusData?.isPlus) {
        const expiresDate = new Date(plusData.expiresAt).toLocaleDateString();
        const isPaidPlus = plusData.type === "paid";
        const isTestPlus = plusData.type === "test";

        if (isPaidPlus) {
          plusStatusText.innerHTML = `
            <span style="font-weight:600;font-size:14px;color:var(--accent)">✨ Plus Active</span>
            <span style="font-size:12px;color:var(--muted)">Expires: ${expiresDate}</span>
          `;
          upgradePlusBtn.textContent = "Manage";
          upgradePlusBtn.disabled = false;
        } else if (isTestPlus) {
          const hoursLeft = Math.ceil(
            (plusData.expiresAt - Date.now()) / (60 * 60 * 1000)
          );
          plusStatusText.innerHTML = `
            <span style="font-weight:600;font-size:14px;color:var(--warning)">🧪 Test Plus Active</span>
            <span style="font-size:12px;color:var(--muted)">${hoursLeft} hours left of monthly test</span>
          `;
          upgradePlusBtn.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade to Full</span>';
          upgradePlusBtn.disabled = false;
        }
        return;
      } else {
        plusStatusText.innerHTML = `
          <span style="font-weight:600;font-size:14px">Free Plan</span>
          <span style="font-size:12px;color:var(--muted)">Unlock all features with Plus</span>
        `;
        upgradePlusBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade</span>';
        upgradePlusBtn.disabled = false;
      }
    } catch (error) {
      console.error("[Plus] Status check failed:", error);
    }
  } else if (demoPlus && !isDemoExpired) {
    const minutesLeft = Math.ceil(demoTimeLeft / (60 * 1000));
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px;color:var(--accent)">✨ Demo Plus</span>
      <span style="font-size:12px;color:var(--muted)">${minutesLeft} minutes left - Get unlimited access</span>
    `;
    upgradePlusBtn.innerHTML =
      '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Upgrade Now</span>';
    upgradePlusBtn.disabled = false;
  } else if (isDemoExpired) {
    localStorage.removeItem("demoPlus");
    localStorage.removeItem("demoPlusStartTime");
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px">Demo Expired</span>
      <span style="font-size:12px;color:var(--muted)">Try again or upgrade to Plus</span>
    `;
    upgradePlusBtn.innerHTML =
      '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Try Again</span>';
    upgradePlusBtn.disabled = false;
  } else {
    plusStatusText.innerHTML = `
      <span style="font-weight:600;font-size:14px">Free Plan</span>
      <span style="font-size:12px;color:var(--muted)">Try Plus (Demo Mode)</span>
    `;
    upgradePlusBtn.innerHTML =
      '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Try Demo</span>';
    upgradePlusBtn.disabled = false;
  }
}

// Account-Statistiken
export async function updateAccountStats() {
  const memberSinceEl = document.getElementById("memberSince");
  const playersTrackedEl = document.getElementById("playersTracked");
  const sessionsCountEl = document.getElementById("sessionsCount");
  const totalLookupsEl = document.getElementById("totalLookups");

  if (
    !memberSinceEl ||
    !playersTrackedEl ||
    !sessionsCountEl ||
    !totalLookupsEl
  ) {
    console.warn("[Metrics] Account stats elements not found");
    return;
  }

  const api = getApi();
  let finalMetrics = { ...accountMetrics };
  let isCloudData = false;

  try {
    if (userProfile?.id && api) {
      try {
        const cloudResult = await api.invoke("metrics:get", userProfile.id);
        if (cloudResult?.success && cloudResult.data) {
          isCloudData = cloudResult.source === "cloud";
          finalMetrics = {
            memberSince:
              cloudResult.data.memberSince || accountMetrics.memberSince,
            players: new Set([
              ...accountMetrics.players,
              ...(cloudResult.data.players || []),
            ]),
            sessionsCount: Math.max(
              cloudResult.data.sessionsCount || 0,
              accountMetrics.sessionsCount
            ),
            totalLookups: Math.max(
              cloudResult.data.totalLookups || 0,
              accountMetrics.totalLookups
            ),
          };

          // ggf. lokale Daten in Cloud pushen
          if (
            accountMetrics.totalLookups >
              (cloudResult.data.totalLookups || 0) ||
            accountMetrics.players.size >
              (cloudResult.data.playersTracked || 0)
          ) {
            const updateData = {
              memberSince: Math.min(
                accountMetrics.memberSince,
                cloudResult.data.memberSince || Date.now()
              ),
              playersTracked: Math.max(
                accountMetrics.players.size,
                cloudResult.data.playersTracked || 0
              ),
              sessionsCount: Math.max(
                accountMetrics.sessionsCount,
                cloudResult.data.sessionsCount || 0
              ),
              totalLookups: Math.max(
                accountMetrics.totalLookups,
                cloudResult.data.totalLookups || 0
              ),
            };

            api
              .invoke("metrics:update", userProfile.id, updateData)
              .then((result) => {
                if (result?.success) {
                  console.log("[Metrics] Local data synced to cloud");
                }
              });
          }
        }
      } catch (error) {
        console.warn(
          "[Metrics] Cloud sync failed, using local data:",
          error
        );
      }
    }

    const memberSinceDate = new Date(finalMetrics.memberSince);
    memberSinceEl.textContent = memberSinceDate.toLocaleDateString();
    playersTrackedEl.textContent =
      finalMetrics.players.size.toLocaleString();
    sessionsCountEl.textContent =
      finalMetrics.sessionsCount.toLocaleString();
    totalLookupsEl.textContent =
      finalMetrics.totalLookups.toLocaleString();

    const title = isCloudData
      ? "Data synced from cloud"
      : "Local data only";
    [memberSinceEl, playersTrackedEl, sessionsCountEl, totalLookupsEl].forEach(
      (el) => {
        el.setAttribute("title", title);
        el.style.opacity = isCloudData ? "1" : "0.8";
      }
    );
  } catch (error) {
    console.error("[Metrics] Failed to update display:", error);
    memberSinceEl.textContent = new Date(
      accountMetrics.memberSince
    ).toLocaleDateString();
    playersTrackedEl.textContent =
      accountMetrics.players.size.toString();
    sessionsCountEl.textContent =
      accountMetrics.sessionsCount.toString();
    totalLookupsEl.textContent =
      accountMetrics.totalLookups.toString();
  }
}

export function scheduleAccountStatsUpdate() {
  const activePanel = document.querySelector(".panel.active");
  if (activePanel && activePanel.id === "panel-profile") {
    updateAccountStats();
  }
}

// ------------------------------------------------------
// Discord Login / Auth Code / Logout / Token Refresh
// ------------------------------------------------------

async function handleDiscordCallback(code) {
  const api = getApi();
  const loginBtn = document.getElementById("discordLoginBtn");
  const submitBtn = document.getElementById("submitAuthCode");
  const authCard = document.getElementById("authCodeCard");

  try {
    if (loginBtn) {
      loginBtn.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Authenticating...</span>';
    }

    const result = await api.invoke("auth:discord:exchange", code);

    if (result.error) {
      showNotification("Authentication failed: " + result.error);

      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Login";
      }
      if (authCard) authCard.style.display = "block";
      return;
    }

    const profile = result.user;
    const tokens = result.tokens;

    localStorage.setItem("authTimestamp", Date.now().toString());

    setAuthState(profile, tokens);

    showNotification(`Successfully logged in as ${profile.tag}!`);

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Complete Login";
    }
  } catch (err) {
    console.error("Discord callback handling error:", err);
    showNotification("Failed to complete Discord login");

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Complete Login";
    }
    if (authCard) authCard.style.display = "block";
  }
}

async function checkAndRefreshToken() {
  const api = getApi();
  if (!api || !authTokens || !authTokens.refreshToken) return;

  const authTimestamp = parseInt(
    localStorage.getItem("authTimestamp") || "0",
    10
  );
  const now = Date.now();
  const tokenAge = now - authTimestamp;
  const expiresIn = (authTokens.expiresIn || 604800) * 1000; // Default 7 days

  if (tokenAge > expiresIn * 0.8) {
    console.log("Refreshing Discord token...");
    const result = await api.invoke(
      "auth:discord:refresh",
      authTokens.refreshToken
    );

    if (result.success) {
      authTokens = result.tokens;
      localStorage.setItem("authTokens", JSON.stringify(authTokens));
      localStorage.setItem("authTimestamp", Date.now().toString());
      console.log("Token refreshed successfully");
    } else {
      console.error("Token refresh failed:", result.error);
    }
  }
}

// ------------------------------------------------------
// Plus / Checkout Dialoge
// ------------------------------------------------------

function showPaymentVerificationDialog() {
  const api = getApi();
  const modal = document.getElementById("notificationModal");
  const messageEl = document.getElementById("notificationMessage");

  if (!modal || !messageEl) return;

  messageEl.innerHTML = `
    <div style="text-align:left;padding:12px 0">
      <h3 style="margin:0 0 12px 0;color:var(--accent)">Payment Completed?</h3>
      <p style="margin:0 0 16px 0">Did you successfully complete your payment on Stripe?</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button id="verifyPaymentBtn" style="background:var(--accent);color:white;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:8px"><svg class="icon" aria-hidden="true" style="opacity:0.9"><use href="#i-check"/></svg>Yes, I Paid</button>
        <button id="paymentCancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Not Yet</button>
      </div>
      <p style="margin:16px 0 0 0;font-size:12px;color:var(--muted);text-align:center">
        We'll verify your payment and activate Plus automatically
      </p>
    </div>
  `;

  modal.classList.add("open");

  const closeModal = () => {
    modal.classList.remove("open");
    messageEl.innerHTML = "";
  };

  const verifyBtn = document.getElementById("verifyPaymentBtn");
  const cancelBtn = document.getElementById("paymentCancelBtn");

  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      closeModal();

      if (!userProfile) {
        showNotification("⚠️ Please login with Discord first");
        return;
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get("session_id");

        if (sessionId && api) {
          const result = await api.invoke(
            "plus:verify",
            userProfile.id,
            sessionId
          );

          if (result.error) {
            showNotification(
              "❌ Payment verification failed: " + result.error
            );
            return;
          }

          showNotification(
            "🎉 Plus activated successfully! Welcome to Nebula Plus!"
          );
          updatePlusStatus();
        } else {
          showNotification(
            "Checking payment status... Plus will activate automatically once confirmed."
          );
        }
      } catch (err) {
        showNotification(
          "❌ Verification error: " + (err.message || String(err))
        );
      }
    };
  }
}

function showPlusVerificationDialog() {
  const api = getApi();
  const modal = document.getElementById("notificationModal");
  const messageEl = document.getElementById("notificationMessage");

  if (!modal || !messageEl) return;

  if (userProfile && authTokens) {
    // Logged in → richtige Pläne zeigen
    messageEl.innerHTML = `
      <div style="text-align:left;padding:12px 0">
        <h3 style="margin:0 0 12px 0;color:var(--accent)">Upgrade to Nebula Plus</h3>
        <p style="margin:0 0 20px 0">Choose your plan and unlock all Plus features:</p>
        <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
          <button id="monthlyPlanBtn" style="background:var(--surface2);color:var(--text);border:2px solid var(--border);padding:16px 24px;border-radius:12px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;min-width:140px">
            💳 Monthly<br>
            <span style="font-size:18px;font-weight:700;color:var(--accent)">€1.99</span><br>
            <small style="opacity:0.7">per month</small>
          </button>
          <button id="yearlyPlanBtn" style="background:linear-gradient(135deg,#20B2AA,#17A2B8);color:white;border:2px solid #20B2AA;padding:16px 24px;border-radius:12px;cursor:pointer;font-weight:500;font-size:14px;transition:all 0.2s ease;min-width:140px;position:relative;box-shadow:0 4px 12px rgba(32,178,170,0.3)">
            <div style="position:absolute;top:-8px;right:-8px;background:#FF6B35;color:white;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">-16%</div>
            💎 Yearly<br>
            <span style="font-size:18px;font-weight:700">€19.99</span><br>
            <small style="opacity:0.9">save €4/year</small>
          </button>
        </div>
        <div style="text-align:center;margin-top:16px">
          <button id="cancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Cancel</button>
        </div>
        <p style="margin:16px 0 0 0;font-size:12px;color:var(--muted);text-align:center">
          🔐 Secure payment via Stripe • Cancel anytime
        </p>
      </div>
    `;
  } else {
    // Nicht eingeloggt → Demo/Login Optionen
    messageEl.innerHTML = `
      <div style="text-align:left;padding:12px 0">
        <h3 style="margin:0 0 12px 0;color:var(--accent)">Try Nebula Plus</h3>
        <p style="margin:0 0 16px 0">Login with Discord for more options, or try a quick demo:</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="loginForTrialBtn" style="background:var(--accent);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500">🔐 Login for 7-Day Trial</button>
          <button id="quickDemoBtn" style="background:var(--surface2);color:var(--text);border:none;padding:8px 16px;border-radius:6px;cursor:pointer">⚡ 10-Min Demo</button>
          <button id="cancelBtn" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer">Cancel</button>
        </div>
      </div>
    `;
  }

  modal.classList.add("open");

  const closeModal = () => {
    modal.classList.remove("open");
    messageEl.innerHTML = "";
  };

  const cancelBtn = document.getElementById("cancelBtn");
  if (cancelBtn) cancelBtn.onclick = closeModal;

  const monthlyPlanBtn = document.getElementById("monthlyPlanBtn");
  if (monthlyPlanBtn && api && userProfile) {
    monthlyPlanBtn.onclick = async () => {
      closeModal();
      try {
        const result = await api.invoke("plus:createCheckout", userProfile.id, {
          plan: "monthly",
        });
        if (result.error) {
          showNotification("❌ " + result.error);
          return;
        }
        showNotification("💳 Opening monthly payment (€1.99/month)...");
        setTimeout(() => showPaymentVerificationDialog(), 3000);
      } catch (err) {
        showNotification("❌ Error: " + (err.message || String(err)));
      }
    };
  }

  const yearlyPlanBtn = document.getElementById("yearlyPlanBtn");
  if (yearlyPlanBtn && api && userProfile) {
    yearlyPlanBtn.onclick = async () => {
      closeModal();
      try {
        const result = await api.invoke("plus:createCheckout", userProfile.id, {
          plan: "yearly",
        });
        if (result.error) {
          showNotification("❌ " + result.error);
          return;
        }
        showNotification(
          "💎 Opening yearly payment (€19.99/year - save 16%)..."
        );
        setTimeout(() => showPaymentVerificationDialog(), 3000);
      } catch (err) {
        showNotification("❌ Error: " + (err.message || String(err)));
      }
    };
  }

  const loginForTrialBtn = document.getElementById("loginForTrialBtn");
  if (loginForTrialBtn) {
    loginForTrialBtn.onclick = () => {
      closeModal();
      showNotification(
        "Please login with Discord first to start your 7-day trial!"
      );
      const section = document.getElementById("discordSection");
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  const quickDemoBtn = document.getElementById("quickDemoBtn");
  if (quickDemoBtn) {
    quickDemoBtn.onclick = () => {
      closeModal();
      const existingDemo = localStorage.getItem("demoPlus") === "true";
      const demoStartTime = parseInt(
        localStorage.getItem("demoPlusStartTime") || "0",
        10
      );
      const now = Date.now();
      const timeSinceDemo = now - demoStartTime;

      if (!existingDemo || timeSinceDemo > 24 * 60 * 60 * 1000) {
        localStorage.setItem("demoPlus", "true");
        localStorage.setItem("demoPlusStartTime", String(now));
        showNotification(
          "⚡ 10-minute Quick Demo activated! Try Nebula Plus features now."
        );
        updatePlusStatus();
      } else {
        showNotification(
          "⏰ Demo already used today. Login for 7-day trial or wait 24h!"
        );
      }
    };
  }
}

// ------------------------------------------------------
// Init: alle Listener binden & Auto-Sync starten
// ------------------------------------------------------

export function initProfilePanel() {
  updateProfileUI();

  const api = getApi();

  // Discord Login Handler
  const discordLoginBtn = document.getElementById("discordLoginBtn");
  if (discordLoginBtn && api) {
    discordLoginBtn.addEventListener("click", async () => {
      try {
        discordLoginBtn.disabled = true;
        discordLoginBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Opening Discord...</span>';

        const result = await api.invoke("auth:discord:login");

        if (result?.error) {
          showNotification(result.error);
          discordLoginBtn.disabled = false;
          discordLoginBtn.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
          return;
        }

        const authCodeCard = document.getElementById("authCodeCard");
        if (authCodeCard) {
          authCodeCard.style.display = "block";
          authCodeCard.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          setTimeout(() => {
            const input = document.getElementById("authCodeInput");
            if (input) input.focus();
          }, 500);
        }

        discordLoginBtn.disabled = false;
        discordLoginBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Waiting for authorization...</span>';
      } catch (err) {
        console.error("Discord login error:", err);
        showNotification("Failed to initiate Discord login");
        discordLoginBtn.disabled = false;
        discordLoginBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
      }
    });
  }

  // Logout Handler
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (
        confirm(
          "Are you sure you want to logout? Your local settings will remain, but cloud sync will be disabled."
        )
      ) {
        setAuthState(null, null);
        localStorage.removeItem("lastSyncTime");
        showNotification("Logged out successfully");
      }
    });
  }

  // Auth Code Submit / Cancel
  const submitAuthCodeBtn = document.getElementById("submitAuthCode");
  const authCodeInput = document.getElementById("authCodeInput");
  const cancelAuthCodeBtn = document.getElementById("cancelAuthCode");
  const authCodeCard = document.getElementById("authCodeCard");

  if (submitAuthCodeBtn && authCodeInput) {
    submitAuthCodeBtn.addEventListener("click", () => {
      let input = authCodeInput.value.trim();
      if (!input) {
        showNotification("Please paste the redirect URL");
        return;
      }

      let code = input;

      if (code.includes("?code=")) {
        const urlParams = new URLSearchParams(code.split("?")[1]);
        code = urlParams.get("code") || code;
      } else if (code.includes("&code=")) {
        const urlParams = new URLSearchParams(code.split("?")[1] || code);
        code = urlParams.get("code") || code;
      }

      if (code && code.length > 10) {
        submitAuthCodeBtn.disabled = true;
        submitAuthCodeBtn.textContent = "Authenticating...";
        handleDiscordCallback(code);

        if (authCodeCard) authCodeCard.style.display = "none";
        authCodeInput.value = "";
      } else {
        showNotification("Invalid code or URL. Please check and try again.");
      }
    });

    authCodeInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        submitAuthCodeBtn.click();
      }
    });
  }

  if (cancelAuthCodeBtn && authCodeCard) {
    cancelAuthCodeBtn.addEventListener("click", () => {
      authCodeCard.style.display = "none";
      if (authCodeInput) authCodeInput.value = "";
      if (discordLoginBtn) {
        discordLoginBtn.disabled = false;
        discordLoginBtn.innerHTML =
          '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span>Login with Discord</span>';
      }
    });
  }

  // Sync Now Handler (Firebase Cloud Sync)
  const syncNowBtn = document.getElementById("syncNowBtn");
  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      if (!userProfile) {
        showNotification("Please login with Discord first");
        return;
      }

      if (!firebaseInitialized) {
        showNotification(
          "Firebase not configured. Please check your .env settings."
        );
        return;
      }

      try {
        syncNowBtn.disabled = true;
        syncNowBtn.textContent = "Syncing...";

        await syncUserSettings(userProfile.id, "auto");

        updateProfileUI();

        showNotification("Settings synced successfully!");
      } catch (err) {
        console.error("Sync error:", err);
        showNotification("Sync failed: " + (err.message || String(err)));
      } finally {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = "Sync Now";
      }
    });
  }

  // Plus Upgrade Handler
  const upgradePlusBtn = document.getElementById("upgradePlusBtn");
  if (upgradePlusBtn) {
    upgradePlusBtn.addEventListener("click", async () => {
      if (upgradePlusBtn.textContent === "Reset Demo") {
        localStorage.removeItem("demoPlus");
        showNotification("Demo Plus reset");
        updatePlusStatus();
        return;
      }

      if (!userProfile) {
        showNotification(
          "🎉 Demo Plus activated! Try all Plus features this session."
        );
        localStorage.setItem("demoPlus", "true");
        updatePlusStatus();
        return;
      }

      showPlusVerificationDialog();
    });
  }

  // Auto-Update Stats, wenn auf Profil-Panel gewechselt wird
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (
      target &&
      target.closest &&
      target.closest('[data-panel-target="profile"]')
    ) {
      scheduleAccountStatsUpdate();
    }
  });

  // Initialisierung: Firebase & Token-Refresh & Auto-Sync
  (async () => {
    const ready = await checkFirebase();
    firebaseInitialized = ready;
    updateProfileUI();
    await checkAndRefreshToken();

    if (ready) {
      setInterval(async () => {
        if (userProfile && firebaseInitialized) {
          try {
            console.log("[Firebase] Auto-sync check...");
            await syncUserSettings(userProfile.id, "auto");
          } catch (error) {
            console.warn("[Firebase] Auto-sync failed:", error);
          }
        }
      }, 5 * 60 * 1000);
    }
  })();
}
