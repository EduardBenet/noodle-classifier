let allNoodles = [];
let currentPage = 1;
let currentData = [];
// Non-null while a search is active, so a re-render knows which set to show.
let searchResults = null;
let debounceTimeout;
const PAGE_SIZE = 10;

async function list() {
  try {
    const response = await fetch("/api/noodles");
    allNoodles = await response.json();
  } catch {
    allNoodles = [];
  }
  currentPage = 1;
  renderPagedList(sortNoodles(allNoodles));

  const params = new URLSearchParams(location.search);

  // `?search=` lets other pages deep-link here — the submit form uses it to
  // point at the noodle behind a duplicate barcode.
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
  currentData = data;
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages || 1);

  renderList(data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), 'noodle-list');

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
// `updated` is the noodle the overlay just changed: search results are freshly
// fetched objects, so the copy held in allNoodles has to be patched too or the
// new average is lost as soon as the search is cleared.
window.refreshNoodleCards = (updated) => {
  if (updated) {
    const cached = allNoodles.find(n => n.id === updated.id);
    if (cached && cached !== updated) Object.assign(cached, updated);
  }
  // Re-rendering the paged list while a search is active would throw the
  // results away and bring the pagination back.
  if (searchResults) {
    renderList(searchResults, 'noodle-list');
  } else {
    renderPagedList(currentData);
  }
};

function renderList(data, lname) {
  const list = document.getElementById(lname);
  list.innerHTML = '';
  data.forEach(noodle => {
    const card = buildNoodleCard(noodle);
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    list.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    currentPage = 1;
    renderPagedList(sortNoodles(allNoodles));
  });

  document.getElementById('search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim();
    clearTimeout(debounceTimeout);
    if (!searchTerm) {
      searchResults = null;
      currentPage = 1;
      renderPagedList(sortNoodles(allNoodles));
      return;
    }
    debounceTimeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/noodles?search=${encodeURIComponent(searchTerm)}`);
        const items = await response.json();
        searchResults = items;
        document.getElementById('pagination').hidden = true;
        renderList(items, 'noodle-list');
      } catch {
        // search failure is non-fatal — leave current list in place
      }
    }, 300);
  });

  document.getElementById('pagination').addEventListener('click', (e) => {
    if (e.target.id === 'pg-prev') {
      currentPage--;
      renderPagedList(currentData);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.target.id === 'pg-next') {
      currentPage++;
      renderPagedList(currentData);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  list();
});
