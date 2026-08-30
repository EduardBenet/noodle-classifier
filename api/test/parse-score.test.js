const test = require('node:test');
const assert = require('node:assert/strict');

const { parseScore, RATING_MIN, SPICY_MIN } = require('../src/lib/rating');

test('parseScore rejects values that coerce to a number but are not one', () => {
  // Every one of these is 0 after Number(), and 0 is a valid spice level — so
  // without the type check ahead of the coercion, a missing or junk value is
  // silently recorded as somebody's deliberate "not spicy".
  for (const junk of [null, undefined, '', '   ', false, true, [], {}, NaN]) {
    assert.equal(parseScore(junk, SPICY_MIN), null, `${JSON.stringify(junk)} is not a score`);
  }
});

test('parseScore accepts whole numbers as number or string', () => {
  assert.equal(parseScore(4, RATING_MIN), 4);
  assert.equal(parseScore('4', RATING_MIN), 4);
  assert.equal(parseScore(' 4 ', RATING_MIN), 4);
});

test('parseScore rejects fractions', () => {
  assert.equal(parseScore(3.5, RATING_MIN), null);
  assert.equal(parseScore('3.5', RATING_MIN), null);
});

test('parseScore honours each field own minimum', () => {
  // Spice runs 0-5 because "no heat at all" is a real answer; stars run 1-5
  // because zero is not a rating.
  assert.equal(parseScore(0, SPICY_MIN), 0);
  assert.equal(parseScore(0, RATING_MIN), null);
});

test('parseScore bounds the top end', () => {
  // An out-of-range value would skew the community average permanently: the UI
  // meter clamps, so it would look merely maxed out and could never come back.
  assert.equal(parseScore(5, RATING_MIN), 5);
  assert.equal(parseScore(6, RATING_MIN), null);
  assert.equal(parseScore(-1, SPICY_MIN), null);
  assert.equal(parseScore(Infinity, RATING_MIN), null);
});
