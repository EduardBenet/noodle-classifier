const test = require('node:test');
const assert = require('node:assert/strict');

const { createRatingOps, sumsOf, scoresOf, keepScores } = require('../src/lib/rating');
const { fakeContainer, conflict } = require('./fake-cosmos');

const NOODLE = '8801043032155';

// The community scores are fields on the noodle document, so the noodle has to
// exist before it can be rated — which is true of every caller in the app.
// `seed.scores` starts it with scores already on it.
function ops(seed = {}) {
  const ratings = fakeContainer(seed.ratings ?? []);
  const packages = fakeContainer([
    { id: NOODLE, name: 'Shin Ramyun Black', price: 3.5, ...(seed.scores ?? {}) }
  ]);
  return { ratings, packages, ...createRatingOps({ ratings, packages }) };
}

test('the first rating scores the noodle', async () => {
  const { applyRating, packages, ratings } = ops();

  const agg = await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  assert.deepEqual(
    { avgRating: agg.avgRating, avgSpicy: agg.avgSpicy, ratingCount: agg.ratingCount },
    { avgRating: 4, avgSpicy: 2, ratingCount: 1 }
  );
  assert.equal(ratings.docs.size, 1, 'the rating row is stored too');
  assert.equal(packages.docs.get(NOODLE).ratingCount, 1);
});

test('a second user raises the count and averages both scores', async () => {
  const { applyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  const agg = await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 5, spicy: 4 });

  assert.equal(agg.ratingCount, 2);
  assert.equal(agg.avgRating, 4.5);
  assert.equal(agg.avgSpicy, 3);
});

test('re-rating replaces a score without moving the count', async () => {
  const { applyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 });

  const agg = await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 5, spicy: 4 });

  assert.equal(agg.ratingCount, 2, 'still two raters, not three');
  assert.equal(agg.avgRating, 4.5);
  assert.equal(agg.avgSpicy, 3);
});

test('a lost etag race retries without mistaking a new rating for an edit', async () => {
  // The regression this pins: re-reading the caller's rating inside the retry
  // loop would find the row this same call had just written, treat a brand-new
  // rating as a replacement, and leave the count at 1 — the rating silently
  // vanishing from the community average.
  const { applyRating, packages } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  packages.failures.replace.push(conflict());
  const agg = await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 });

  assert.equal(agg.ratingCount, 2, 'the retry still counted a second rater');
  assert.equal(agg.avgRating, 3);
  assert.equal(agg.avgSpicy, 1);
});

test('a rating gives up after the retries are exhausted', async () => {
  const { applyRating, packages } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  packages.failures.replace.push(conflict(), conflict(), conflict());

  await assert.rejects(
    () => applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 }),
    (err) => err.code === 412
  );
});

test('un-rating takes exactly what rating added back out', async () => {
  const { applyRating, unapplyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 5, spicy: 4 });

  const { removed, aggregate } = await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.equal(removed, true);
  assert.equal(aggregate.ratingCount, 1);
  assert.equal(aggregate.avgRating, 4);
  assert.equal(aggregate.avgSpicy, 2);
});

test('un-rating deletes the rating row', async () => {
  const { applyRating, unapplyRating, ratings } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 5, spicy: 4 });

  await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.equal(ratings.docs.has('bo_' + NOODLE), false);
  assert.equal(ratings.docs.has('ann_' + NOODLE), true, 'other raters are untouched');
});

test('removing the last rating clears the scores rather than zeroing them', async () => {
  // A zeroed row would read as "rated 0.0 by nobody". Cleared, the card falls
  // back exactly as it does for a noodle nobody has ever rated — and the noodle
  // itself is untouched, which is the whole point of the fields living on it.
  const { applyRating, unapplyRating, packages } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  const { removed, aggregate } = await unapplyRating({ userId: 'ann', noodleId: NOODLE });

  assert.equal(removed, true);
  assert.equal(aggregate, null);

  const noodle = packages.docs.get(NOODLE);
  assert.equal(noodle.ratingCount, null);
  assert.equal(noodle.avgRating, null);
  assert.equal(noodle.name, 'Shin Ramyun Black', 'the noodle survived losing its scores');
});

test('un-rating something you never rated is not an error', async () => {
  const { unapplyRating, packages, applyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  const result = await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.deepEqual(result, { removed: false, aggregate: null });
  assert.equal(packages.docs.get(NOODLE).ratingCount, 1, 'the aggregate is untouched');
});

test('un-rating retries a lost etag race', async () => {
  const { applyRating, unapplyRating, packages } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 });

  packages.failures.replace.push(conflict());
  const { aggregate } = await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.equal(aggregate.ratingCount, 1);
  assert.equal(aggregate.avgRating, 4);
});

test('two hundred un-rate/re-rate cycles do not move the average', async () => {
  // 2.33 is a repeating decimal stored rounded, so it is where a per-write
  // rounding error would show up first if one crept back in.
  const { applyRating, unapplyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 3, spicy: 5 });
  const baseline = await applyRating({ userId: 'cai', noodleId: NOODLE, rating: 5, spicy: 0 });
  assert.equal(baseline.avgSpicy, 2.33);

  for (let i = 0; i < 200; i++) {
    await unapplyRating({ userId: 'bo', noodleId: NOODLE });
    await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 3, spicy: 5 });
  }

  const final = await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 3, spicy: 5 });
  assert.equal(final.avgRating, baseline.avgRating);
  assert.equal(final.avgSpicy, baseline.avgSpicy);
  assert.equal(final.ratingCount, baseline.ratingCount);
});

test('a sequence that walked the old arithmetic off the truth stays exact', async () => {
  // Averages used to be stored rounded and the sum recovered by multiplying
  // back out. This five-step sequence is the shortest one that leaves that
  // scheme visibly wrong: it lands on 3.02 when the only remaining rater gave
  // a 3. Small, but permanent — nothing later recomputes it from the rows.
  const { applyRating, unapplyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 1, spicy: 1 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 1, spicy: 1 });
  await applyRating({ userId: 'cai', noodleId: NOODLE, rating: 3, spicy: 3 });
  await unapplyRating({ userId: 'ann', noodleId: NOODLE });
  const { aggregate } = await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.equal(aggregate.ratingCount, 1);
  assert.equal(aggregate.avgRating, 3, 'exactly the one score left, not 3.02');
  assert.equal(aggregate.avgSpicy, 3);
});

test('an aggregate written before sums existed is reconstructed exactly', async () => {
  // Legacy row: only the rounded average survives. Every score is an integer,
  // so the true sum is too — rounding lands on it and takes out whatever drift
  // the old arithmetic had already accumulated.
  assert.deepEqual(
    sumsOf({ id: NOODLE, avgRating: 4, avgSpicy: 2.33, ratingCount: 3 }),
    { sumRating: 12, sumSpicy: 7 }
  );

  const { applyRating } = ops({
    scores: { avgRating: 4, avgSpicy: 2.33, ratingCount: 3 }
  });

  const agg = await applyRating({ userId: 'dee', noodleId: NOODLE, rating: 4, spicy: 1 });

  assert.equal(agg.ratingCount, 4);
  assert.equal(agg.avgRating, 4);
  assert.equal(agg.avgSpicy, 2);
  assert.equal(agg.sumSpicy, 8, 'sums are stored from now on');
});

test('sumsOf treats a countless aggregate as empty', () => {
  assert.deepEqual(sumsOf(null), { sumRating: 0, sumSpicy: 0 });
  assert.deepEqual(sumsOf({ ratingCount: 0 }), { sumRating: 0, sumSpicy: 0 });
});

test('scoresOf derives averages that agree with their sums', () => {
  assert.deepEqual(scoresOf(7, 3, 2), {
    avgRating: 3.5, avgSpicy: 1.5, ratingCount: 2, sumRating: 7, sumSpicy: 3
  });
});

test('rating a noodle leaves the rest of its document alone', async () => {
  // The scores are spread over the document just read, so an edit made in the
  // same moment survives — this is what the separate container used to give
  // for free, and the reason the write carries an IfMatch.
  const { applyRating, packages } = ops();

  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 5, spicy: 1 });

  const noodle = packages.docs.get(NOODLE);
  assert.equal(noodle.name, 'Shin Ramyun Black');
  assert.equal(noodle.price, 3.5);
  assert.equal(noodle.avgRating, 5);
});

test('rating a noodle that is not in the catalogue is refused', async () => {
  // The scores have nowhere to live. Under the old split they would have been
  // written to an aggregate row floating free of any catalogue entry.
  const { applyRating } = ops();

  await assert.rejects(
    () => applyRating({ userId: 'ann', noodleId: 'no-such-barcode', rating: 4, spicy: 2 }),
    (err) => err.code === 404
  );
});

test('an edit to a noodle does not wipe its community scores', () => {
  // The owner's form posts name, brand, price and so on — nothing about
  // avgRating or the running sums. Now that those live on the same document,
  // replacing it with the form's contents would destroy every rating the
  // noodle has. Under the old split they sat in another container and survived
  // by accident.
  const stored = {
    id: NOODLE, name: 'Shin Ramyun Black', price: 3.5,
    avgRating: 4.5, avgSpicy: 2, ratingCount: 8, sumRating: 36, sumSpicy: 16
  };
  const fromForm = { id: NOODLE, name: 'Shin Ramyun Black (Bowl)', price: 3.95 };

  const merged = keepScores(stored, fromForm);

  assert.equal(merged.name, 'Shin Ramyun Black (Bowl)', 'the edit lands');
  assert.equal(merged.price, 3.95);
  assert.equal(merged.ratingCount, 8, 'and the ratings survive it');
  assert.equal(merged.avgRating, 4.5);
  assert.equal(merged.sumRating, 36);
});

test('keepScores carries a cleared score across as cleared', () => {
  // null is a deliberate "nobody has rated this", not a gap to be filled.
  const merged = keepScores({ ratingCount: null, avgRating: null }, { id: NOODLE, name: 'Buldak' });

  assert.equal(merged.ratingCount, null);
  assert.equal(merged.avgRating, null);
});

test('keepScores on a noodle that did not exist adds nothing', () => {
  assert.deepEqual(keepScores(undefined, { id: NOODLE, name: 'Buldak' }), { id: NOODLE, name: 'Buldak' });
  assert.deepEqual(keepScores(null, { id: NOODLE, name: 'Buldak' }), { id: NOODLE, name: 'Buldak' });
});
