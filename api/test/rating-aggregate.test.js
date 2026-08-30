const test = require('node:test');
const assert = require('node:assert/strict');

const { createRatingOps, sumsOf, aggregateOf } = require('../src/lib/rating');
const { fakeContainer, conflict } = require('./fake-cosmos');

const NOODLE = '8801043032155';

function ops(seed = {}) {
  const ratings = fakeContainer(seed.ratings ?? []);
  const aggregates = fakeContainer(seed.aggregates ?? []);
  return { ratings, aggregates, ...createRatingOps({ ratings, aggregates }) };
}

test('the first rating creates the aggregate', async () => {
  const { applyRating, aggregates, ratings } = ops();

  const agg = await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  assert.deepEqual(
    { avgRating: agg.avgRating, avgSpicy: agg.avgSpicy, ratingCount: agg.ratingCount },
    { avgRating: 4, avgSpicy: 2, ratingCount: 1 }
  );
  assert.equal(ratings.docs.size, 1, 'the rating row is stored too');
  assert.equal(aggregates.docs.get(NOODLE).ratingCount, 1);
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
  const { applyRating, aggregates } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  aggregates.failures.replace.push(conflict());
  const agg = await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 });

  assert.equal(agg.ratingCount, 2, 'the retry still counted a second rater');
  assert.equal(agg.avgRating, 3);
  assert.equal(agg.avgSpicy, 1);
});

test('a rating gives up after the retries are exhausted', async () => {
  const { applyRating, aggregates } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  aggregates.failures.replace.push(conflict(), conflict(), conflict());

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

test('removing the last rating drops the aggregate rather than zeroing it', async () => {
  // A zeroed row would read as "rated 0.0 by nobody". With no aggregate the
  // cards fall back to the noodle's own seed score, exactly as they do for a
  // noodle nobody has ever rated.
  const { applyRating, unapplyRating, aggregates } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  const { removed, aggregate } = await unapplyRating({ userId: 'ann', noodleId: NOODLE });

  assert.equal(removed, true);
  assert.equal(aggregate, null);
  assert.equal(aggregates.docs.has(NOODLE), false);
});

test('un-rating something you never rated is not an error', async () => {
  const { unapplyRating, aggregates, applyRating } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });

  const result = await unapplyRating({ userId: 'bo', noodleId: NOODLE });

  assert.deepEqual(result, { removed: false, aggregate: null });
  assert.equal(aggregates.docs.get(NOODLE).ratingCount, 1, 'the aggregate is untouched');
});

test('un-rating retries a lost etag race', async () => {
  const { applyRating, unapplyRating, aggregates } = ops();
  await applyRating({ userId: 'ann', noodleId: NOODLE, rating: 4, spicy: 2 });
  await applyRating({ userId: 'bo', noodleId: NOODLE, rating: 2, spicy: 0 });

  aggregates.failures.replace.push(conflict());
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
    aggregates: [{ id: NOODLE, avgRating: 4, avgSpicy: 2.33, ratingCount: 3 }]
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

test('aggregateOf derives averages that agree with their sums', () => {
  const agg = aggregateOf(NOODLE, 7, 3, 2);
  assert.deepEqual(agg, {
    id: NOODLE, avgRating: 3.5, avgSpicy: 1.5, ratingCount: 2, sumRating: 7, sumSpicy: 3
  });
});
