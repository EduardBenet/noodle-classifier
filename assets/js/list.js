const PAGE_SIZE = 10;
let allNoodles = [];
let currentPage = 1;

async function list() {
  const response = await fetch("/api/noodles");
  allNoodles = await response.json();
  currentPage = 1;
  renderPage();
}

function sortNoodles(items) {
  const val = document.getElementById('sort-by')?.value;
  if (!val) return items;
  const [field, dir] = val.split('-');
  const key = field === 'spicy' ? 'spicy' : field;
  return [...items].sort((a, b) => dir === 'asc' ? a[key] - b[key] : b[key] - a[key]);
}

function renderPage() {
  const sorted = sortNoodles(allNoodles);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  renderList(pageItems, 'noodle-list');
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.textContent = '←';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; renderPage(); window.scrollTo(0, 0); });
  container.appendChild(prev);

  const label = document.createElement('span');
  label.textContent = `${currentPage} / ${totalPages}`;
  container.appendChild(label);

  const next = document.createElement('button');
  next.textContent = '→';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; renderPage(); window.scrollTo(0, 0); });
  container.appendChild(next);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    currentPage = 1;
    renderPage();
  });
});

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
