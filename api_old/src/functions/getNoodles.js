const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;

app.http('getNoodles', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Function triggered');
        context.log('COSMOS_DB_ENDPOINT is', endpoint ? 'set' : 'MISSING');
        context.log('COSMOS_DB_KEY is', key ? 'set' : 'MISSING');

        try {
            const client = new CosmosClient({ endpoint, key });

            context.log('Creating database handle...');
            const database = client.database('noodles');

            context.log('Creating container handle...');
            const container = database.container('packages');

            context.log('Fetching data from Cosmos...');
            const { resources: items } = await container.items.readAll().fetchAll();

            context.log('Success:', items.length, 'items retrieved');
            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: items
            };
        } catch (error) {
            context.log.error('Cosmos DB error:', error.message, error.stack);
            return {
                status: 500,
                body: {
                    error: error.message,
                    hint: 'Check Cosmos credentials, database/container name, or firewall settings'
                }
            };
        }
    }
});