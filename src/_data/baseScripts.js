// The scripts base.html loads on every page, in load order. Kept beside the
// route data so the service worker's precache list can be generated rather
// than hand-maintained; base.html remains the place they are actually loaded.
module.exports = [
  'assets/js/cards.js',
  'assets/js/overlay.js',
  'assets/js/auth.js',
  'assets/js/sw-register.js'
];
