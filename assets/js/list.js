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

    const img = document.createElement('img');
    img.src = noodle.image;
    img.alt = noodle.name;
    img.loading = 'lazy';

    const strong = document.createElement('strong');
    strong.textContent = noodle.name;
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = `(${noodle.brand})`;
    const cardTitle = document.createElement('div');
    cardTitle.className = 'card-title';
    cardTitle.append(strong, brand);

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `£${noodle.price.toFixed(2)}`;

    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.textContent = '★'.repeat(noodle.rating) + '☆'.repeat(5 - noodle.rating);

    const spice = document.createElement('div');
    spice.className = 'spice';
    // emoji characters are not user data — safe to use innerHTML here
    spice.innerHTML = '🌶️'.repeat(noodle.spicy) + '<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy);

    const row = document.createElement('div');
    row.className = 'rating-spice-row';
    row.append(stars, spice);

    const desc = document.createElement('small');
    desc.textContent = noodle.description;

    const content = document.createElement('div');
    content.className = 'card-content';
    content.append(cardTitle, price, row, desc);

    card.append(img, content);

    card.addEventListener('click', () => showNoodleOverlay(noodle));
    list.appendChild(card);
  });
}
