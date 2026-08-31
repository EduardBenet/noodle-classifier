const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogueOps, seedFor } = require('../src/lib/catalogue');
const { fakeContainer } = require('./fake-cosmos');

const SHIN = '8801043032155';
const OTHER = '8801043032156';

// A catalogue with two noodles: SHIN rated by three people, OTHER by one, plus
// a pending edit and a pending new-noodle suggestion for each. Everything
// belonging to OTHER is there to prove the sweep does not reach past its target.
function catalogue() {
  const packages = fakeContainer([
    { id: SHIN, name: 'Shin Ramyun Black', avgRating: 4, avgSpicy: 3, ratingCount: 3, sumRating: 12, sumSpicy: 9 },
    { id: OTHER, name: 'Buldak', avgRating: 5, avgSpicy: 5, ratingCount: 1, sumRating: 5, sumSpicy: 5 }
  ]);
  const ratings = fakeContainer([
    { id: `ann_${SHIN}`, userId: 'ann', noodleId: SHIN, rating: 4, spicy: 3 },
    { id: `bo_${SHIN}`, userId: 'bo', noodleId: SHIN, rating: 4, spicy: 3 },
    { id: `cai_${SHIN}`, userId: 'cai', noodleId: SHIN, rating: 4, spicy: 3 },
    { id: `ann_${OTHER}`, userId: 'ann', noodleId: OTHER, rating: 5, spicy: 5 }
  ]);
  const submissions = fakeContainer([
    { id: 'edit-1', kind: 'edit', targetId: SHIN, noodle: { name: 'Shin Black' } },
    { id: 'new-1', kind: 'new', noodle: { id: SHIN, name: 'Shin Ramyun Black' } },
    { id: 'edit-2', kind: 'edit', targetId: OTHER, noodle: { name: 'Buldak 2x' } }
  ]);

  return {
    packages, ratings, submissions,
    ...createCatalogueOps({ packages, ratings, submissions })
  };
}

test('deleting a noodle removes the catalogue row', async () => {
  const c = catalogue();

  const result = await c.deleteNoodle(SHIN);

  assert.equal(result.found, true);
  assert.equal(result.name, 'Shin Ramyun Black');
  assert.equal(c.packages.docs.has(SHIN), false);
});

test('deleting a noodle takes its scores with it', async () => {
  // No separate delete to forget: the scores are fields on the row that just
  // went. This is one fewer container the sweep has to remember.
  const c = catalogue();
  await c.deleteNoodle(SHIN);
  assert.equal(c.packages.docs.has(SHIN), false);
});

test('deleting a noodle removes every rating written against it', async () => {
  const c = catalogue();

  const result = await c.deleteNoodle(SHIN);

  assert.equal(result.ratingsRemoved, 3);
  for (const user of ['ann', 'bo', 'cai']) {
    assert.equal(c.ratings.docs.has(`${user}_${SHIN}`), false, `${user}'s rating survived`);
  }
});

test('deleting a noodle withdraws the suggestions pointing at it', async () => {
  // Both shapes: an edit names its target, a new-noodle suggestion carries the
  // barcode inside its noodle. Neither has anything left to be approved onto.
  const c = catalogue();

  const result = await c.deleteNoodle(SHIN);

  assert.equal(result.submissionsRemoved, 2);
  assert.equal(c.submissions.docs.has('edit-1'), false);
  assert.equal(c.submissions.docs.has('new-1'), false);
});

test('deleting a noodle leaves every other noodle intact', async () => {
  const c = catalogue();

  await c.deleteNoodle(SHIN);

  assert.equal(c.packages.docs.has(OTHER), true);
  assert.equal(c.packages.docs.get(OTHER).ratingCount, 1, 'and its scores');
  assert.equal(c.ratings.docs.has(`ann_${OTHER}`), true, "ann's other rating survived");
  assert.equal(c.submissions.docs.has('edit-2'), true);
});

test('deleting a noodle that is not there changes nothing', async () => {
  const c = catalogue();

  const result = await c.deleteNoodle('no-such-barcode');

  assert.deepEqual(result, { found: false, ratingsRemoved: 0, submissionsRemoved: 0 });
  assert.equal(c.packages.docs.size, 2);
  assert.equal(c.ratings.docs.size, 4);
  assert.equal(c.submissions.docs.size, 3);
});

test('deleting an unrated noodle is not an error', async () => {
  const c = catalogue();
  c.packages.docs.set(SHIN, { id: SHIN, name: 'Shin Ramyun Black' });
  ['ann', 'bo', 'cai'].forEach(u => c.ratings.docs.delete(`${u}_${SHIN}`));

  const result = await c.deleteNoodle(SHIN);

  assert.equal(result.found, true);
  assert.equal(result.ratingsRemoved, 0);
  assert.equal(c.packages.docs.has(SHIN), false);
});

test('deleting is safe to repeat', async () => {
  // A double-tapped Delete, or a retried request: the second pass finds the
  // catalogue row gone and reports it rather than throwing on the 404s.
  const c = catalogue();
  await c.deleteNoodle(SHIN);

  const again = await c.deleteNoodle(SHIN);

  assert.equal(again.found, false);
});

test('a failure sweeping ratings does not resurrect the noodle', async () => {
  // The order matters: catalogue row first, so an interrupted delete leaves
  // orphaned scores behind a noodle that is already gone — not a live noodle
  // whose ratings have been destroyed.
  const c = catalogue();
  c.ratings.failures.delete.push(Object.assign(new Error('throttled'), { code: 429 }));

  await assert.rejects(() => c.deleteNoodle(SHIN), (err) => err.code === 429);

  assert.equal(c.packages.docs.has(SHIN), false, 'the catalogue row went first');
});

test('the noodle of the day is the same all day and for everyone', async () => {
  const c = catalogue();

  const first = await c.noodleOfTheDay('2026-08-31');
  const second = await c.noodleOfTheDay('2026-08-31');

  assert.equal(first.id, second.id);
  assert.ok([SHIN, OTHER].includes(first.id));
});

test('the noodle of the day is picked from the sorted catalogue', async () => {
  // Cosmos promises nothing about the order of an unsorted query, so the pick
  // is made against ids sorted here. 20260831 % 2 === 1, and OTHER sorts second.
  const c = catalogue();

  const noodle = await c.noodleOfTheDay('2026-08-31');

  assert.equal(noodle.id, OTHER);
  assert.equal((await c.noodleOfTheDay('2026-08-30')).id, SHIN, 'the day before is the other one');
});

test('the noodle of the day returns the whole document, not the projection', async () => {
  // The query reads ids and names only; the winner is then point-read, or the
  // card would render with no price and no image.
  const c = catalogue();

  const noodle = await c.noodleOfTheDay('2026-08-30');

  assert.equal(noodle.name, 'Shin Ramyun Black');
  assert.ok('_etag' in noodle, 'came from a read of the stored document');
});

test('the noodle of the day skips records that cannot render', async () => {
  // A record with no name blanked the home page on the day the seed landed on
  // it. Only Buldak is nameable here, so it wins every day.
  const c = catalogue();
  c.packages.docs.set(SHIN, { id: SHIN, name: '   ', _etag: 'e' });

  for (const day of ['2026-08-30', '2026-08-31', '2026-09-01']) {
    assert.equal((await c.noodleOfTheDay(day)).id, OTHER, day);
  }
});

test('an empty catalogue has no noodle of the day', async () => {
  const c = catalogue();
  c.packages.docs.clear();

  assert.equal(await c.noodleOfTheDay('2026-08-31'), null);
});

test('seedFor reads a date key, and falls back when it cannot', () => {
  assert.equal(seedFor('2026-08-31'), 20260831);
  assert.equal(seedFor('2026-01-01'), 20260101);
  // Junk from a query string must not throw or produce NaN, which would index
  // the candidate array with undefined.
  for (const junk of ['', 'today', '2026-8-31', null, undefined, '../etc']) {
    const seed = seedFor(junk);
    assert.ok(Number.isInteger(seed) && seed > 20000000, `${junk} fell back to a real date`);
  }
});
