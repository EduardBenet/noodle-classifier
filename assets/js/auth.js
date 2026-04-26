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
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');

  if (user) {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';

    document.getElementById('user-avatar').src = user.avatar;
    document.getElementById('user-greeting').textContent = `Hi, ${user.name}!`;
    document.getElementById('profile-avatar-large').src = user.avatar;
    document.getElementById('welcome-msg').textContent = `Welcome, ${user.name}!`;

    document.getElementById('user-avatar').addEventListener('click', () => {
      loadProfileStats();
      document.getElementById('profile-overlay').classList.add('visible');
    });

    document.getElementById('profile-close').addEventListener('click', () => {
      document.getElementById('profile-overlay').classList.remove('visible');
    });

    document.getElementById('profile-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('profile-overlay'))
        document.getElementById('profile-overlay').classList.remove('visible');
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    });

    if (user.isOwner) {
      // Remove the hiding class so each element reverts to its own natural display
      document.querySelectorAll('.owner-only').forEach(el => el.classList.remove('owner-only'));
    }
  }
}

document.addEventListener('DOMContentLoaded', initAuth);
