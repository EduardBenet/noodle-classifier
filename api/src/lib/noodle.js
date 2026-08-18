const DEFAULT_RATING = 3;
const DEFAULT_SPICY = 3;

// Spice runs 0-5: zero is a real level, a noodle with no heat at all.
// Stars run 1-5, where zero is not a meaningful score.
const RATING_MIN = 1;
const SPICY_MIN = 0;
const SCORE_MAX = 5;

// Only an absent or out-of-range value counts as "never entered". Treating a
// stored 0 as unset would silently rewrite every not-spicy noodle to medium.
function score(value, fallback, min) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= SCORE_MAX ? n : fallback;
}

function withRatingDefaults(noodle) {
  return {
    ...noodle,
    rating: score(noodle.rating, DEFAULT_RATING, RATING_MIN),
    spicy: score(noodle.spicy, DEFAULT_SPICY, SPICY_MIN)
  };
}

module.exports = { withRatingDefaults, RATING_MIN, SPICY_MIN, SCORE_MAX };
