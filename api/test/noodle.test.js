const test = require('node:test');
const assert = require('node:assert/strict');

const { withRatingDefaults, normaliseId, pickEditable, EDITABLE_FIELDS } = require('../src/lib/noodle');

test('withRatingDefaults keeps a stored zero spice', () => {
  // The trap this guards: Number('') and Number(null) are 0, and 0 is a real
  // spice level. Treating "unset" as falsy would rewrite every not-spicy
  // noodle to medium.
  assert.equal(withRatingDefaults({ spicy: 0 }).spicy, 0);
  assert.equal(withRatingDefaults({ spicy: '0' }).spicy, 0);
});

test('withRatingDefaults fills only absent or out-of-range scores', () => {
  assert.equal(withRatingDefaults({}).rating, 3);
  assert.equal(withRatingDefaults({}).spicy, 3);
  assert.equal(withRatingDefaults({ rating: null }).rating, 3);
  assert.equal(withRatingDefaults({ rating: '' }).rating, 3);
  assert.equal(withRatingDefaults({ rating: 9 }).rating, 3, 'above the max is not a score');
  assert.equal(withRatingDefaults({ rating: 0 }).rating, 3, 'stars start at 1, so 0 is not a score');
  assert.equal(withRatingDefaults({ rating: 5 }).rating, 5);
});

test('withRatingDefaults leaves every other field alone', () => {
  const noodle = { id: '123', name: 'Shin', price: 2.5, hasSoup: true };
  assert.deepEqual(withRatingDefaults(noodle), { ...noodle, rating: 3, spicy: 3 });
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
