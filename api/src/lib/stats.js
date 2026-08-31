const cosmos = require('./cosmos');

const HIGHLIGHT_COUNT = 3;
const TOP_BRANDS = 5;

const round2 = (n) => Math.round(n * 100) / 100;
const avg = (values) => (values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null);

// A noodle nobody has rated has no opinion to average in. Counting it as zero
// would drag every figure on the page down and file it under "worst rated",
// which is a judgement no one has made.
const isRated = (n) => (n.ratingCount ?? 0) > 0;
const isPriced = (n) => typeof n.price === 'number' && Number.isFinite(n.price);

// The profile page's numbers, computed where the data is.
//
// One projected scan, not a handful of aggregate queries. COUNT, AVG and MIN
// each cost their own pass over the container, so eight of them would be eight
// scans where this is one — the saving here is the payload and the client's
// work, not the RUs. The page used to download the entire catalogue,
// descriptions and image URLs included, to reduce it to twenty numbers in the
// browser; this returns the twenty numbers.
function createStatsOps(stores) {
  async function catalogueStats() {
    const { resources: rows } = await stores.packages.items.query({
      query: 'SELECT c.id, c.name, c.brand, c.price, c.hasSoup, '
        + 'c.avgRating, c.avgSpicy, c.ratingCount FROM c'
    }).fetchAll();

    const rated = rows.filter(isRated);
    const priced = rows.filter(isPriced).map(n => n.price);

    // Community averages are fractional, so a noodle sits in the bucket its
    // average rounds to. 1 to 5, because a rating below one star is not a
    // rating anyone can give.
    const distribution = [1, 2, 3, 4, 5].map(stars => ({
      stars,
      count: rated.filter(n => Math.min(5, Math.max(1, Math.round(n.avgRating))) === stars).length
    }));

    const brandCounts = new Map();
    for (const { brand } of rows) {
      if (!brand) continue;
      brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
    }
    const topBrands = [...brandCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_BRANDS)
      .map(([brand, count]) => ({ brand, count }));

    // Ties are broken the way the page used to break them, so the highlights do
    // not change character now that they are chosen here.
    const best = [...rated].sort((a, b) => b.avgRating - a.avgRating || a.avgSpicy - b.avgSpicy)[0];
    const spiciest = [...rated].sort((a, b) => b.avgSpicy - a.avgSpicy || b.avgRating - a.avgRating)[0];
    const value = [...rated.filter(isPriced)].sort((a, b) => a.price - b.price || b.avgRating - a.avgRating)[0];

    const highlights = [
      { label: 'Highest rated', id: best?.id },
      { label: 'Spiciest', id: spiciest?.id },
      { label: 'Best value', id: value?.id }
    ].filter(h => h.id);

    // The projection has no description or image, and the highlight cards need
    // both — so the three winners are read in full. Three point reads, not a
    // second scan.
    const cards = await Promise.all(highlights.map(async ({ label, id }) => {
      const { resource } = await stores.packages.item(id, id).read().catch(() => ({}));
      return resource ? { label, noodle: resource } : null;
    }));

    return {
      total: rows.length,
      rated: rated.length,
      avgRating: avg(rated.map(n => n.avgRating)),
      avgSpicy: avg(rated.map(n => n.avgSpicy)),
      avgPrice: avg(priced),
      minPrice: priced.length ? Math.min(...priced) : null,
      maxPrice: priced.length ? Math.max(...priced) : null,
      soup: rows.filter(n => n.hasSoup).length,
      dry: rows.filter(n => !n.hasSoup).length,
      distribution,
      topBrands,
      highlights: cards.filter(Boolean).slice(0, HIGHLIGHT_COUNT)
    };
  }

  return { catalogueStats };
}

const { catalogueStats } = createStatsOps(cosmos);

module.exports = { catalogueStats, createStatsOps };
