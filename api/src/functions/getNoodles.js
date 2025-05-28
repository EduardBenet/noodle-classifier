const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;

app.http('diagnoseCosmos', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const client = new CosmosClient({ endpoint, key });
            const { databases } = await client.databases.readAll().fetchAll();

            const results = [];

            for (const db of databases) {
                const database = client.database(db.id);
                const { containers } = await database.containers.readAll().fetchAll();

                results.push({
                    database: db.id,
                    containers: containers.map(c => c.id)
                });
            }

            return {
                status: 200,
                body: results
            };
        } catch (error) {
            return {
                status: 500,
                body: { error: error.message }
            };
        }
    }
});