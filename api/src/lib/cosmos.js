const { CosmosClient } = require('@azure/cosmos');

// The client is built on first use, not at import. Requiring this module — or
// anything that requires it — must not need a connection string in the
// environment, or every module in the API becomes untestable without one: the
// unit tests exercise the logic around these containers with fakes and never
// touch the real ones.
//
// One client per function host either way; the SDK pools connections
// internally, so building a fresh client per module would waste sockets.
let database;

function db() {
  if (!database) {
    const client = new CosmosClient(process.env.DATABASE_CONNECTION_STRING);
    database = client.database('noodles');
  }
  return database;
}

// Getters rather than plain properties so `require('./cosmos')` stays free and
// the cost lands on the first query instead.
module.exports = {
  get packages() { return db().container('packages'); },
  get ratings() { return db().container('ratings'); },
  get aggregates() { return db().container('aggregates'); },
  get submissions() { return db().container('submissions'); }
};
