let noodles = [];

async function create() {

  const data = {
    id: `id-${Date.now()}`,
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
    description: document.getElementById('description').value,
    spicy: parseInt(document.getElementById('spicy').value),
    price: parseFloat(document.getElementById('price').value),
    rating: parseInt(document.querySelector('input[name="rating"]:checked')?.value || "0"),
    image: document.getElementById('image').values
  };

  const gql = `
    mutation create($item: CreateNoodlesInput!) {
      createNoodles(item: $item) {
        id
        name
        brand
        keywords
        description
        spicy
        price
        rating
        image
      }
    }`;

  const query = {
    query: gql,
    variables: {
      item: data
    }
  };

  const endpoint = "/data-api/graphql";
  const result = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query)
  });

  const response = await result.json();
  list();
}

document.getElementById('add-form').addEventListener('submit', function (e) {
  e.preventDefault();
  create();
});

async function list() {

  const query = `
      {
        noodles {
          items {
            id
            name
            brand
            description
            keywords
            spicy
            price
            rating
            image
          }
        }
      }`;

  const endpoint = "/data-api/graphql";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query })
  });
  const result = await response.json();
  renderList(result.data.noodles.items);
}

function renderList(data) {
  const list = document.getElementById('noodle-list');
  list.innerHTML = '';

  data.forEach(noodle => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <img src="${noodle.image}" alt="${noodle.name}">
      <strong>${noodle.name}</strong> (${noodle.brand})<br>
      £${noodle.price.toFixed(2)}<br>
      <span class="stars">${'★'.repeat(noodle.rating)}${'☆'.repeat(5 - noodle.rating)}</span><br>
      <small>${noodle.description}</small><br>
      <small><em>Tags: ${noodle.keywords.join(', ')}</em></small>
    `;

    list.appendChild(card);
  });
}

document.getElementById('search').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = noodles.filter(n =>
    n.name.toLowerCase().includes(term) ||
    n.brand.toLowerCase().includes(term) ||
    n.keywords.some(k => k.toLowerCase().includes(term))
  );
  renderList(filtered);
});

document.querySelectorAll(".tab-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    const target = button.getAttribute("data-tab");
    document.getElementById(`tab-${target}`).classList.add("active");
    button.classList.add("active");
  });
});

window.addEventListener("DOMContentLoaded", () => {
  list(); // or whatever function you use to populate #noodle-list
});

