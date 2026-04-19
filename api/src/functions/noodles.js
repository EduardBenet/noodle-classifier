const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
const container = client.database('noodles').container('packages');

app.http('noodles', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (request.method === 'GET') {
      const search = new URL(request.url).searchParams.get('search');
      let querySpec;

      if (search) {
        const term = search.toLowerCase();
        querySpec = {
          query: `SELECT * FROM c WHERE
            CONTAINS(LOWER(c.name), @term) OR
            CONTAINS(LOWER(c.brand), @term) OR
            CONTAINS(LOWER(c.keywords), @term)`,
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
  }
});
