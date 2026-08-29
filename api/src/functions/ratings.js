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
// (/userId, /noodleId), and the routing to the caller's own partitions comes
// from the `c.userId` equality filter below: the backend resolves an equality
// filter on the first level of a hierarchical key to just the physical
// partitions holding that prefix. So cost still scales with how much the
// caller has rated, not with the size of the catalogue.
//
// Do NOT pass `{ partitionKey: [userId] }` as a feed option to get the same
// effect. @azure/cosmos 4.x implements prefix partition keys only for the
// change feed (`getEPKRangeForPrefixPartitionKey` lives under
// client/ChangeFeed/); on the query path the SDK forwards the one-component
// key verbatim and the gateway rejects it against the two-component
// definition with "Partition key provided either doesn't correspond to
// definition in the collection", surfacing as a 500.
// `limit` caps the join, not the query: the rating rows are cheap to read
// (one partition prefix), but each one costs two point reads to join with its
// noodle and aggregate. "My List" opens on the last few ratings, so trimming
// before the join is what keeps that page's cost flat as a history grows.
async function listOwnRatings(userId, limit) {
  const { resources: own } = await ratingsContainer.items.query({
    query: 'SELECT * FROM c WHERE c.userId = @userId',
    parameters: [{ name: '@userId', value: userId }]
  }).fetchAll();

  // Rows written before ratedAt existed sort last, as they do in the UI.
  own.sort((a, b) => (b.ratedAt ?? '').localeCompare(a.ratedAt ?? ''));
  const wanted = limit ? own.slice(0, limit) : own;

  const rows = await Promise.all(wanted.map(async (r) => {
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
      const params = new URL(request.url).searchParams;
      const noodleId = params.get('noodleId');
      // No noodleId: the caller's rating history, for "My List" — newest first,
      // optionally capped with ?limit=.
      if (!noodleId) {
        const limit = Number.parseInt(params.get('limit') ?? '', 10);
        return { jsonBody: await listOwnRatings(userId, limit > 0 ? limit : null) };
      }
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
