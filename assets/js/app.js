let listLoaded = false;
let overlayNoodle = null;

document.querySelectorAll(".tab-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    const target = button.getAttribute("data-tab");
    document.getElementById(`tab-${target}`).classList.add("active");
    button.classList.add("active");

    if (target === "list" && !listLoaded) {
      list();
      listLoaded = true;
    }
  });
});

document.getElementById("home-link").addEventListener("click", (e) => {
  e.preventDefault();
  showNoodleOverlay(overlayNoodle, "Noodle of the Day 🍜");
});

document.getElementById("overlay-close").addEventListener("click", hideOverlay);
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("overlay")) hideOverlay();
});

document.getElementById("overlay-edit").addEventListener("click", () => {
  hideOverlay();
  if (!overlayNoodle) return;

  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById("tab-add").classList.add("active");
  document.querySelector(".tab-btn[data-tab='add']").classList.add("active");

  document.getElementById("product-id").value = overlayNoodle.id;
  fillFormById(overlayNoodle.id);
});

function showNoodleOverlay(noodle, title = "") {
  if (!noodle) return;
  overlayNoodle = noodle;
  document.getElementById("overlay-title").textContent = title || noodle.name;
  renderList([noodle], "noodle-of-the-day");
  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  document.getElementById("overlay").classList.remove("visible");
}

async function loadNoodleOfTheDay() {
  const response = await fetch("/api/noodles");
  const items = await response.json();
  if (!items.length) return;
  const today = new Date();
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const noodle = items[daySeed % items.length];
  showNoodleOverlay(noodle, "Noodle of the Day 🍜");
}

async function initAuth() {
  const btn = document.getElementById("auth-btn");
  const menu = document.getElementById("auth-menu");
  const loginSection = document.getElementById("auth-menu-login");
  const userSection = document.getElementById("auth-menu-user");
  const usernameEl = document.getElementById("auth-username");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !document.getElementById("auth-widget").contains(e.target)) {
      menu.hidden = true;
    }
  });

  try {
    const res = await fetch("/.auth/me");
    const data = await res.json();
    const user = data.clientPrincipal;

    if (user) {
      isLoggedIn = true;
      const displayName = user.userDetails || user.userId;
      usernameEl.textContent = displayName;
      loginSection.hidden = true;
      userSection.hidden = false;

      const initial = displayName.charAt(0).toUpperCase();
      btn.innerHTML = `<span class="auth-avatar" aria-hidden="true">${initial}</span>`;
      btn.title = displayName;
      btn.setAttribute("aria-label", "Account menu");

      document.getElementById("add-tab-btn").hidden = false;
    }
  } catch {
    // not authenticated or endpoint unavailable — stay in logged-out state
  }
}

window.addEventListener("DOMContentLoaded", () => {
  list();
  listLoaded = true;
  loadNoodleOfTheDay();
  initAuth();
});
