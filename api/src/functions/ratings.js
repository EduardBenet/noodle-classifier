const { app } = require('@azure/functions');
const { parsePrincipal } = require('../lib/auth');
const {
  ratings: ratingsContainer,
  aggregates: aggregatesContainer,
  packages: packagesContainer
} = require('../lib/cosmos');
const { applyRating, parseScore, RATING_MIN, SPICY_MIN, SCORE_MAX } = require('../lib/rating');

// Every noodle the caller has rated, joined with the noodle document and the
// community aggregate. `ratings` has a hierarchical partition key
// (/userId, /noodleId); passing just the first level as a prefix keeps this to
// the caller's own partitions, so cost scales with how much the caller has
// rated — not with the size of the catalogue.
async function listOwnRatings(userId) {
  const { resources: own } = await ratingsContainer.items.query(
    {
      query: 'SELECT * FROM c WHERE c.userId = @userId',
      parameters: [{ name: '@userId', value: userId }]
    },
    { partitionKey: [userId] }
  ).fetchAll();

  const rows = await Promise.all(own.map(async (r) => {
    const [noodleRes, aggRes] = await Promise.all([
      packagesContainer.item(r.noodleId, r.noodleId).read().catch(() => ({})),
      aggregatesContainer.item(r.noodleId, r.noodleId).read().catch(() => ({}))
    ]);
    const noodle = noodleRes.resource;
    // Skip ratings whose noodle has since been removed.
    if (!noodle) return null;
    const agg = aggRes.resource;
    return {
      ...noodle,
      avgRating: agg?.avgRating,
      avgSpicy: agg?.avgSpicy,
      ratingCount: agg?.ratingCount,
      myRating: r.rating,
      mySpicy: r.spicy,
      ratedAt: r.ratedAt ?? null
    };
  }));

  return rows.filter(Boolean);
}

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
      // No noodleId: the caller's whole rating history, for "My List".
      if (!noodleId) return { jsonBody: await listOwnRatings(userId) };
      // Hierarchical partition key: both levels required for a point read.
      const { resource } = await ratingsContainer
        .item(`${userId}_${noodleId}`, [userId, noodleId]).read().catch(() => ({}));
      return { jsonBody: resource ? { rating: resource.rating, spicy: resource.spicy } : null };
    }

    const { noodleId, rating, spicy } = await request.json();
    const score = parseScore(rating, RATING_MIN);
    const heat = parseScore(spicy, SPICY_MIN);
    if (!noodleId || score === null || heat === null) {
      return {
        status: 400,
        jsonBody: {
          error: `noodleId is required; rating must be a whole number from ${RATING_MIN} to ${SCORE_MAX} `
            + `and spicy from ${SPICY_MIN} to ${SCORE_MAX}`
        }
      };
    }

    // Returns what was stored, so the caller's copy matches a later read.
    const agg = await applyRating({ userId, noodleId, rating: score, spicy: heat });
    return {
      status: 200,
      jsonBody: { avgRating: agg.avgRating, avgSpicy: agg.avgSpicy, ratingCount: agg.ratingCount }
    };
  }
});
