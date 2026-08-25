// Public landing for the 401 override. Gated routes used to redirect straight
// to /.auth/login/aad, which picked one of the two providers on the visitor's
// behalf — and on a phone holding a live Microsoft session that redirect
// completed silently, landing them on the page signed in as an identity they
// never chose. This page makes the choice explicit instead.

// Login always returns to the home page. The only route to this page is the
// 401 responseOverride in staticwebapp.config.json, which is a static redirect
// that does not carry the URL the visitor was refused — and nothing else in the
// site links here, so a `?to=` parameter that was read and validated here could
// never actually be set. If return-to-page is wanted later, the way in is to
// link here as `signin.html?to=<path>` from the client and validate that the
// value starts with a single `/` — rejecting `//host` and backslashes, which
// some browsers normalise into a protocol-relative URL.
const LOGIN_TARGET = '/';

document.addEventListener('DOMContentLoaded', async () => {
  const target = LOGIN_TARGET;
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
