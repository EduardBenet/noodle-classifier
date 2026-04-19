let allNoodles = [];

async function list() {
  const response = await fetch("/api/noodles");
  allNoodles = await response.json();
  renderList(sortNoodles(allNoodles), 'noodle-list');
}

function sortNoodles(items) {
  const val = document.getElementById('sort-by')?.value;
  if (!val) return items;
  const [field, dir] = val.split('-');
  const key = field === 'spicy' ? 'spicy' : field;
  return [...items].sort((a, b) => dir === 'asc' ? a[key] - b[key] : b[key] - a[key]);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sort-by').addEventListener('change', () => {
    renderList(sortNoodles(allNoodles), 'noodle-list');
  });
});

function renderList(data, lname) {
  const list = document.getElementById(lname);
  list.innerHTML = '';

  data.forEach(noodle => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img src="${noodle.image}" alt="${noodle.name}">
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

    list.appendChild(card);
  });
}
