const cosmos = require('./cosmos');

// 404 is the expected answer for anything already gone: a delete that is
// retried, or a row another request removed first. Nothing else is swallowed —
// a throttled read must not look like a missing document, which is the bug
// readOrNull in submissions.js exists to avoid.
const ignoreMissing = (err) => {
  if (err.code !== 404) throw err;
};

// The date is the seed, so everyone opening the app on the same day sees the
// same noodle and it changes at midnight. It arrives from the caller as
// YYYY-MM-DD rather than being read from the clock here: the pick used to be
// made in the browser against the visitor's own calendar, and computing it from
// the server's UTC day would quietly move the changeover to 01:00 for half the
// year in London. An unparseable or missing date falls back to the server's.
function seedFor(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
  if (match) return Number(`${match[1]}${match[2]}${match[3]}`);

  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

function createCatalogueOps(stores) {
  // One noodle, chosen by the date. The home page used to download the whole
  // catalogue to keep a single row; this reads ids and names — no descriptions,
  // no images, no Cosmos system fields — picks from those, and point-reads the
  // winner.
  //
  // Rows that cannot render a card are skipped, as they were on the client: one
  // record reached production with no id and every field empty, and it blanked
  // the home page on the day the seed landed on it.
  async function noodleOfTheDay(dateKey) {
    const { resources } = await stores.packages.items
      .query({ query: 'SELECT c.id, c.name FROM c' }).fetchAll();

    // Sorted, because the pick has to be the same on every request and Cosmos
    // makes no promise about the order of an unsorted query. The client version
    // took whatever order the query returned, which was luck rather than
    // determinism.
    const candidates = resources
      .filter(n => n.id && typeof n.name === 'string' && n.name.trim() !== '')
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    if (!candidates.length) return null;

    const { id } = candidates[seedFor(dateKey) % candidates.length];
    const { resource } = await stores.packages.item(id, id).read().catch(() => ({}));
    return resource ?? null;
  }

  // Deleting a noodle is three deletes, not one. The catalogue row is what
  // people see, but every rating written against it and any suggestion pointing
  // at it are keyed to an id that is about to stop existing. (The community
  // scores need no delete of their own — they are fields on the row itself.)
  //
  // Orphaned ratings are not merely untidy: listOwnRatings joins each of the
  // caller's rating rows to its noodle and drops the ones whose noodle is gone,
  // so every orphan would cost two point reads on every My List load, forever.
  async function deleteNoodle(noodleId) {
    const { resource: existing } = await stores.packages.item(noodleId, noodleId).read().catch(() => ({}));
    if (!existing) return { found: false, ratingsRemoved: 0, submissionsRemoved: 0 };

    // Catalogue first, deliberately. A failure part-way through then leaves
    // orphaned scores behind a noodle that is gone — recoverable, and invisible
    // to everyone. The other order leaves a live noodle whose ratings have been
    // destroyed, which is neither.
    await stores.packages.item(noodleId, noodleId).delete().catch(ignoreMissing);

    // Cross-partition: `ratings` is keyed (/userId, /noodleId), so every rating
    // of one noodle sits in a different partition. Both key levels are needed
    // to delete each row, hence selecting userId alongside the id.
    const { resources: ratingRows } = await stores.ratings.items.query({
      query: 'SELECT c.id, c.userId FROM c WHERE c.noodleId = @noodleId',
      parameters: [{ name: '@noodleId', value: noodleId }]
    }).fetchAll();

    await Promise.all(ratingRows.map(row =>
      stores.ratings.item(row.id, [row.userId, noodleId]).delete().catch(ignoreMissing)
    ));

    // Both shapes of pending suggestion: an edit names its target, a new-noodle
    // suggestion carries the barcode inside its noodle. Either way there is
    // nothing left for the owner to approve it onto.
    const { resources: pending } = await stores.submissions.items.query({
      query: 'SELECT c.id FROM c WHERE c.targetId = @noodleId OR c.noodle.id = @noodleId',
      parameters: [{ name: '@noodleId', value: noodleId }]
    }).fetchAll();

    await Promise.all(pending.map(sub =>
      stores.submissions.item(sub.id, sub.id).delete().catch(ignoreMissing)
    ));

    return {
      found: true,
      name: existing.name ?? null,
      ratingsRemoved: ratingRows.length,
      submissionsRemoved: pending.length
    };
  }

  return { deleteNoodle, noodleOfTheDay };
}

const { deleteNoodle, noodleOfTheDay } = createCatalogueOps(cosmos);

module.exports = { deleteNoodle, noodleOfTheDay, createCatalogueOps, seedFor };
