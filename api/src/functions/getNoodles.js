const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;

const client = new CosmosClient({ endpoint, key });

app.http('getNoodles', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Fetching noodles from Cosmos DB...`);

        try {
            const database = client.database('noodles');
            const container = database.container('packages');

            const { resources: items } = await container.items.readAll().fetchAll();

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: items
            };
        } catch (error) {
            context.log.error('Error reading from Cosmos DB:', error.message);
            return {
                status: 500,
                body: { error: 'Failed to retrieve noodles from the database.' }
            };
        }
    }
});