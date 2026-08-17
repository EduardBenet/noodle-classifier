let allNoodles = [];
let currentPage = 1;
let currentData = [];
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
window.refreshNoodleCards = () => renderPagedList(currentData);

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
      currentPage = 1;
      renderPagedList(sortNoodles(allNoodles));
      return;
    }
    debounceTimeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/noodles?search=${encodeURIComponent(searchTerm)}`);
        const items = await response.json();
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
