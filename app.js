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
    image: document.getElementById('image').value
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
  // Reset form on success
  document.getElementById('add-form').reset();
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
  renderList(result.data.noodles.items, 'noodle-list');
}

function renderList(data, lname) {
  const list = document.getElementById(lname);
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

async function searchNoodles(searchTerm) {
  const gql = `
    query searchNoodles($search: String!) {
      noodle(
        where: {
          _or: [
            { brand: { _ilike: $search } }
            { keywords: { _ilike: $search } }
          ]
        }
      ) {
        id
        name
        brand
        keywords
        description
        spicy
        rating
        image
      }
    }
  `;

  const query = {
    query: gql,
    variables: {
      search: `%${searchTerm}%`, // ilike wildcard match
    },
  };

  const response = await fetch("/data-api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  const result = await response.json();
  console.table(result.data.noodle);
  return result.data.noodle;
}


document.getElementById("search").addEventListener("input", async (e) => {
  const searchTerm = e.target.value.trim();
  const filtered = await searchNoodles(searchTerm);

  renderList(filtered, 'search-results');
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

