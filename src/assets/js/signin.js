// Public landing for the 401 override. Gated routes used to redirect straight
// to /.auth/login/aad, which picked one of the two providers on the visitor's
// behalf — and on a phone holding a live Microsoft session that redirect
// completed silently, landing them on the page signed in as an identity they
// never chose. This page makes the choice explicit instead.
//
// NOT DEAD CODE, despite nothing in the site linking here. That is by design:
// the header's own menu (header.html) is the fast path for a normal sign-in,
// and every gated nav link is hidden until auth.js reveals it, so a signed-out
// visitor has no in-app route to a gated URL. This page exists for the one
// route that remains — a typed or bookmarked gated URL — which is exactly the
// deep link that produced the silent sign-in above. It will therefore look
// unused in normal browsing. Deleting it and repointing the 401 override at a
// provider reintroduces that bug; see PLAN.md, "Sign-In Page".
//
// It does not affect a cancelled login: both this page and the header menu link
// to an identical /.auth/login/<provider> URL, and post_login_redirect_uri
// governs only the success path. A cancel returns an error to the Static Web
// Apps callback, which the managed provider gives us no hook for.

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
