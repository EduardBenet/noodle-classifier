// The caller's own rated noodles. /api/ratings returns each noodle already
// joined with its aggregate plus myRating/mySpicy.
//
// Two views, two fetches. "Recently rated" is a peek at what you scored last,
// so it asks the API for just those (?limit=) and never pulls the history.
// Every other sort needs the whole list, which is fetched once, cached, and
// then paged so a long history does not render as one endless column.

const RECENT_LIMIT = 5;
const PAGE_SIZE = 10;

let recentNoodles = null;   // last RECENT_LIMIT by ratedAt, or null until fetched
let allNoodles = null;      // whole history, or null until someone asks for it
let shown = PAGE_SIZE;
let searchTerm = '';        // lower-cased; filters whatever the sort shows      // how far into the full list the reader has paged

function myScoreHTML(noodle) {
  return `
    <span class="my-score-label">You</span>
    <span class="stars has-tip" ${scoreTipAttrs(`Your rating: ${formatScore(noodle.myRating)} out of 5`)}>${meterHTML(noodle.myRating, '★')}</span>
    <span class="spice has-tip" ${scoreTipAttrs(`Your spice: ${formatScore(noodle.mySpicy)} out of 5`)}>${meterHTML(noodle.mySpicy, '🌶️')}</span>
  `;
}

// Same three fields as the main list's search.
function matches(noodle, term) {
  return `${noodle.name ?? ''} ${noodle.brand ?? ''} ${noodle.id ?? ''}`.toLowerCase().includes(term);
}

function currentSort() {
  return document.getElementById('sort-by')?.value ?? 'ratedAt-desc';
}

async function fetchRatings(limit) {
  try {
    const res = await fetch(`/api/ratings${limit ? `?limit=${limit}` : ''}`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return [];
  }
}

function sortMine(items, sort) {
  // "All" is the full history in rating order; the rest name their own field.
  const [field, dir] = (sort === 'all' ? 'myRating-desc' : sort).split('-');
  const asc = dir === 'asc';
  return [...items].sort((a, b) => {
    if (field === 'ratedAt') {
      // Rows written before ratedAt existed sort last.
      return (b.ratedAt ?? '').localeCompare(a.ratedAt ?? '');
    }
    const av = a[field] ?? 0, bv = b[field] ?? 0;
    return asc ? av - bv : bv - av;
  });
}

function buildCard(noodle) {
  const card = buildNoodleCard(noodle, { showDescription: true });

  const mine = document.createElement('div');
  mine.className = 'my-score-row';
  mine.innerHTML = myScoreHTML(noodle);
  wireScoreTips(mine);
  card.querySelector('.card-content').append(mine);

  card.addEventListener('click', () => showNoodleOverlay(noodle));
  return card;
}

function footerButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'show-all';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function renderMine() {
  const sort = currentSort();
  // The last-five peek only holds five rows, so a search has to look through
  // the whole history instead — still in recency order, but paged like the rest.
  const recent = sort === 'ratedAt-desc' && !searchTerm;
  const container = document.getElementById('noodle-list');

  if (recent) {
    recentNoodles ??= await fetchRatings(RECENT_LIMIT);
  } else {
    allNoodles ??= await fetchRatings();
  }
  const items = recent ? recentNoodles : allNoodles;

  container.innerHTML = '';
  const found = searchTerm ? items.filter(n => matches(n, searchTerm)) : items;
  document.getElementById('mylist-empty').hidden = items.length > 0;

  if (searchTerm && !found.length && items.length) {
    const note = document.createElement('p');
    note.className = 'list-empty';
    note.textContent = `Nothing in your list matches “${searchTerm}”.`;
    container.appendChild(note);
    return;
  }

  const sorted = sortMine(found, sort);
  const page = recent ? sorted : sorted.slice(0, shown);
  page.forEach(noodle => container.appendChild(buildCard(noodle)));

  if (recent && items.length === RECENT_LIMIT) {
    // A full page of five means there may well be more behind it. Switching the
    // dropdown rather than expanding in place keeps the control honest about
    // what is on screen — and it is the same code path as picking "All".
    container.appendChild(footerButton('Show all rated', () => {
      const select = document.getElementById('sort-by');
      select.value = 'all';
      select.dispatchEvent(new Event('change'));
    }));
  } else if (!recent && sorted.length > page.length) {
    const remaining = sorted.length - page.length;
    container.appendChild(footerButton(`Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} left)`, () => {
      shown += PAGE_SIZE;
      renderMine();
    }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    // A different sort is a fresh question — start at the first page again.
    shown = PAGE_SIZE;
    renderMine();
  });

  document.getElementById('search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    shown = PAGE_SIZE;
    renderMine();
  });

  renderMine();

  // Re-rating from the overlay changes scores here, so both caches are stale.
  window.refreshNoodleCards = () => {
    recentNoodles = null;
    allNoodles = null;
    renderMine();
  };

  // A deleted noodle takes this page's rating of it with it, so the same
  // refetch is the right answer — the row is simply gone from the API's reply.
  window.noodleRemoved = window.refreshNoodleCards;
});
