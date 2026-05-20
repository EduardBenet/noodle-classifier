let allNoodles = [];
let currentPage = 1;
let currentData = [];
const PAGE_SIZE = 10;

async function list() {
  const response = await fetch("/api/noodles");
  allNoodles = await response.json();
  currentPage = 1;
  renderPagedList(sortNoodles(allNoodles));
}

function sortNoodles(items) {
  const val = document.getElementById('sort-by')?.value;
  if (!val) return items;
  const [field, dir] = val.split('-');
  return [...items].sort((a, b) => dir === 'asc' ? a[field] - b[field] : b[field] - a[field]);
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

function renderList(data, lname) {
  const list = document.getElementById(lname);
  list.innerHTML = '';

  data.forEach(noodle => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img src="${noodle.image}" alt="${noodle.name}" loading="lazy">
      <div class="card-content">
        <div class="card-title">
         <strong>${noodle.name}</strong>
         <span class="brand">(${noodle.brand})</span>
        </div>
        <div class="price">£${noodle.price.toFixed(2)}</div>
        <div class="rating-spice-row">
          <div class="stars">${'★'.repeat(noodle.rating)}${'☆'.repeat(5 - noodle.rating)}</div>
          <div class="spice">${'🌶️'.repeat(noodle.spicy)}${'<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy)}</div>
        </div>
        <small>${noodle.description}</small>
      </div>
    `;

    card.addEventListener('click', () => showNoodleOverlay(noodle));
    list.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    currentPage = 1;
    renderPagedList(sortNoodles(allNoodles));
  });

  document.getElementById('pagination').addEventListener('click', (e) => {
    if (e.target.id === 'pg-prev') {
      currentPage--;
      renderPagedList(currentData);
      document.getElementById('tab-list').scrollIntoView({ behavior: 'smooth' });
    } else if (e.target.id === 'pg-next') {
      currentPage++;
      renderPagedList(currentData);
      document.getElementById('tab-list').scrollIntoView({ behavior: 'smooth' });
    }
  });
});
