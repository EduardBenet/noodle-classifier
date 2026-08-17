const { app } = require('@azure/functions');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults } = require('../lib/noodle');
const { packages, ratings, aggregates } = require('../lib/cosmos');

function withAggregate(noodle, agg) {
  return agg ? { ...noodle, avgRating: agg.avgRating, avgSpicy: agg.avgSpicy, ratingCount: agg.ratingCount } : noodle;
}

async function mergeAggregates(noodles) {
  if (!noodles.length) return noodles;

  // A single result (the `?id=` lookup, or a search that matched one noodle)
  // only needs a point read.
  if (noodles.length === 1) {
    const id = noodles[0].id;
    const { resource } = await aggregates.item(id, id).read().catch(() => ({}));
    return [withAggregate(noodles[0], resource)];
  }

  const { resources } = await aggregates.items.query('SELECT * FROM c').fetchAll();
  const aggMap = new Map(resources.map(a => [a.id, a]));
  return noodles.map(n => withAggregate(n, aggMap.get(n.id)));
}

app.http('noodles', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const search = params.get('search');
      const id = params.get('id');

      if (id) {
        const { resource } = await packages.item(id, id).read().catch(() => ({}));
        return { jsonBody: await mergeAggregates(resource ? [resource] : []) };
      }

      let querySpec;
      if (search) {
        const term = search.toLowerCase();
        querySpec = {
          query: `SELECT * FROM c WHERE
            CONTAINS(LOWER(c.name), @term) OR
            CONTAINS(LOWER(c.brand), @term) OR
            CONTAINS(c.id, @term)`,
          parameters: [{ name: '@term', value: term }]
        };
      } else {
        querySpec = { query: 'SELECT * FROM c' };
      }

      const { resources } = await packages.items.query(querySpec).fetchAll();
      return { jsonBody: await mergeAggregates(resources) };
    }

    let isOwner = false, userId;
    if (request.method === 'POST' || request.method === 'PUT') {
      const principal = parsePrincipal(request);
      isOwner = principal?.userRoles?.includes('owner') ?? false;
      userId = principal?.userId;
      if (!isOwner) return { status: 403, jsonBody: { error: 'Forbidden' } };
    }

    if (request.method === 'POST') {
      const data = withRatingDefaults(await request.json());
      const { resource } = await packages.items.create(data);
      if (userId) {
        const ratingId = `${userId}_${data.id}`;
        await Promise.all([
          ratings.items.upsert({ id: ratingId, userId, noodleId: data.id, rating: data.rating, spicy: data.spicy }),
          aggregates.items.upsert({ id: data.id, avgRating: data.rating, avgSpicy: data.spicy, ratingCount: 1 })
        ]);
      }
      return { jsonBody: resource, status: 201 };
    }

    if (request.method === 'PUT') {
      const data = withRatingDefaults(await request.json());
      const { resource } = await packages.items.upsert(data);
      return { jsonBody: resource };
    }
  }
});
