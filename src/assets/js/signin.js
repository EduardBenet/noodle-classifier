// Public landing for the 401 override. Gated routes used to redirect straight
// to /.auth/login/aad, which picked one of the two providers on the visitor's
// behalf — and on a phone holding a live Microsoft session that redirect
// completed silently, landing them on the page signed in as an identity they
// never chose. This page makes the choice explicit instead.

// `?to=` decides where login returns. It ends up in a redirect, so it has to be
// a path on this site and nothing else: a value like `//evil.example` or
// `https://evil.example` is protocol-relative or absolute and would send the
// visitor off-site after a login they trusted us with.
function safeTarget() {
  const raw = new URLSearchParams(location.search).get('to');
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  // Backslashes are normalised to forward slashes by some browsers, so `/\evil`
  // can end up protocol-relative after all.
  if (raw.includes('\\')) return null;
  return raw;
}

document.addEventListener('DOMContentLoaded', async () => {
  const target = safeTarget() ?? '/';
  const query = `?post_login_redirect_uri=${encodeURIComponent(target)}`;

  document.getElementById('signin-github').href = `/.auth/login/github${query}`;
  document.getElementById('signin-aad').href = `/.auth/login/aad${query}`;
  document.getElementById('signin-continue').href = target;

  // authReady is defined by auth.js, which base.html loads after the page
  // scripts — by the time this handler runs it exists, and it resolves once
  // /.auth/me has been checked.
  const user = await (window.authReady ?? Promise.resolve(null));
  if (!user) return;

  document.getElementById('signin-heading').textContent = 'Already signed in';
  document.getElementById('signin-intro').hidden = true;
  document.getElementById('signin-choices').hidden = true;
  document.getElementById('signin-user').textContent = user.userDetails || user.userId;
  document.getElementById('signin-already').hidden = false;
});
