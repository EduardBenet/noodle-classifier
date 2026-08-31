const test = require('node:test');
const assert = require('node:assert/strict');

const { createStatsOps } = require('../src/lib/stats');
const { fakeContainer } = require('./fake-cosmos');

// Four noodles: three rated, one not. The unrated one is the point of most of
// these tests — under the old model it carried a defaulted 3 and was
// indistinguishable from a noodle three people had agreed was middling.
function shop() {
  const packages = fakeContainer([
    { id: 'a', name: 'Shin Black', brand: 'Nongshim', price: 3.50, hasSoup: true, description: 'rich', image: 'a.jpg', avgRating: 5, avgSpicy: 3, ratingCount: 4 },
    { id: 'b', name: 'Buldak 2x', brand: 'Samyang', price: 2.00, hasSoup: false, description: 'hot', image: 'b.jpg', avgRating: 4, avgSpicy: 5, ratingCount: 2 },
    { id: 'c', name: 'Chapagetti', brand: 'Nongshim', price: 1.50, hasSoup: false, description: 'sweet', image: 'c.jpg', avgRating: 3, avgSpicy: 1, ratingCount: 1 },
    { id: 'd', name: 'Unrated One', brand: 'Maruchan', price: 5.00, hasSoup: true, description: 'new', image: 'd.jpg' }
  ]);
  return { packages, ...createStatsOps({ packages }) };
}

test('the total counts every noodle, rated or not', async () => {
  const stats = await shop().catalogueStats();
  assert.equal(stats.total, 4);
  assert.equal(stats.rated, 3);
});

test('averages ignore noodles nobody has rated', async () => {
  // (5 + 4 + 3) / 3, not / 4. Counting the unrated one as a zero would drag
  // the figure down for a score no one has given.
  const stats = await shop().catalogueStats();
  assert.equal(stats.avgRating, 4);
  assert.equal(stats.avgSpicy, 3);
});

test('price figures cover every noodle, because a price is a fact', async () => {
  const stats = await shop().catalogueStats();
  assert.equal(stats.avgPrice, 3);
  assert.equal(stats.minPrice, 1.5);
  assert.equal(stats.maxPrice, 5);
});

test('the soup split accounts for all of them', async () => {
  const stats = await shop().catalogueStats();
  assert.equal(stats.soup + stats.dry, stats.total);
  assert.equal(stats.soup, 2);
});

test('the distribution buckets by rounded average and omits the unrated', async () => {
  const stats = await shop().catalogueStats();
  const counts = Object.fromEntries(stats.distribution.map(d => [d.stars, d.count]));

  assert.deepEqual(counts, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
  assert.equal(stats.distribution.reduce((n, d) => n + d.count, 0), stats.rated);
});

test('top brands counts every noodle and is ordered', async () => {
  const stats = await shop().catalogueStats();
  assert.deepEqual(stats.topBrands[0], { brand: 'Nongshim', count: 2 });
  assert.equal(stats.topBrands.length, 3);
});

test('highlights name the right noodles', async () => {
  const stats = await shop().catalogueStats();
  const byLabel = Object.fromEntries(stats.highlights.map(h => [h.label, h.noodle.id]));

  assert.equal(byLabel['Highest rated'], 'a');
  assert.equal(byLabel['Spiciest'], 'b');
  // Cheapest of the rated ones — the £5 unrated noodle is not "best value"
  // when nobody has said whether it is any good.
  assert.equal(byLabel['Best value'], 'c');
});

test('highlights carry the full document, not the projection', async () => {
  // The projection has no description or image; the cards need both, so the
  // three winners are point-read in full.
  const stats = await shop().catalogueStats();
  const best = stats.highlights.find(h => h.label === 'Highest rated').noodle;

  assert.equal(best.description, 'rich');
  assert.equal(best.image, 'a.jpg');
});

test('a catalogue nobody has rated yet still reports its facts', async () => {
  const packages = fakeContainer([
    { id: 'd', name: 'Unrated One', brand: 'Maruchan', price: 5, hasSoup: true }
  ]);
  const { catalogueStats } = createStatsOps({ packages });

  const stats = await catalogueStats();

  assert.equal(stats.total, 1);
  assert.equal(stats.rated, 0);
  assert.equal(stats.avgRating, null, 'no average to report, rather than 0.0');
  assert.equal(stats.avgPrice, 5);
  assert.deepEqual(stats.highlights, [], 'nothing to highlight yet');
});

test('an empty catalogue reports zeroes and nulls, not a crash', async () => {
  const { catalogueStats } = createStatsOps({ packages: fakeContainer([]) });

  const stats = await catalogueStats();

  assert.equal(stats.total, 0);
  assert.equal(stats.avgPrice, null);
  assert.equal(stats.minPrice, null);
  assert.deepEqual(stats.topBrands, []);
});
