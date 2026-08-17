// Resolves once /.auth/me has been checked, so anything that depends on
// window.currentUser can wait rather than race the fetch.
let markAuthReady;
window.authReady = new Promise(resolve => { markAuthReady = resolve; });

window.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("auth-btn");
  const menu = document.getElementById("auth-menu");
  const loginSection = document.getElementById("auth-menu-login");
  const userSection = document.getElementById("auth-menu-user");
  const usernameEl = document.getElementById("auth-username");

  const navBtn = document.getElementById("nav-btn");
  const navDropdown = document.getElementById("nav-dropdown");

  navBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navDropdown.hidden = !navDropdown.hidden;
    menu.hidden = true;
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    navDropdown.hidden = true;
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !document.getElementById("auth-widget").contains(e.target)) {
      menu.hidden = true;
    }
    if (!navDropdown.hidden && !document.getElementById("nav-menu").contains(e.target)) {
      navDropdown.hidden = true;
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

      const isOwner = user.userRoles?.includes('owner');
      window.currentUser = { userId: user.userId, userDetails: user.userDetails, isOwner };

      document.getElementById("nav-mylist")?.removeAttribute("hidden");

      const navAdd = document.getElementById("nav-add");
      if (navAdd) {
        navAdd.href = isOwner ? 'add.html' : 'submit.html';
        navAdd.textContent = isOwner ? 'Add' : 'Suggest';
        navAdd.removeAttribute("hidden");
      }
      if (isOwner) document.getElementById("overlay-edit")?.removeAttribute("hidden");
    }
  } catch {
    // not authenticated or endpoint unavailable — stay in logged-out state
  } finally {
    markAuthReady(window.currentUser ?? null);
  }
});
