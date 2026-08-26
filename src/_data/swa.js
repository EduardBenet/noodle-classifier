// Reads the Static Web Apps route table so "which routes require a login" is
// stated once, in staticwebapp.config.json, and not restated by hand anywhere
// else. The service worker template uses it to keep gated pages out of the
// precache list: those answer a 302 to the sign-in page when signed out, and
// caching that redirect would pin it for signed-in visitors too.
const config = require('../staticwebapp.config.json');

module.exports = () => {
  const gated = config.routes
    .filter(route => Array.isArray(route.allowedRoles) && route.allowedRoles.length)
    .map(route => route.route);

  return { gated, gatedSet: new Set(gated) };
};
