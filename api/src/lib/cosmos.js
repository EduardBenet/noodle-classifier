const { CosmosClient } = require('@azure/cosmos');

// One client per function host — the SDK pools connections internally, so
// building a fresh client per module wastes sockets.
const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
const database = client.database('noodles');

module.exports = {
  packages: database.container('packages'),
  ratings: database.container('ratings'),
  aggregates: database.container('aggregates'),
  submissions: database.container('submissions')
};
