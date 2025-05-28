const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;

const client = new CosmosClient({ endpoint, key });

app.http('addNoodles', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const data = await request.json();

            const { name, keywords, description, price, imageUrl } = data;

            if (!name || !keywords || !description || !price || !imageUrl) {
                return {
                    status: 400,
                    body: { error: 'Missing one or more required fields.' }
                };
            }

            const database = client.database('noodles');
            const container = database.container('packages');

            const newItem = {
                id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`, // simple unique ID
                name,
                keywords,
                description,
                price,
                imageUrl,
                createdAt: new Date().toISOString()
            };

            await container.items.create(newItem);

            return {
                status: 201,
                body: { message: 'Noodle added successfully', item: newItem }
            };
        } catch (error) {
            context.log.error('Error adding noodle:', error.message);
            return {
                status: 500,
                body: { error: 'Failed to add noodle to database.' }
            };
        }
    }
});