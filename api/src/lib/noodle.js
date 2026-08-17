const DEFAULT_RATING = 3;
const DEFAULT_SPICY = 3;

// The add form submits 0 when no star is selected, so 0 means "not entered"
// rather than a real score. Fall back to the middle of the scale so every
// noodle seeds a usable aggregate.
function score(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function withRatingDefaults(noodle) {
  return {
    ...noodle,
    rating: score(noodle.rating, DEFAULT_RATING),
    spicy: score(noodle.spicy, DEFAULT_SPICY)
  };
}

module.exports = { withRatingDefaults };
