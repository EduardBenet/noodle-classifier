const test = require('node:test');
const assert = require('node:assert/strict');

const { splitScores, normaliseId, pickEditable, EDITABLE_FIELDS } = require('../src/lib/noodle');

test('splitScores keeps the scores out of the stored document', () => {
  // A rating is an opinion and belongs in the ratings container. The document
  // used to carry the owner's score as well, which is what made an un-rated
  // noodle still show the score its only rater had just removed.
  const { facts, rating, spicy } = splitScores({
    id: '123', name: 'Shin', price: 2.5, rating: 4, spicy: 2
  });

  assert.deepEqual(facts, { id: '123', name: 'Shin', price: 2.5 });
  assert.equal('rating' in facts, false);
  assert.equal('spicy' in facts, false);
  assert.equal(rating, 4);
  assert.equal(spicy, 2);
});

test('splitScores reports a zero spice rather than losing it', () => {
  // Zero is a real spice level, so it has to survive the split as itself and
  // not as "nothing was entered".
  const { spicy } = splitScores({ name: 'Shin', spicy: 0 });
  assert.equal(spicy, 0);
});

test('splitScores on a body with no scores leaves them undefined', () => {
  // Blank pickers mean the noodle is unrated — no score is invented here, and
  // the caller writes no rating row.
  const { facts, rating, spicy } = splitScores({ id: '123', name: 'Shin' });

  assert.deepEqual(facts, { id: '123', name: 'Shin' });
  assert.equal(rating, undefined);
  assert.equal(spicy, undefined);
});

test('splitScores tolerates an empty body', () => {
  assert.deepEqual(splitScores(), { facts: {}, rating: undefined, spicy: undefined });
});

test('normaliseId trims, stringifies, and rejects junk', () => {
  // A document with no id is unreachable: Cosmos mints a GUID and no barcode
  // lookup can ever find the row. One reached production and blanked the home
  // page, so the falsy cases matter as much as the happy one.
  assert.equal(normaliseId(' 123 '), '123');
  assert.equal(normaliseId(8801043032155), '8801043032155');
  assert.equal(normaliseId(''), '');
  assert.equal(normaliseId('   '), '');
  assert.equal(normaliseId(null), '');
  assert.equal(normaliseId(undefined), '');
  assert.equal(normaliseId({}), '');
  assert.equal(normaliseId(['123']), '');
});

test('pickEditable drops everything outside the whitelist', () => {
  const proposed = pickEditable({
    name: 'Shin Ramyun',
    price: 2.99,
    id: 'a-different-barcode',
    rating: 5,
    spicy: 5,
    deleted: true,
    _etag: 'forged'
  });

  assert.deepEqual(proposed, { name: 'Shin Ramyun', price: 2.99 });
  // Spelled out: these three are the ones a non-owner must never be able to
  // set through an edit suggestion.
  assert.equal('id' in proposed, false);
  assert.equal('rating' in proposed, false);
  assert.equal('spicy' in proposed, false);
});

test('pickEditable omits fields that were not supplied', () => {
  assert.deepEqual(pickEditable({ name: 'Shin' }), { name: 'Shin' });
  assert.deepEqual(pickEditable({}), {});
  assert.deepEqual(pickEditable(), {});
});

test('pickEditable passes every whitelisted field through', () => {
  const all = Object.fromEntries(EDITABLE_FIELDS.map((field, i) => [field, `v${i}`]));
  assert.deepEqual(pickEditable(all), all);
});
