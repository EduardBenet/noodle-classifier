const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const client = new CosmosClient({ endpoint, key });

module.exports = async function (context, req) {
    const database = client.database('noodles');
    const container = database.container('packages');

    const { resources: items } = await container.items.readAll().fetchAll();

    context.res = {
        headers: { 'Content-Type': 'application/json' },
        body: items
    };
};