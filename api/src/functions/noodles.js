const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
const container = client.database('noodles').container('packages');

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
          query: `SELECT * FROM c JOIN k IN c.keywords WHERE
            CONTAINS(LOWER(c.name), @term) OR
            CONTAINS(LOWER(c.brand), @term) OR
            CONTAINS(LOWER(k), @term)`,
          parameters: [{ name: '@term', value: term }]
        };
      } else {
        querySpec = { query: 'SELECT * FROM c' };
      }

      const { resources } = await container.items.query(querySpec).fetchAll();
      return { jsonBody: resources };
    }

    if (request.method === 'POST') {
      const data = await request.json();
      const { resource } = await container.items.create(data);
      return { jsonBody: resource, status: 201 };
    }

    if (request.method === 'PUT') {
      const data = await request.json();
      const { resource } = await container.items.upsert(data);
      return { jsonBody: resource };
    }
  }
});
