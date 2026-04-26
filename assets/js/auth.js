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
    const avatar = document.getElementById('user-avatar');
    avatar.src = user.avatar;
    avatar.addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    });

    if (user.isOwner) {
      document.body.classList.add('is-owner');
    }
  }
}

document.addEventListener('DOMContentLoaded', initAuth);
