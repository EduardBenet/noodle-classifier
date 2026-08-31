const { app } = require('@azure/functions');
const { catalogueStats } = require('../lib/stats');

// Anonymous, like /api/noodles: every figure here is derived from the public
// catalogue, and nothing about who is asking changes the answer. The profile
// page that reads it is gated to signed-in users by staticwebapp.config.json,
// which is a decision about the page rather than about the data.
app.http('stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => ({ jsonBody: await catalogueStats() })
});
