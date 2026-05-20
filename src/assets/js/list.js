let allNoodles = [];
let currentPage = 1;
let currentData = [];
let overlayNoodle = null;
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
  return [...items].sort((a, b) => {
    const primary = dir === 'asc' ? a[field] - b[field] : b[field] - a[field];
    if (primary !== 0 || field === 'spicy') return primary;
    return a.spicy - b.spicy;
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

function buildCard(noodle) {
  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.loading = 'lazy';

  const cardTitle = document.createElement('div');
  cardTitle.className = 'card-title';
  const strong = document.createElement('strong');
  strong.textContent = noodle.name;
  const brandSpan = document.createElement('span');
  brandSpan.className = 'brand';
  brandSpan.textContent = `(${noodle.brand})`;
  cardTitle.append(strong, ' ', brandSpan);

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = `£${noodle.price.toFixed(2)}`;

  const ratingSpiceRow = document.createElement('div');
  ratingSpiceRow.className = 'rating-spice-row';
  ratingSpiceRow.innerHTML = `
    <div class="stars">${'★'.repeat(noodle.rating)}${'☆'.repeat(5 - noodle.rating)}</div>
    <div class="spice">${'🌶️'.repeat(noodle.spicy)}${'<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy)}</div>
  `;

  const desc = document.createElement('small');
  desc.textContent = noodle.description;

  const content = document.createElement('div');
  content.className = 'card-content';
  content.append(cardTitle, price, ratingSpiceRow, desc);

  const card = document.createElement('div');
  card.className = 'card';
  card.append(img, content);
  return card;
}

function renderList(data, lname) {
  const list = document.getElementById(lname);
  list.innerHTML = '';
  data.forEach(noodle => {
    const card = buildCard(noodle);
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    list.appendChild(card);
  });
}

function showNoodleOverlay(noodle) {
  overlayNoodle = noodle;
  document.getElementById("overlay-title").textContent = noodle.name;

  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.style.cssText = 'max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto 1rem;';

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = `£${noodle.price.toFixed(2)}`;

  const ratingSpiceRow = document.createElement('div');
  ratingSpiceRow.className = 'rating-spice-row';
  ratingSpiceRow.innerHTML = `
    <div class="stars">${'★'.repeat(noodle.rating)}${'☆'.repeat(5 - noodle.rating)}</div>
    <div class="spice">${'🌶️'.repeat(noodle.spicy)}${'<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy)}</div>
  `;

  const desc = document.createElement('small');
  desc.textContent = noodle.description;

  document.getElementById("overlay-body").replaceChildren(img, price, ratingSpiceRow, desc);
  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  document.getElementById("overlay").classList.remove("visible");
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("overlay-close").addEventListener("click", hideOverlay);
  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("overlay")) hideOverlay();
  });
  document.getElementById("overlay-edit").addEventListener("click", () => {
    if (!overlayNoodle) return;
    window.location.href = `add.html?id=${encodeURIComponent(overlayNoodle.id)}`;
  });

  document.getElementById('sort-by').addEventListener('change', () => {
    currentPage = 1;
    renderPagedList(sortNoodles(allNoodles));
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
