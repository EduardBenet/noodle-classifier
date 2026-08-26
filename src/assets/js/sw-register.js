// Registers the service worker, which is what makes the site installable on
// Android. Scope is the site root, so the file has to be served from /sw.js —
// a worker under /assets/ could only control /assets/.
//
// Registration waits for load: it competes with the page's own fetches for
// bandwidth otherwise, and nothing on screen depends on it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unregistered worker costs nothing but offline support and the
      // install prompt — never worth surfacing to the user.
    });
  });
}
