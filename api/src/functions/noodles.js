const { app } = require('@azure/functions');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults } = require('../lib/noodle');
const { packages, aggregates, submissions } = require('../lib/cosmos');
const { applyRating } = require('../lib/rating');

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

    // 401 and 403 mean different things to the client: the add form offers a
    // login prompt on 401, and an expired session must not look like a
    // permissions problem.
    const principal = parsePrincipal(request);
    if (!principal) return { status: 401, jsonBody: { error: 'Unauthorised' } };
    if (!principal.userRoles?.includes('owner')) return { status: 403, jsonBody: { error: 'Forbidden' } };
    const userId = principal.userId;

    if (request.method === 'POST') {
      const data = withRatingDefaults(await request.json());

      // A pending suggestion for this barcode has to go through the review
      // queue rather than be bypassed here. Approving it afterwards upserts
      // the submitter's name, brand, price and description over whatever is
      // added now — the one path by which a non-owner can rewrite catalogue
      // text. Refusing the add keeps the queue the only way in.
      if (data.id) {
        // Only new-noodle suggestions block an add. An edit suggestion targets
        // a noodle that already exists, so it can never collide with adding a
        // fresh one, and approving it merges rather than overwrites.
        // `NOT IS_DEFINED` covers entries queued before `kind` was stamped.
        const { resources: queued } = await submissions.items.query({
          query: `SELECT c.id FROM c WHERE c.noodle.id = @id
            AND (NOT IS_DEFINED(c.kind) OR c.kind = 'new')`,
          parameters: [{ name: '@id', value: data.id }]
        }).fetchAll();
        if (queued.length) {
          return {
            status: 409,
            jsonBody: {
              error: 'A suggestion for this barcode is waiting in the review queue',
              submissionId: queued[0].id
            }
          };
        }
      }

      const { resource } = await packages.items.create(data);
      if (userId) {
        await applyRating({ userId, noodleId: data.id, rating: data.rating, spicy: data.spicy });
      }
      return { jsonBody: resource, status: 201 };
    }

    if (request.method === 'PUT') {
      const data = withRatingDefaults(await request.json());
      const { resource } = await packages.items.upsert(data);
      // The form edits the owner's own score, so put it through the same path
      // a rating takes — otherwise the edit changes nothing the site displays,
      // which all reads from the aggregate now.
      if (userId) {
        await applyRating({ userId, noodleId: data.id, rating: data.rating, spicy: data.spicy });
      }
      return { jsonBody: resource };
    }
  }
});
