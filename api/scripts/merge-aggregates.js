// One-off migration: copy each aggregate's scores onto its noodle document.
//
// The `aggregates` container held one row per noodle, keyed by the same
// barcode, created and deleted with it — a 1:1 relationship with an identical
// key, which is a field rather than a container. Merging halves the reads on
// the list page and My List, and lets the profile page be answered by a single
// aggregate query instead of downloading the catalogue.
//
//   node scripts/merge-aggregates.js            # report only, writes nothing
//   node scripts/merge-aggregates.js --apply    # do it
//
// Needs DATABASE_CONNECTION_STRING in the environment, the same one the
// Function App uses.
//
// Safe to run more than once: a noodle whose stored scores already match its
// aggregate is skipped, so a re-run after a partial failure only finishes the
// rest. It does not delete the aggregates container — check the site first,
// then drop it by hand.

// Not destructured: cosmos.js exposes its containers as getters that build the
// client on first access, so pulling them out here would connect before the
// check below could report a missing connection string.
const cosmos = require('../src/lib/cosmos');
const { sumsOf, scoresOf } = require('../src/lib/rating');

const apply = process.argv.includes('--apply');

function sameScores(noodle, scores) {
  return ['avgRating', 'avgSpicy', 'ratingCount', 'sumRating', 'sumSpicy']
    .every(field => noodle[field] === scores[field]);
}

async function main() {
  if (!process.env.DATABASE_CONNECTION_STRING) {
    throw new Error('DATABASE_CONNECTION_STRING is not set');
  }

  const { resources: aggs } = await cosmos.aggregates.items.query({ query: 'SELECT * FROM c' }).fetchAll();
  console.log(`${aggs.length} aggregate row(s) to merge${apply ? '' : ' — dry run, nothing will be written'}\n`);

  const counts = { merged: 0, skipped: 0, orphaned: 0, unchanged: 0 };

  for (const agg of aggs) {
    const { resource: noodle } = await cosmos.packages.item(agg.id, agg.id).read().catch(() => ({}));

    if (!noodle) {
      // An aggregate whose noodle is gone — exactly the orphan the old split
      // made possible. Nothing to merge it onto.
      console.log(`  orphan   ${agg.id} — no noodle, aggregate can be dropped`);
      counts.orphaned++;
      continue;
    }

    // Rebuilt through the same helpers the API uses, so a row predating the
    // sums gets them, derived from its rounded average and rounded back to the
    // whole number every score actually is.
    const { sumRating, sumSpicy } = sumsOf(agg);
    const scores = agg.ratingCount ? scoresOf(sumRating, sumSpicy, agg.ratingCount) : null;

    if (!scores) {
      console.log(`  empty    ${agg.id} — aggregate has no ratings, nothing to copy`);
      counts.skipped++;
      continue;
    }

    if (sameScores(noodle, scores)) {
      counts.unchanged++;
      continue;
    }

    console.log(
      `  merge    ${agg.id}  ${noodle.name ?? '(unnamed)'} — `
      + `${scores.avgRating} stars, ${scores.avgSpicy} spice, ${scores.ratingCount} rating(s)`
    );

    if (apply) {
      // IfMatch: if anything writes this noodle while the migration runs, the
      // replace fails rather than reverting that write. Re-run to finish.
      await cosmos.packages.item(agg.id, agg.id).replace(
        { ...noodle, ...scores },
        { accessCondition: { type: 'IfMatch', condition: noodle._etag } }
      );
    }
    counts.merged++;
  }

  console.log(
    `\n${apply ? 'merged' : 'would merge'} ${counts.merged}, `
    + `already current ${counts.unchanged}, empty ${counts.skipped}, orphaned ${counts.orphaned}`
  );

  if (!apply && counts.merged) console.log('\nre-run with --apply to write these.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
