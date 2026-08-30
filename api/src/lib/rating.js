const { ratings, aggregates } = require('./cosmos');

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

// One place where a stored aggregate is built, so the derived averages can
// never disagree with the sums they come from.
function aggregateOf(noodleId, sumRating, sumSpicy, ratingCount) {
  return {
    id: noodleId,
    avgRating: round2(sumRating / ratingCount),
    avgSpicy: round2(sumSpicy / ratingCount),
    ratingCount,
    sumRating,
    sumSpicy
  };
}

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
    (await ratings.item(ratingId, [userId, noodleId]).read().catch(() => null))?.resource ?? null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existingAgg =
      (await aggregates.item(noodleId, noodleId).read().catch(() => null))?.resource ?? null;

    const { sumRating, sumSpicy } = sumsOf(existingAgg);

    let newAgg;
    if (!existingAgg || !existingAgg.ratingCount) {
      newAgg = aggregateOf(noodleId, rating, spicy, 1);
    } else if (existingRating) {
      // Replacing this user's previous score: count is unchanged.
      newAgg = aggregateOf(
        noodleId,
        sumRating - existingRating.rating + rating,
        sumSpicy - existingRating.spicy + spicy,
        existingAgg.ratingCount
      );
    } else {
      newAgg = aggregateOf(noodleId, sumRating + rating, sumSpicy + spicy, existingAgg.ratingCount + 1);
    }

    // Store the rating before the aggregate: the upsert is idempotent, while
    // the aggregate write is the one that can lose a race and be retried.
    await ratings.items.upsert({
      id: ratingId, userId, noodleId, rating, spicy, ratedAt: new Date().toISOString()
    });

    try {
      if (existingAgg) {
        await aggregates.item(noodleId, noodleId).replace(newAgg, {
          accessCondition: { type: 'IfMatch', condition: existingAgg._etag }
        });
      } else {
        await aggregates.items.create(newAgg);
      }
      return newAgg;
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
    (await ratings.item(ratingId, [userId, noodleId]).read().catch(() => null))?.resource ?? null;
  if (!existing) return { removed: false, aggregate: null };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existingAgg =
      (await aggregates.item(noodleId, noodleId).read().catch(() => null))?.resource ?? null;

    // 404 tolerated: on a retry this row is already gone.
    await ratings.item(ratingId, [userId, noodleId]).delete().catch(err => {
      if (err.code !== 404) throw err;
    });

    const count = (existingAgg?.ratingCount ?? 1) - 1;

    // The last rating: drop the aggregate rather than store an average of
    // nothing. A zeroed row would read as "rated 0.0 by nobody", and the cards
    // fall back to the noodle's own seed score when there is no aggregate.
    if (!existingAgg || count <= 0) {
      try {
        if (existingAgg) {
          await aggregates.item(noodleId, noodleId).delete({
            accessCondition: { type: 'IfMatch', condition: existingAgg._etag }
          });
        }
        return { removed: true, aggregate: null };
      } catch (err) {
        if (err.code === 404) return { removed: true, aggregate: null };
        if (err.code === 412 && attempt < MAX_RETRIES - 1) continue;
        throw err;
      }
    }

    const { sumRating, sumSpicy } = sumsOf(existingAgg);
    const newAgg = aggregateOf(noodleId, sumRating - existing.rating, sumSpicy - existing.spicy, count);

    try {
      await aggregates.item(noodleId, noodleId).replace(newAgg, {
        accessCondition: { type: 'IfMatch', condition: existingAgg._etag }
      });
      return { removed: true, aggregate: newAgg };
    } catch (err) {
      if ((err.code === 409 || err.code === 412) && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }
}

module.exports = { applyRating, unapplyRating, parseScore, RATING_MIN, SPICY_MIN, SCORE_MAX };
