const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const jwt = require('jsonwebtoken');

function validateNoodle(data) {
  const errors = [];
  if (!data.id || typeof data.id !== 'string')           errors.push('id is required');
  if (!data.name || typeof data.name !== 'string')       errors.push('name is required');
  if (!data.brand || typeof data.brand !== 'string')     errors.push('brand is required');
  if (typeof data.price !== 'number' || data.price < 0)  errors.push('price must be a non-negative number');
  if (!Number.isInteger(data.rating) || data.rating < 0 || data.rating > 5) errors.push('rating must be an integer 0–5');
  if (!Number.isInteger(data.spicy)  || data.spicy < 0  || data.spicy > 5)  errors.push('spicy must be an integer 0–5');
  if (typeof data.hasSoup !== 'boolean')                 errors.push('hasSoup must be a boolean');
  if (!Array.isArray(data.keywords))                     errors.push('keywords must be an array');
  return errors;
}

function isOwner(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.isOwner === true;
  } catch {
    return false;
  }
}

const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
const container = client.database('noodles').container('packages');

app.http('noodles', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
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
        return { jsonBody: resources };
      }

      if (request.method === 'POST') {
        if (!isOwner(request)) return { status: 401, jsonBody: { error: 'Unauthorized' } };
        const data = await request.json();
        const errors = validateNoodle(data);
        if (errors.length) return { status: 400, jsonBody: { errors } };
        const { resource } = await container.items.create(data);
        return { jsonBody: resource, status: 201 };
      }

      if (request.method === 'PUT') {
        if (!isOwner(request)) return { status: 401, jsonBody: { error: 'Unauthorized' } };
        const data = await request.json();
        const errors = validateNoodle(data);
        if (errors.length) return { status: 400, jsonBody: { errors } };
        const { resource } = await container.items.upsert(data);
        return { jsonBody: resource };
      }
    } catch (err) {
      context.error('noodles handler error:', err);
      return { status: 500, jsonBody: { error: 'Internal server error' } };
    }
  }
});
