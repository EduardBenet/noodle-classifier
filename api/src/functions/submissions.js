const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults } = require('../lib/noodle');
const {
  submissions: submissionsContainer,
  packages: packagesContainer
} = require('../lib/cosmos');
const { applyRating, parseScore, RATING_MIN, SPICY_MIN } = require('../lib/rating');

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

      // The submitter's own score is the point of asking, so it is required and
      // bounded here rather than defaulted — a suggestion with no real opinion
      // behind it would seed a rating row the submitter never gave.
      const rating = parseScore(data.rating, RATING_MIN);
      const spicy = parseScore(data.spicy, SPICY_MIN);
      if (rating === null || spicy === null) {
        return { status: 400, jsonBody: { error: 'rating (1-5) and spicy (0-5) are required' } };
      }

      const submission = {
        id: randomUUID(),
        submittedBy: user.userId,
        submittedAt: new Date().toISOString(),
        noodle: { ...data, rating, spicy }
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

        // Read the queued entry before it is deleted: the submitter's id and
        // the score THEY gave live here, and neither can be trusted from the
        // request body — that is the owner's edited copy of the form.
        const { resource: submission } =
          await submissionsContainer.item(id, id).read().catch(() => ({}));

        // Sequential, not Promise.all: publishing must succeed before the
        // submission is dropped, or a failure loses the queue entry too.
        await packagesContainer.items.upsert(approved);

        // Approval is "the owner adds the noodle, then the submitter rates it".
        // Two rating rows, written in that order. They carry the same score
        // unless the owner overrode the pre-filled queue fields, in which case
        // the submitter keeps what they actually submitted.
        //
        // applyRating rather than a blind aggregate upsert — if this noodle
        // already exists and carries community ratings (the same barcode can
        // be queued twice), overwriting would reset ratingCount to 1 and
        // discard every real rating.
        if (approved.id) {
          await applyRating({
            userId: user.userId,
            noodleId: approved.id,
            rating: approved.rating,
            spicy: approved.spicy
          });

          const submitterId = submission?.submittedBy;
          const submittedRating = parseScore(submission?.noodle?.rating, RATING_MIN);
          const submittedSpicy = parseScore(submission?.noodle?.spicy, SPICY_MIN);

          // Skipped when the owner submitted it themselves (one person, one
          // rating), and when the queue entry predates the submit form asking
          // for a score — defaulting there would invent an opinion and inflate
          // ratingCount with it.
          if (submitterId && submitterId !== user.userId
              && submittedRating !== null && submittedSpicy !== null) {
            await applyRating({
              userId: submitterId,
              noodleId: approved.id,
              rating: submittedRating,
              spicy: submittedSpicy
            });
          }
        }

        // A double-clicked Approve would otherwise 404 here and report a 500
        // for work that actually succeeded.
        await submissionsContainer.item(id, id).delete().catch(err => {
          if (err.code !== 404) throw err;
        });
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
