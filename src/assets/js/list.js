let allNoodles = [];
let currentPage = 1;
// '' when nothing is being searched for. The catalogue is already in memory,
// so this is a filter over it rather than a query — see matches() below.
let searchTerm = '';
let loadFailed = false;
const PAGE_SIZE = 10;

async function list() {
  try {
    const response = await fetch("/api/noodles");
    if (!response.ok) throw new Error(response.status);
    allNoodles = await response.json();
  } catch {
    allNoodles = [];
    loadFailed = true;
  }
  currentPage = 1;
  render();

  const params = new URLSearchParams(location.search);

  // `?search=` still honoured for links made before `?id=` existed.
  const term = params.get('search');
  if (term) {
    const input = document.getElementById('search');
    input.value = term;
    input.dispatchEvent(new Event('input'));
  }

  // `?id=` is the shared link to one noodle (the overlay's share button builds
  // it): show the list, then open that noodle on top of it.
  const id = params.get('id');
  if (id) openSharedNoodle(id);
}

async function openSharedNoodle(id) {
  let noodle = allNoodles.find(n => n.id === id);
  if (!noodle) {
    // Not in the catalogue we just loaded — that fetch may have failed, or the
    // link may predate this device's cache. Ask for the one noodle directly.
    try {
      const res = await fetch(`/api/noodles?id=${encodeURIComponent(id)}`);
      if (res.ok) [noodle] = await res.json();
    } catch {
      noodle = undefined;
    }
  }
  if (noodle) showNoodleOverlay(noodle);
  else showToast('That noodle could not be found', 'error');
}

// Name, brand and barcode — the same three fields the server-side search used
// to match, now applied to the catalogue this page already holds.
function matches(noodle, term) {
  return `${noodle.name ?? ''} ${noodle.brand ?? ''} ${noodle.id ?? ''}`.toLowerCase().includes(term);
}

// The single source of what is on screen: filtered, then sorted. Search results
// used to bypass both the sort and the pagination, which is why the dropdown
// appeared to do nothing while a search was active.
function visibleNoodles() {
  const term = searchTerm.trim().toLowerCase();
  return sortNoodles(term ? allNoodles.filter(n => matches(n, term)) : allNoodles);
}

function render() {
  renderPagedList(visibleNoodles());
}

function sortNoodles(items) {
  const val = document.getElementById('sort-by')?.value;
  if (!val) return items;
  const [field, dir] = val.split('-');
  const asc = dir === 'asc';
  const score = (noodle, key) => {
    if (key === 'avgRating') return communityRating(noodle);
    if (key === 'avgSpicy') return communitySpicy(noodle);
    return noodle[key];
  };
  return [...items].sort((a, b) => {
    const primary = asc ? score(a, field) - score(b, field) : score(b, field) - score(a, field);
    if (primary !== 0) return primary;
    if (field !== 'avgSpicy') {
      const spicyTie = asc ? communitySpicy(b) - communitySpicy(a) : communitySpicy(a) - communitySpicy(b);
      if (spicyTie !== 0) return spicyTie;
    }
    if (field !== 'price') {
      return asc ? b.price - a.price : a.price - b.price;
    }
    return 0;
  });
}

function renderPagedList(data) {
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages || 1);

  renderList(data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  const pg = document.getElementById('pagination');
  if (totalPages <= 1) {
    pg.hidden = true;
    return;
  }

  pg.hidden = false;
  pg.innerHTML = `
    <button id="pg-prev" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>
    <span>Page ${currentPage} of ${totalPages}</span>
    <button id="pg-next" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>
  `;
}

// Lets the overlay refresh the visible cards after a rating is saved.
// `updated` is the noodle the overlay just changed. It may not be the same
// object this page holds — the overlay can be opened from a shared `?id=` link
// whose noodle was fetched separately — so the cached copy is patched before
// the re-render, or the new average is lost as soon as the search is cleared.
window.refreshNoodleCards = (updated) => {
  if (updated) {
    const cached = allNoodles.find(n => n.id === updated.id);
    if (cached && cached !== updated) Object.assign(cached, updated);
  }
  render();
};

// The catalogue is held in memory here, so a deleted noodle has to be dropped
// from it. Whatever is on screen — searched, sorted, paged — follows from that.
window.noodleRemoved = (id) => {
  allNoodles = allNoodles.filter(n => n.id !== id);
  render();
};

function renderList(data) {
  const list = document.getElementById('noodle-list');
  list.innerHTML = '';

  // A blank page reads as "there are no noodles" whatever the reason, which is
  // wrong for two of these three and alarming for the first.
  if (!data.length) {
    const term = searchTerm.trim();
    const note = document.createElement('p');
    note.className = 'list-empty';
    if (loadFailed) note.textContent = 'Could not load the catalogue. Check your connection and reload.';
    else if (term) note.textContent = `Nothing matches “${term}”.`;
    else note.textContent = 'No noodles in the index yet.';
    list.appendChild(note);
    return;
  }

  data.forEach(noodle => {
    const card = buildNoodleCard(noodle);
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    list.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    currentPage = 1;
    render();
  });

  // No debounce and no request: filtering an array already in memory is
  // instant. The fetch this replaces was not sequenced, so a slow reply for
  // "shi" could land after "shin" and leave the wrong results under the right
  // query — a race that cannot exist without the network.
  document.getElementById('search').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    currentPage = 1;
    render();
  });

  document.getElementById('pagination').addEventListener('click', (e) => {
    if (e.target.id === 'pg-prev') currentPage--;
    else if (e.target.id === 'pg-next') currentPage++;
    else return;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  list();
});
