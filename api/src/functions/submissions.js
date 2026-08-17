const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults } = require('../lib/noodle');
const {
  submissions: submissionsContainer,
  packages: packagesContainer,
  ratings: ratingsContainer,
  aggregates: aggregatesContainer
} = require('../lib/cosmos');

app.http('submissions', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = parsePrincipal(request);
    if (!user) return { status: 401, jsonBody: { error: 'Unauthorised' } };

    const isOwner = user.userRoles?.includes('owner');

    if (request.method === 'POST') {
      const data = await request.json();
      if (data.id) {
        const { resource: existing } = await packagesContainer.item(data.id, data.id).read().catch(() => ({}));
        if (existing) return { status: 409, jsonBody: { error: 'This noodle is already in the catalogue' } };
      }
      const submission = {
        id: randomUUID(),
        submittedBy: user.userId,
        submittedAt: new Date().toISOString(),
        noodle: data
      };
      await submissionsContainer.items.create(submission);
      return { status: 201, jsonBody: { id: submission.id } };
    }

    if (!isOwner) return { status: 403, jsonBody: { error: 'Forbidden' } };

    if (request.method === 'GET') {
      const { resources } = await submissionsContainer.items.query('SELECT * FROM c').fetchAll();
      return { jsonBody: resources };
    }

    if (request.method === 'PUT') {
      const { id, action, noodle } = await request.json();
      if (!id || !action) return { status: 400, jsonBody: { error: 'id and action are required' } };

      if (action === 'approve') {
        if (!noodle) return { status: 400, jsonBody: { error: 'noodle data required for approve' } };
        const approved = withRatingDefaults(noodle);
        const ops = [
          packagesContainer.items.upsert(approved),
          submissionsContainer.item(id, id).delete()
        ];
        if (approved.id) {
          const ratingId = `${user.userId}_${approved.id}`;
          ops.push(
            ratingsContainer.items.upsert({ id: ratingId, userId: user.userId, noodleId: approved.id, rating: approved.rating, spicy: approved.spicy, ratedAt: new Date().toISOString() }),
            aggregatesContainer.items.upsert({ id: approved.id, avgRating: approved.rating, avgSpicy: approved.spicy, ratingCount: 1 })
          );
        }
        await Promise.all(ops);
        return { jsonBody: { ok: true } };
      }

      if (action === 'reject') {
        await submissionsContainer.item(id, id).delete();
        return { jsonBody: { ok: true } };
      }

      return { status: 400, jsonBody: { error: 'action must be approve or reject' } };
    }
  }
});
