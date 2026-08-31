const cosmos = require('./cosmos');

const MAX_RETRIES = 3;
const { RATING_MIN, SPICY_MIN, SCORE_MAX } = require('./noodle');

// Scores come straight off a form, so coerce and bound them. An out-of-range
// value would skew the community average permanently — the UI meter clamps, so
// it would look merely "maxed out" and could never be pulled back down.
// `min` differs per field: spice accepts 0, stars start at 1.
function parseScore(value, min) {
  // Type-check before coercing. `Number(null)`, `Number('')`, `Number(false)`
  // and `Number([])` are all 0, which is a valid spice level — so without this
  // a missing or junk value silently becomes a deliberate "not spicy" and gets
  // recorded as somebody's rating. (`true` would likewise become 1.)
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > SCORE_MAX) return null;
  return n;
}

const round2 = (n) => Math.round(n * 100) / 100;

// The aggregate stores running SUMS, and the averages beside them are derived
// for display. Deriving the other way — recovering a sum from a 2-decimal
// average, as this used to — loses a little on every write, so rating,
// un-rating and re-rating the same noodle left the average a hundredth or two
// from where it started, permanently and cumulatively.
//
// Rows written before the sums existed are reconstructed from the average and
// rounded to a whole number. Every score is an integer, so the true sum is an
// integer too: the rounding lands on it exactly, and pulls out whatever drift
// the old arithmetic had already accumulated, as long as it was under 0.5.
function sumsOf(agg) {
  if (!agg?.ratingCount) return { sumRating: 0, sumSpicy: 0 };
  return {
    sumRating: agg.sumRating ?? Math.round(agg.avgRating * agg.ratingCount),
    sumSpicy: agg.sumSpicy ?? Math.round(agg.avgSpicy * agg.ratingCount)
  };
}

// One place where the stored scores are built, so the derived averages can
// never disagree with the sums they come from. These five fields live on the
// noodle document itself.
function scoresOf(sumRating, sumSpicy, ratingCount) {
  return {
    avgRating: round2(sumRating / ratingCount),
    avgSpicy: round2(sumSpicy / ratingCount),
    ratingCount,
    sumRating,
    sumSpicy
  };
}

// What a noodle nobody has rated carries. Nulls rather than absent keys: the
// fields have to be written to clear them, and the client reads a null the same
// way it reads a missing one.
const NO_SCORES = {
  avgRating: null, avgSpicy: null, ratingCount: null, sumRating: null, sumSpicy: null
};

// The community scores now live on the noodle document, which means any write
// that replaces that document wholesale — the owner editing a noodle, an
// approval republishing one — would take the scores with it. Under the old
// split they sat in another container and survived by accident.
//
// Every score field is carried across explicitly, nulls included: a cleared
// score is a deliberate "nobody has rated this", not a missing value to be
// filled in.
const SCORE_FIELDS = ['avgRating', 'avgSpicy', 'ratingCount', 'sumRating', 'sumSpicy'];

function keepScores(existing, incoming) {
  const kept = { ...incoming };
  for (const field of SCORE_FIELDS) {
    if (existing?.[field] !== undefined) kept[field] = existing[field];
  }
  return kept;
}

// The two aggregate writers, over whatever containers they are handed. The
// live pair is bound at the bottom of this file; the tests bind fakes, which
// is the only way to exercise the retry and last-rating paths without a
// Cosmos account.
//
// `stores` is read at call time, never destructured here: the live object
// builds its client lazily on first property access, and destructuring would
// pull that forward to import time.
function createRatingOps(stores) {
  // Single place where a rating and its community aggregate are updated together.
  // Used by POST /api/ratings, by the owner adding or editing a noodle, and by
  // submission approval, so the concurrency handling lives in one place.
  async function applyRating({ userId, noodleId, rating, spicy }) {
    const ratingId = `${userId}_${noodleId}`;

    // Read the caller's existing rating ONCE, outside the retry loop. Re-reading
    // it per attempt is what made a lost etag race silently drop the rating: the
    // retry would see the row this call had just written, treat a brand-new
    // rating as an edit, and leave the average and count untouched.
    // `ratings` uses a hierarchical partition key (/userId, /noodleId), so a
    // point read needs both levels as an array — a scalar would not resolve.
    const existingRating =
      (await stores.ratings.item(ratingId, [userId, noodleId]).read().catch(() => null))?.resource ?? null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // The scores live on the noodle now, so this reads the document being
      // scored. Every caller writes the noodle before rating it — POST, PUT and
      // queue approval all do, in that order — so a missing one is a bug worth
      // surfacing, rather than the scores floating free of any catalogue entry,
      // which is what a separate container allowed.
      const noodle =
        (await stores.packages.item(noodleId, noodleId).read().catch(() => null))?.resource ?? null;
      if (!noodle) throw Object.assign(new Error(`no noodle ${noodleId} to rate`), { code: 404 });

      const { sumRating, sumSpicy } = sumsOf(noodle);

      let scores;
      if (!noodle.ratingCount) {
        scores = scoresOf(rating, spicy, 1);
      } else if (existingRating) {
        // Replacing this user's previous score: count is unchanged.
        scores = scoresOf(
          sumRating - existingRating.rating + rating,
          sumSpicy - existingRating.spicy + spicy,
          noodle.ratingCount
        );
      } else {
        scores = scoresOf(sumRating + rating, sumSpicy + spicy, noodle.ratingCount + 1);
      }

      // Store the rating before the noodle: the upsert is idempotent, while the
      // scored write is the one that can lose a race and be retried.
      await stores.ratings.items.upsert({
        id: ratingId, userId, noodleId, rating, spicy, ratedAt: new Date().toISOString()
      });

      try {
        // Spread over the document just read, so a field the owner edited in
        // the same moment survives — and IfMatch turns that collision into a
        // retry rather than a silent overwrite. This is the one thing the
        // separate container gave for free.
        await stores.packages.item(noodleId, noodleId).replace(
          { ...noodle, ...scores },
          { accessCondition: { type: 'IfMatch', condition: noodle._etag } }
        );
        return { id: noodleId, ...scores };
      } catch (err) {
        if ((err.code === 409 || err.code === 412) && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }
  }

  // The inverse of applyRating: take one user's score back out of the aggregate.
  // Returns { removed, aggregate } — `removed: false` when the caller had no
  // rating on this noodle (a 404 for the endpoint, not an error), and a null
  // aggregate when that was the last rating and the row was dropped.
  //
  // Same shape as applyRating deliberately: the rating row is written first
  // because it is idempotent, the aggregate second because it is the write that
  // can lose a race and be retried. The existing rating is read ONCE, outside the
  // loop — a re-read on retry would find the row this call just deleted and take
  // the "nothing to remove" exit, leaving the aggregate still counting a rating
  // that no longer exists.
  async function unapplyRating({ userId, noodleId }) {
    const ratingId = `${userId}_${noodleId}`;
    const existing =
      (await stores.ratings.item(ratingId, [userId, noodleId]).read().catch(() => null))?.resource ?? null;
    if (!existing) return { removed: false, aggregate: null };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const noodle =
        (await stores.packages.item(noodleId, noodleId).read().catch(() => null))?.resource ?? null;

      // 404 tolerated: on a retry this row is already gone.
      await stores.ratings.item(ratingId, [userId, noodleId]).delete().catch(err => {
        if (err.code !== 404) throw err;
      });

      // The noodle was deleted from under this rating. Removing the row is all
      // that was asked for, and there is nothing left to score.
      if (!noodle) return { removed: true, aggregate: null };

      const count = (noodle.ratingCount ?? 1) - 1;
      const { sumRating, sumSpicy } = sumsOf(noodle);

      // The last rating: clear the scores rather than store an average of
      // nothing, which would read as "rated 0.0 by nobody".
      const scores = count <= 0
        ? NO_SCORES
        : scoresOf(sumRating - existing.rating, sumSpicy - existing.spicy, count);

      try {
        await stores.packages.item(noodleId, noodleId).replace(
          { ...noodle, ...scores },
          { accessCondition: { type: 'IfMatch', condition: noodle._etag } }
        );
        return { removed: true, aggregate: count <= 0 ? null : { id: noodleId, ...scores } };
      } catch (err) {
        if ((err.code === 409 || err.code === 412) && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }
  }

  return { applyRating, unapplyRating };
}

const { applyRating, unapplyRating } = createRatingOps(cosmos);

module.exports = {
  applyRating, unapplyRating, createRatingOps,
  sumsOf, scoresOf, NO_SCORES, keepScores, SCORE_FIELDS, parseScore,
  RATING_MIN, SPICY_MIN, SCORE_MAX
};
