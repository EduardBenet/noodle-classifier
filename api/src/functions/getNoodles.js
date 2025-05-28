const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;

const client = new CosmosClient({ endpoint, key });

app.http('getNoodles', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const { databases } = await client.databases.readAll().fetchAll();
            return {
                status: 200,
                body: databases
            };
        } catch (error) {
            return {
                status: 500,
                body: { error: error.message }
            };
        }
    }
});
