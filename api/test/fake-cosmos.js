// A Map-backed stand-in for a Cosmos container: enough of the SDK's surface for
// the rating code, and nothing else.
//
// It models the two behaviours the retry logic exists to handle — etags that
// change on every write, and 412 on a stale IfMatch — because those are the
// paths that have actually broken in production and the ones no amount of
// manual clicking reliably reproduces.

const notFound = () => Object.assign(new Error('not found'), { code: 404 });
const conflict = () => Object.assign(new Error('etag mismatch'), { code: 412 });

// The partition key is accepted and ignored: these tests are about the
// arithmetic and the concurrency, not about Cosmos's routing. Documents are
// keyed by id alone, which is unique within each container here.
function fakeContainer(seed = []) {
  const docs = new Map();
  let etagCounter = 0;

  const store = (doc) => {
    const stored = { ...doc, _etag: `etag-${++etagCounter}` };
    docs.set(doc.id, stored);
    return stored;
  };

  seed.forEach(store);

  const container = {
    // Test-only handles.
    docs,
    // Errors queued by a test, thrown one per matching call — this is how a
    // lost etag race is reproduced deterministically.
    failures: { replace: [], create: [], delete: [] },
    calls: { read: 0, upsert: 0, create: 0, replace: 0, delete: 0, query: 0 }
  };

  const nextFailure = (op) => (container.failures[op].length ? container.failures[op].shift() : null);

  const checkEtag = (id, options) => {
    const condition = options?.accessCondition;
    if (!condition) return;
    const current = docs.get(id);
    if (!current || current._etag !== condition.condition) throw conflict();
  };

  container.item = (id) => ({
    async read() {
      container.calls.read++;
      const doc = docs.get(id);
      // The SDK resolves a missing document rather than throwing, and the
      // production code leans on that with `?.resource ?? null`.
      return { resource: doc ? { ...doc } : undefined };
    },
    async replace(doc, options) {
      container.calls.replace++;
      const queued = nextFailure('replace');
      if (queued) throw queued;
      checkEtag(id, options);
      return { resource: store({ ...doc, id }) };
    },
    async delete(options) {
      container.calls.delete++;
      const queued = nextFailure('delete');
      if (queued) throw queued;
      if (!docs.has(id)) throw notFound();
      checkEtag(id, options);
      docs.delete(id);
      return {};
    }
  });

  // Enough SQL to evaluate the queries this codebase actually issues: equality
  // against a parameter, joined by OR or AND, over dotted paths. Deliberately
  // not a parser — but it does read the real query text, so a query naming the
  // wrong field fails the test rather than quietly matching everything.
  const evaluate = (spec, doc) => {
    const where = /WHERE\s+([\s\S]+)$/i.exec(spec.query);
    if (!where) return true;
    const params = Object.fromEntries((spec.parameters ?? []).map(p => [p.name, p.value]));
    const clauses = where[1].split(/\s+OR\s+/i);

    return clauses.some(clause => clause.split(/\s+AND\s+/i).every(term => {
      const [, path, param] = /c\.([\w.]+)\s*=\s*(@\w+)/.exec(term.trim()) ?? [];
      if (!path) throw new Error(`fake cosmos cannot evaluate: ${term}`);
      const value = path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
      return value === params[param];
    }));
  };

  container.items = {
    query(spec) {
      container.calls.query++;
      return {
        async fetchAll() {
          const resources = [...docs.values()]
            .filter(doc => evaluate(typeof spec === 'string' ? { query: spec } : spec, doc))
            .map(doc => ({ ...doc }));
          return { resources };
        }
      };
    },
    async upsert(doc) {
      container.calls.upsert++;
      return { resource: store(doc) };
    },
    async create(doc) {
      container.calls.create++;
      const queued = nextFailure('create');
      if (queued) throw queued;
      if (docs.has(doc.id)) throw Object.assign(new Error('conflict'), { code: 409 });
      return { resource: store(doc) };
    }
  };

  return container;
}

module.exports = { fakeContainer, notFound, conflict };
