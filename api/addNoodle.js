const { CosmosClient } = require("@azure/cosmos");

module.exports = async function (context, req) {
    const { CosmosClient } = require("@azure/cosmos");

    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    const key = process.env.COSMOS_DB_KEY;
    const client = new CosmosClient({ endpoint, key });

    const noodle = req.body;
    noodle.id = Date.now().toString();  // Unique ID

    const { resource } = await client
        .database('noodles')
        .container('packages')
        .items.create(noodle);

    context.res = {
        status: 200,
        body: resource
    };
};