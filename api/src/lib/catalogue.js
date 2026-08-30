const cosmos = require('./cosmos');

// 404 is the expected answer for anything already gone: a delete that is
// retried, or a row another request removed first. Nothing else is swallowed —
// a throttled read must not look like a missing document, which is the bug
// readOrNull in submissions.js exists to avoid.
const ignoreMissing = (err) => {
  if (err.code !== 404) throw err;
};

// Deleting a noodle is four deletes, not one. The catalogue row is what people
// see, but its aggregate, every rating written against it, and any suggestion
// pointing at it are all keyed to an id that is about to stop existing.
//
// Orphaned ratings are not merely untidy: listOwnRatings joins each of the
// caller's rating rows to its noodle and drops the ones whose noodle is gone,
// so every orphan costs two point reads on every My List load, forever.
function createCatalogueOps(stores) {
  async function deleteNoodle(noodleId) {
    const { resource: existing } = await stores.packages.item(noodleId, noodleId).read().catch(() => ({}));
    if (!existing) return { found: false, ratingsRemoved: 0, submissionsRemoved: 0 };

    // Catalogue first, deliberately. A failure part-way through then leaves
    // orphaned scores behind a noodle that is gone — recoverable, and invisible
    // to everyone. The other order leaves a live noodle whose ratings have been
    // destroyed, which is neither.
    await stores.packages.item(noodleId, noodleId).delete().catch(ignoreMissing);
    await stores.aggregates.item(noodleId, noodleId).delete().catch(ignoreMissing);

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

  return { deleteNoodle };
}

const { deleteNoodle } = createCatalogueOps(cosmos);

module.exports = { deleteNoodle, createCatalogueOps };
