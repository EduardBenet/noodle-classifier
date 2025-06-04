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
      <div class="card-content">
        <div>
         <strong>${noodle.name}</strong>
         <span class="brand">(${noodle.brand})</span>
         </div>
        <div class="price">£${noodle.price.toFixed(2)}</div>
        <div class="rating-spice-row">
          <div class="stars">${'★'.repeat(noodle.rating)}${'☆'.repeat(5 - noodle.rating)}</div>
          <div class="spice">${'🌶️'.repeat(noodle.spicy)}</div>
        </div>
        <small>${noodle.description}</small>
      </div>
    `;

    list.appendChild(card);
  });
}

async function searchNoodles(searchTerm) {
  const gql = `
    query SearchNoodles($filter: NoodlesFilterInput) {
      noodles(filter: $filter) {
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
    }
  `;

  const query = {
    query: gql,
    variables: {
      filter: {
        or: [
          { brand: { contains: searchTerm } },
          { keywords: { contains: searchTerm } }
        ]
      }
    }
  };

  const response = await fetch("/data-api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  const result = await response.json();
  renderList(result.data.noodles.items, 'search-results');
}

let debounceTimeout;

document.getElementById("search").addEventListener("input", async (e) => {
  const searchTerm = e.target.value.trim();

  // Clear the last timeout
  clearTimeout(debounceTimeout);

  // Set a new timeout
  debounceTimeout = setTimeout(() => {
    if (searchTerm) {
      searchNoodles(searchTerm);
    }
  }, 300); // wait 300ms after last keystroke
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

