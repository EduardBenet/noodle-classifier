const { app } = require('@azure/functions');
const { parsePrincipal } = require('../lib/auth');
const { ratings: ratingsContainer, aggregates: aggregatesContainer } = require('../lib/cosmos');

const MAX_RETRIES = 3;

app.http('ratings', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const userId = parsePrincipal(request)?.userId;
    if (!userId) return { status: 401, jsonBody: { error: 'Unauthorised' } };

    // The caller's own rating for one noodle — a point read, so this stays
    // cheap however large the catalogue gets.
    if (request.method === 'GET') {
      const noodleId = new URL(request.url).searchParams.get('noodleId');
      if (!noodleId) return { status: 400, jsonBody: { error: 'noodleId is required' } };
      const { resource } = await ratingsContainer.item(`${userId}_${noodleId}`, userId).read().catch(() => ({}));
      return { jsonBody: resource ? { rating: resource.rating, spicy: resource.spicy } : null };
    }

    const { noodleId, rating, spicy } = await request.json();
    if (!noodleId || rating == null || spicy == null) {
      return { status: 400, jsonBody: { error: 'noodleId, rating and spicy are required' } };
    }

    const ratingId = `${userId}_${noodleId}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const [existingRatingResp, existingAggResp] = await Promise.all([
        ratingsContainer.item(ratingId, userId).read().catch(() => null),
        aggregatesContainer.item(noodleId, noodleId).read().catch(() => null)
      ]);

      const existingRating = existingRatingResp?.resource ?? null;
      const existingAgg = existingAggResp?.resource ?? null;

      let newAvgRating, newAvgSpicy, newCount;
      if (!existingAgg) {
        newAvgRating = rating;
        newAvgSpicy = spicy;
        newCount = 1;
      } else if (existingRating) {
        newCount = existingAgg.ratingCount;
        newAvgRating = (existingAgg.avgRating * newCount - existingRating.rating + rating) / newCount;
        newAvgSpicy  = (existingAgg.avgSpicy  * newCount - existingRating.spicy  + spicy)  / newCount;
      } else {
        newCount = existingAgg.ratingCount + 1;
        newAvgRating = (existingAgg.avgRating * existingAgg.ratingCount + rating) / newCount;
        newAvgSpicy  = (existingAgg.avgSpicy  * existingAgg.ratingCount + spicy)  / newCount;
      }

      const newAgg = {
        id: noodleId,
        avgRating: Math.round(newAvgRating * 100) / 100,
        avgSpicy:  Math.round(newAvgSpicy  * 100) / 100,
        ratingCount: newCount
      };

      try {
        await Promise.all([
          ratingsContainer.items.upsert({ id: ratingId, userId, noodleId, rating, spicy }),
          existingAgg
            ? aggregatesContainer.item(noodleId, noodleId).replace(newAgg, { accessCondition: { type: 'IfMatch', condition: existingAgg._etag } })
            : aggregatesContainer.items.create(newAgg)
        ]);
        // Return what was stored, not the raw maths, so the caller's copy
        // matches a subsequent read.
        return { status: 200, jsonBody: { avgRating: newAgg.avgRating, avgSpicy: newAgg.avgSpicy, ratingCount: newAgg.ratingCount } };
      } catch (err) {
        if ((err.code === 409 || err.code === 412) && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }
  }
});
