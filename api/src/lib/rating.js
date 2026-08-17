const { ratings, aggregates } = require('./cosmos');

const MAX_RETRIES = 3;
const SCORE_MIN = 1;
const SCORE_MAX = 5;

// Scores come straight off a form, so coerce and bound them. An out-of-range
// value would skew the community average permanently — the UI meter clamps, so
// it would look merely "maxed out" and could never be pulled back down.
function parseScore(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < SCORE_MIN || n > SCORE_MAX) return null;
  return n;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Single place where a rating and its community aggregate are updated together.
// Used by POST /api/ratings, by the owner adding or editing a noodle, and by
// submission approval, so the concurrency handling lives in one place.
async function applyRating({ userId, noodleId, rating, spicy }) {
  const ratingId = `${userId}_${noodleId}`;

  // Read the caller's existing rating ONCE, outside the retry loop. Re-reading
  // it per attempt is what made a lost etag race silently drop the rating: the
  // retry would see the row this call had just written, treat a brand-new
  // rating as an edit, and leave the average and count untouched.
  const existingRating =
    (await ratings.item(ratingId, userId).read().catch(() => null))?.resource ?? null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existingAgg =
      (await aggregates.item(noodleId, noodleId).read().catch(() => null))?.resource ?? null;

    let avgRating, avgSpicy, ratingCount;
    if (!existingAgg || !existingAgg.ratingCount) {
      avgRating = rating;
      avgSpicy = spicy;
      ratingCount = 1;
    } else if (existingRating) {
      // Replacing this user's previous score: count is unchanged.
      ratingCount = existingAgg.ratingCount;
      avgRating = (existingAgg.avgRating * ratingCount - existingRating.rating + rating) / ratingCount;
      avgSpicy = (existingAgg.avgSpicy * ratingCount - existingRating.spicy + spicy) / ratingCount;
    } else {
      ratingCount = existingAgg.ratingCount + 1;
      avgRating = (existingAgg.avgRating * existingAgg.ratingCount + rating) / ratingCount;
      avgSpicy = (existingAgg.avgSpicy * existingAgg.ratingCount + spicy) / ratingCount;
    }

    const newAgg = {
      id: noodleId,
      avgRating: round2(avgRating),
      avgSpicy: round2(avgSpicy),
      ratingCount
    };

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

module.exports = { applyRating, parseScore, SCORE_MIN, SCORE_MAX };
