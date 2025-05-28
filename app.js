let noodles = [];

async function loadData() {

    const query = `
      {
        packages {
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
    renderList(result.data.people.items);
}

function renderList(data) {
    const list = document.getElementById('noodle-list');
    list.innerHTML = '';

    data.forEach(noodle => {
        const card = document.createElement('div');
        card.className = 'card';

        card.innerHTML = `
      <img src="images/${noodle.image}" alt="${noodle.name}">
      <strong>${noodle.name}</strong> (${noodle.brand})<br>
      €${noodle.price.toFixed(2)}<br>
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

document.getElementById('add-form').addEventListener('submit', e => {
    e.preventDefault();

    const newNoodle = {
        id: `id-${Date.now()}`,
        name: document.getElementById('name').value,
        brand: document.getElementById('brand').value,
        keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
        description: document.getElementById('description').value,
        price: parseFloat(document.getElementById('price').value),
        rating: parseInt(document.getElementById('rating').value),
        image: document.getElementById('image').value
    };

    noodles.push(newNoodle);
    renderList(noodles);
});

loadData();