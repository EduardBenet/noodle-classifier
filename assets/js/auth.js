window.addEventListener("DOMContentLoaded", async () => {
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
      const displayName = user.userDetails || user.userId;
      usernameEl.textContent = displayName;
      loginSection.hidden = true;
      userSection.hidden = false;

      btn.innerHTML = `<span class="auth-avatar" aria-hidden="true">${displayName.charAt(0).toUpperCase()}</span>`;
      btn.title = displayName;
      btn.setAttribute("aria-label", "Account menu");

      document.getElementById("list-tab-btn").hidden = false;
      document.getElementById("add-tab-btn").hidden = false;
      document.getElementById("overlay-edit").hidden = false;
    }
  } catch {
    // not authenticated or endpoint unavailable — stay in logged-out state
  }
});
