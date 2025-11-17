console.log("Renderer loaded!");
const loginBtn = document.getElementById("discordLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const usernameEl = document.getElementById("profileUsername");
const avatarEl = document.getElementById("profileAvatar");
const statusEl = document.getElementById("profileStatus");

// ------------------------------
// LOGIN BUTTON
// ------------------------------
loginBtn.addEventListener("click", () => {
  // Opens Discord OAuth page via backend
  window.electronAPI.loginWithDiscord();
});

// ------------------------------
// LOGOUT BUTTON
// ------------------------------
logoutBtn.addEventListener("click", async () => {
  await fetch("https://nebula-overlay.online/api/auth/logout", {
    method: "POST",
    credentials: "include"
  });

  updateUI(null);
});

// ------------------------------
// FETCH CURRENT USER
// ------------------------------
async function getUser() {
  try {
    const res = await fetch("https://nebula-overlay.online/api/auth/me", {
      credentials: "include"
    });

    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

// ------------------------------
// UPDATE UI
// ------------------------------
function updateUI(user) {
  if (!user) {
    usernameEl.textContent = "Not logged in";
    avatarEl.innerHTML = "";
    avatarEl.classList.add("empty");

    statusEl.classList.remove("online");
    statusEl.classList.add("offline");
    statusEl.innerHTML = `
      <span class="status-dot"></span>
      <span>Local account only</span>`;

    loginBtn.style.display = "flex";
    logoutBtn.style.display = "none";
    return;
  }

  usernameEl.textContent = user.username;

  // Avatar
  avatarEl.classList.remove("empty");
  avatarEl.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" />`;

  statusEl.classList.remove("offline");
  statusEl.classList.add("online");
  statusEl.innerHTML = `
    <span class="status-dot"></span>
    <span>Logged in</span>
  `;

  loginBtn.style.display = "none";
  logoutBtn.style.display = "flex";
}

// ------------------------------
// Poll for login every 2s
// (since the browser login happens externally)
// ------------------------------
async function pollLogin() {
  const user = await getUser();
  updateUI(user);
  setTimeout(pollLogin, 2000);
}

// Start checking immediately
pollLogin();
