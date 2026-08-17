const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults } = require('../lib/noodle');

const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
const container = client.database('noodles').container('packages');
const ratingsContainer = client.database('noodles').container('ratings');
const aggregatesContainer = client.database('noodles').container('aggregates');

async function mergeAggregates(noodles) {
  const { resources } = await aggregatesContainer.items.query('SELECT * FROM c').fetchAll();
  const aggMap = new Map(resources.map(a => [a.id, a]));
  return noodles.map(n => {
    const agg = aggMap.get(n.id);
    return agg ? { ...n, avgRating: agg.avgRating, avgSpicy: agg.avgSpicy, ratingCount: agg.ratingCount } : n;
  });
}

app.http('noodles', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const search = params.get('search');
      const id = params.get('id');
      let querySpec;

      if (id) {
        querySpec = {
          query: 'SELECT * FROM c WHERE c.id = @id',
          parameters: [{ name: '@id', value: id }]
        };
      } else if (search) {
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

      const { resources } = await container.items.query(querySpec).fetchAll();
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
      const { resource } = await container.items.create(data);
      if (userId) {
        const ratingId = `${userId}_${data.id}`;
        await Promise.all([
          ratingsContainer.items.upsert({ id: ratingId, userId, noodleId: data.id, rating: data.rating, spicy: data.spicy }),
          aggregatesContainer.items.upsert({ id: data.id, avgRating: data.rating, avgSpicy: data.spicy, ratingCount: 1 })
        ]);
      }
      return { jsonBody: resource, status: 201 };
    }

    if (request.method === 'PUT') {
      const data = withRatingDefaults(await request.json());
      const { resource } = await container.items.upsert(data);
      return { jsonBody: resource };
    }
  }
});
