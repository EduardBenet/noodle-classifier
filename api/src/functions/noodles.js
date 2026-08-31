const { app } = require('@azure/functions');
const { parsePrincipal } = require('../lib/auth');
const { withRatingDefaults, normaliseId } = require('../lib/noodle');
const { packages, submissions } = require('../lib/cosmos');
const { applyRating, keepScores } = require('../lib/rating');
const { deleteNoodle, noodleOfTheDay } = require('../lib/catalogue');

// The community scores live on the noodle document, so there is no join here
// any more. This file used to carry a mergeAggregates() that read the whole
// aggregates container on every list request — a second full scan to attach
// three numbers to documents that can simply hold them.

app.http('noodles', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const id = params.get('id');

      // One noodle for the home page, chosen by the caller's local date. The
      // page used to fetch the entire catalogue and keep a single row.
      if (params.has('ofTheDay')) {
        const noodle = await noodleOfTheDay(params.get('ofTheDay'));
        if (!noodle) return { status: 404, jsonBody: { error: 'No noodle to show today' } };
        return { jsonBody: noodle };
      }

      // An array of nothing or of one, which is what the client unpacks.
      if (id) {
        const { resource } = await packages.item(id, id).read().catch(() => ({}));
        return { jsonBody: resource ? [resource] : [] };
      }

      // There was a `?search=` branch here running CONTAINS(LOWER(...)) across
      // every partition — the most expensive query in the app, to search a
      // catalogue the list page had already downloaded in full. The list page
      // filters its own copy now, so nothing called it. The `?search=` deep
      // link still works; it is answered on the client.
      const { resources } = await packages.items.query({ query: 'SELECT * FROM c' }).fetchAll();
      return { jsonBody: resources };
    }

    // 401 and 403 mean different things to the client: the add form offers a
    // login prompt on 401, and an expired session must not look like a
    // permissions problem.
    const principal = parsePrincipal(request);
    if (!principal) return { status: 401, jsonBody: { error: 'Unauthorised' } };
    if (!principal.userRoles?.includes('owner')) return { status: 403, jsonBody: { error: 'Forbidden' } };
    const userId = principal.userId;

    if (request.method === 'POST') {
      const body = await request.json();
      const id = normaliseId(body.id);
      if (!id) return { status: 400, jsonBody: { error: 'A product ID (barcode) is required' } };
      const data = withRatingDefaults({ ...body, id });

      // A pending suggestion for this barcode has to go through the review
      // queue rather than be bypassed here. Approving it afterwards upserts
      // the submitter's name, brand, price and description over whatever is
      // added now — the one path by which a non-owner can rewrite catalogue
      // text. Refusing the add keeps the queue the only way in.
      // Edit suggestions cannot match: pickEditable strips `id`, so their
      // stored noodle has no `id` for this predicate to hit.
      const { resources: queued } = await submissions.items.query({
        query: 'SELECT c.id FROM c WHERE c.noodle.id = @id',
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

      const { resource } = await packages.items.create(data);
      if (userId) {
        await applyRating({ userId, noodleId: data.id, rating: data.rating, spicy: data.spicy });
      }
      return { jsonBody: resource, status: 201 };
    }

    // Owner-only by the check above. Irreversible: the noodle, its aggregate,
    // every rating anyone gave it and any pending suggestion for it all go.
    if (request.method === 'DELETE') {
      const id = normaliseId(new URL(request.url).searchParams.get('id'));
      if (!id) return { status: 400, jsonBody: { error: 'A product ID (barcode) is required' } };

      const result = await deleteNoodle(id);
      if (!result.found) return { status: 404, jsonBody: { error: 'That noodle is not in the catalogue' } };
      // The counts go back so the client can say what was actually destroyed,
      // rather than leaving the owner to guess how many people's scores went
      // with it.
      return { jsonBody: result };
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      // Same guard as POST: an upsert with no id creates a new orphan rather
      // than editing anything.
      const id = normaliseId(body.id);
      if (!id) return { status: 400, jsonBody: { error: 'A product ID (barcode) is required' } };
      // Read before upsert: the body comes from a form that knows nothing about
      // avgRating or the running sums, so replacing the document with it would
      // wipe every community rating this noodle has.
      const { resource: existing } = await packages.item(id, id).read().catch(() => ({}));
      const data = keepScores(existing, withRatingDefaults({ ...body, id }));

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
