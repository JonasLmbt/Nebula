console.log("Renderer loaded!");

// Load saved login on startup
const savedUser = localStorage.getItem("nebula_user");
const savedLoggedIn = localStorage.getItem("nebula_loggedin");

if (savedUser && savedLoggedIn === "true") {
    window.userProfile = JSON.parse(savedUser);
    console.log("[Auth] Restored login:", window.userProfile);
}

// -------------------------------
// DOM ELEMENTS
// -------------------------------
const loginBtn = document.getElementById("discordLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const ignEl = document.getElementById("profileUsername");
const avatarEl = document.getElementById("profileAvatar");
const statusEl = document.getElementById("profileStatus");

import { updateProfileUI } from './index.js';

// -------------------------------
// LOGIN BUTTON HANDLER
// -------------------------------
if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        console.log("[Auth] Login button clicked");
        window.electronAPI.loginWithDiscord(); 
    });
}

// -------------------------------
// LOGOUT BUTTON HANDLER
// -------------------------------
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        console.log("[Auth] Logout clicked");

        try {
            await fetch("https://nebula-overlay.online/api/auth/logout", {
                method: "POST",
                credentials: "include"
            });
        } catch (err) {
            console.error("Logout failed:", err);
        }

        updateUI(null);
    });
}

// -------------------------------
// UPDATE UI (Username + Avatar)
// -------------------------------

function updateUI(user) {
  // ---------- LOGGED OUT ----------
  if (!user) {
    // Bridge für alte Logik
    window.userProfile = null;
    localStorage.removeItem("nebula_user");
    localStorage.removeItem("nebula_loggedin");

    // Alte globale Variablen, falls definiert
    if (typeof userProfile !== "undefined") userProfile = null;
    if (typeof authTokens !== "undefined") authTokens = null;

    window.dispatchEvent(new CustomEvent("nebula:logout"));
    window.electronAPI.setUser(null);

    // UI: logged out
    if (ignEl) ignEl.textContent = "Not logged in";
    if (avatarEl) {
      avatarEl.innerHTML = "";
      avatarEl.classList.add("empty");
    }

    if (statusEl) {
      statusEl.classList.remove("online");
      statusEl.classList.add("offline");
      statusEl.innerHTML = `
        <span class="status-dot"></span>
        <span>Local account only</span>
      `;
    }

    if (loginBtn) loginBtn.style.display = "flex";
    if (logoutBtn) logoutBtn.style.display = "none";

    updateProfileUI();

    return;
  }

  // ---------- LOGGED IN ----------
  // Neues Profil-Objekt bauen
  const profile = {
    id: user.id,
    ign: user.ign,
    tag: user.ign, // optional
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : null,
    plus: user.plus ?? null,
  };

  window.userProfile = profile;
  window.electronAPI.setUser(profile);
  localStorage.setItem("nebula_user", JSON.stringify(window.userProfile));
  localStorage.setItem("nebula_loggedin", "true");

  window.dispatchEvent(new CustomEvent("nebula:login", { detail: user }));

  // UI: logged in
  if (ignEl) ignEl.textContent = user.ign;

  if (avatarEl) {
    avatarEl.classList.remove("empty");
    if (user.avatar) {
      avatarEl.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" />`;
    } else {
      avatarEl.innerHTML = `<div style="font-size:36px;font-weight:700">${user.ign[0].toUpperCase()}</div>`;
    }
  }

  if (statusEl) {
    statusEl.classList.remove("offline");
    statusEl.classList.add("online");
    statusEl.innerHTML = `
      <span class="status-dot"></span>
      <span>Connected via Discord</span>
    `;
  }

  if (loginBtn) loginBtn.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "flex";

  updateProfileUI();
}

// -------------------------------
// LOGIN POLLING LOOP
// -------------------------------
async function pollLogin() {
    try {
        const res = await fetch("https://nebula-overlay.online/api/auth/me", {
            credentials: "include"
        });

        const data = await res.json();

        updateUI(data.user || null);
    } catch (err) {
        console.error("[Auth] /api/auth/me failed:", err);
    }

    // Poll every 2 seconds
    setTimeout(pollLogin, 2000);
}


async function exportSessionsCSV(sessions) {
    const { sessionsToCSV } = require('./session/sessionAnalytics.js');
    const csv = sessionsToCSV(sessions);
    if (!csv) return;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "nebula_sessions.csv";
    link.click();

    URL.revokeObjectURL(url);
}

document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    exportSessionsCSV(sessions);
});


// Start polling immediately
pollLogin();
