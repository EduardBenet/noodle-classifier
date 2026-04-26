const TOKEN_KEY = 'noodle_auth_token';

function parseJWT(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  const token = getToken();
  if (!token) return null;
  const payload = parseJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return payload;
}

function loadProfileStats() {
  const source = (typeof allNoodles !== 'undefined' && allNoodles.length)
    ? Promise.resolve(allNoodles)
    : fetch('/api/noodles').then(r => r.json());

  source.then(noodles => {
    const rated = noodles.filter(n => n.rating > 0);
    const best = rated.reduce((a, b) => b.rating > a.rating ? b : a, rated[0] ?? null);
    document.getElementById('stat-count').textContent = rated.length;
    document.getElementById('stat-best').textContent = best ? best.name : '—';
  });
}

function initAuth() {
  // Pick up token returned by OAuth callback in URL hash
  if (location.hash.startsWith('#token=')) {
    localStorage.setItem(TOKEN_KEY, location.hash.slice(7));
    history.replaceState(null, '', location.pathname);
  }

  const user = getUser();
  const menuBtn = document.getElementById('auth-menu-btn');
  const dropdown = document.getElementById('auth-dropdown');

  // Toggle dropdown on button click
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close dropdown when clicking anywhere else
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  if (user) {
    // Swap the person icon for the GitHub avatar
    document.getElementById('auth-anon-icon').style.display = 'none';
    const avatarIcon = document.getElementById('auth-avatar-icon');
    avatarIcon.src = user.avatar;
    avatarIcon.style.display = 'block';

    // Show logged-in dropdown content, hide login link
    document.getElementById('dropdown-login').style.display = 'none';
    document.getElementById('dropdown-user').style.display = 'block';
    document.getElementById('dropdown-name').textContent = user.name;

    // Populate profile overlay
    document.getElementById('profile-avatar-large').src = user.avatar;
    document.getElementById('welcome-msg').textContent = `Welcome, ${user.name}!`;

    // My Profile
    document.getElementById('dropdown-profile').addEventListener('click', () => {
      dropdown.classList.remove('open');
      loadProfileStats();
      document.getElementById('profile-overlay').classList.add('visible');
    });

    // Close profile overlay
    document.getElementById('profile-close').addEventListener('click', () => {
      document.getElementById('profile-overlay').classList.remove('visible');
    });
    document.getElementById('profile-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('profile-overlay'))
        document.getElementById('profile-overlay').classList.remove('visible');
    });

    // Logout
    document.getElementById('dropdown-logout').addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    });

    // Unlock owner-only UI
    if (user.isOwner) {
      document.querySelectorAll('.owner-only').forEach(el => el.classList.remove('owner-only'));
    }
  }
}

document.addEventListener('DOMContentLoaded', initAuth);
