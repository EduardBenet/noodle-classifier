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

// The barcode IS the partition key and the primary key, so a document without
// one is unreachable: Cosmos mints a GUID, no barcode lookup can ever find the
// row, and its ratings key to an id nobody can type. One such record already
// reached production and blanked the home page on the day the noodle-of-the-day
// seed landed on it.
//
// The forms mark the field `required`, but that is a client-side hint the API
// must not trust — a stale page, a bypassed dialog handler, or any hand-rolled
// request skips it entirely. Trimmed, because " 123 " and "123" would otherwise
// be two different noodles.
function normaliseId(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

// The factual fields a non-owner may propose changing on an existing noodle.
// Deliberately excludes `id` (a different barcode is a different noodle, not an
// edit) and `rating`/`spicy` (an opinion, not a fact — those go through the
// rating widget, which every signed-in user already has).
const EDITABLE_FIELDS = ['name', 'brand', 'price', 'description', 'keywords', 'hasSoup', 'image'];

// Whitelist rather than spread: an edit suggestion is written by a non-owner,
// so anything not named here — id, rating, spicy, or a field invented by a
// hand-rolled request — must not survive into the stored document.
function pickEditable(noodle = {}) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (noodle[field] !== undefined) out[field] = noodle[field];
  }
  return out;
}

module.exports = {
  withRatingDefaults, normaliseId, pickEditable, EDITABLE_FIELDS,
  RATING_MIN, SPICY_MIN, SCORE_MAX
};
