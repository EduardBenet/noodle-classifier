// Collection stats. Every number here is computed by /api/stats — this page
// used to download the whole catalogue and reduce it to twenty figures in the
// browser, which meant shipping every description and image URL to render none
// of them.

function statsError(message) {
  const grid = document.getElementById('stats-grid');
  const note = document.createElement('p');
  note.className = 'list-empty';
  note.textContent = message;
  grid.replaceWith(note);
}

const fmt = (n) => (n == null ? '—' : n.toFixed(1));
const money = (n) => (n == null ? '—' : `£${n.toFixed(2)}`);

function renderSummary(stats) {
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-avg-rating').textContent = `${fmt(stats.avgRating)} ★`;
  document.getElementById('stat-avg-spice').textContent = `${fmt(stats.avgSpicy)} 🌶️`;
  document.getElementById('stat-avg-price').textContent = money(stats.avgPrice);
  document.getElementById('stat-price-range').textContent =
    stats.minPrice == null ? '—' : `${money(stats.minPrice)} – ${money(stats.maxPrice)}`;
  document.getElementById('stat-soup').textContent = `${stats.soup} / ${stats.dry}`;
}

function renderDistribution(distribution) {
  const host = document.getElementById('rating-dist');
  const maxCount = Math.max(...distribution.map(d => d.count), 0);

  // Five down to one: the best row sits at the top, as it reads on the page.
  [...distribution].reverse().forEach(({ stars, count }) => {
    const row = document.createElement('div');
    row.className = 'dist-row';

    const label = document.createElement('span');
    label.className = 'dist-label';
    label.textContent = '★'.repeat(stars);

    const barWrap = document.createElement('div');
    barWrap.className = 'dist-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    bar.style.width = maxCount ? `${(count / maxCount) * 100}%` : '0%';
    barWrap.appendChild(bar);

    const countEl = document.createElement('span');
    countEl.className = 'dist-count';
    countEl.textContent = count;

    row.append(label, barWrap, countEl);
    host.appendChild(row);
  });
}

function renderBrands(topBrands) {
  const host = document.getElementById('top-brands');
  topBrands.forEach(({ brand, count }) => {
    const row = document.createElement('div');
    row.className = 'brand-row';

    const name = document.createElement('span');
    name.textContent = brand;

    const cnt = document.createElement('span');
    cnt.className = 'brand-count';
    cnt.textContent = `${count} noodle${count !== 1 ? 's' : ''}`;

    row.append(name, cnt);
    host.appendChild(row);
  });
}

function renderHighlights(highlights) {
  const host = document.getElementById('highlights');

  highlights.forEach(({ label, noodle }) => {
    const section = document.createElement('div');
    section.className = 'highlight-card';
    section.style.cursor = 'pointer';
    section.addEventListener('click', () => showNoodleOverlay(noodle));

    const heading = document.createElement('div');
    heading.className = 'highlight-label';
    heading.textContent = label;

    const img = document.createElement('img');
    img.src = noodle.image;
    img.alt = noodle.name;
    img.loading = 'lazy';

    const name = document.createElement('strong');
    name.textContent = noodle.name;

    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = `(${noodle.brand})`;

    const meta = document.createElement('div');
    meta.className = 'rating-spice-row';
    meta.innerHTML = ratingSpiceHTML(communityRating(noodle), communitySpicy(noodle), noodle.ratingCount);
    wireScoreTips(meta);

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = typeof noodle.price === 'number' ? `£${noodle.price.toFixed(2)}` : '—';

    section.append(heading, img, name, ' ', brand, meta, price);
    host.appendChild(section);
  });
}

// Deleting a noodle moves every figure on this page at once, so it is rebuilt
// rather than patched.
window.noodleRemoved = () => location.reload();

window.addEventListener('DOMContentLoaded', async () => {
  let stats;
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error(`/api/stats responded ${res.status}`);
    stats = await res.json();
  } catch (err) {
    console.error('[profile] could not load the stats:', err);
    statsError('Could not load the collection stats.');
    return;
  }

  if (!stats.total) {
    statsError('Nothing in the index yet — add a noodle and the numbers appear here.');
    return;
  }

  renderSummary(stats);
  renderDistribution(stats.distribution);
  renderBrands(stats.topBrands);
  renderHighlights(stats.highlights);
});
