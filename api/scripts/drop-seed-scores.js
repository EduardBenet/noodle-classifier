// One-off migration: remove `rating` and `spicy` from the noodle documents.
//
// They were the owner's own score, stored on the product alongside its facts —
// and stored a second time, properly, as a row in `ratings`. Two copies, one of
// which nothing kept in sync. The duplication is what made an unrated noodle
// claim a 3.0 nobody had given it, and what made removing your rating as the
// only rater leave the score you had just deleted still on the card.
//
//   node scripts/drop-seed-scores.js            # report only, writes nothing
//   node scripts/drop-seed-scores.js --apply    # do it
//
// RUN THIS AFTER the code that stops reading those fields is live, not before:
// until then they are the fallback the cards render from, and clearing them
// early would blank every score on the site.
//
// Safe to run more than once — a document with neither field is skipped.
//
// Not destructured: cosmos.js builds its client on first property access, so
// pulling the containers out here would connect before the check below could
// report a missing connection string.
const cosmos = require('../src/lib/cosmos');

const apply = process.argv.includes('--apply');

async function main() {
  if (!process.env.DATABASE_CONNECTION_STRING) {
    throw new Error('DATABASE_CONNECTION_STRING is not set');
  }

  const { resources: noodles } = await cosmos.packages.items
    .query({ query: 'SELECT * FROM c' }).fetchAll();

  console.log(`${noodles.length} noodle(s)${apply ? '' : ' — dry run, nothing will be written'}\n`);

  let cleared = 0;
  let already = 0;
  const unrated = [];

  for (const noodle of noodles) {
    if (noodle.rating === undefined && noodle.spicy === undefined) {
      already++;
      continue;
    }

    // Worth seeing before the fields go: these are the noodles whose only score
    // was the seed, so they will show "Not yet rated" afterwards. That is the
    // truth — nobody rated them — but it is a visible change.
    if (!(noodle.ratingCount > 0)) unrated.push(noodle.name ?? noodle.id);

    console.log(`  clear    ${noodle.id}  ${noodle.name ?? '(unnamed)'}`
      + `  (was rating ${noodle.rating ?? '—'}, spicy ${noodle.spicy ?? '—'})`);

    if (apply) {
      const { rating, spicy, ...facts } = noodle;
      // IfMatch: a noodle written while this runs fails rather than being
      // reverted to what was read. Re-run to finish.
      await cosmos.packages.item(noodle.id, noodle.id).replace(facts, {
        accessCondition: { type: 'IfMatch', condition: noodle._etag }
      });
    }
    cleared++;
  }

  console.log(`\n${apply ? 'cleared' : 'would clear'} ${cleared}, already clean ${already}`);

  if (unrated.length) {
    console.log(`\n${unrated.length} of those have no community rating at all and will show`);
    console.log('"Not yet rated" afterwards:');
    unrated.forEach(name => console.log(`  - ${name}`));
  }

  if (!apply && cleared) console.log('\nre-run with --apply to write these.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
