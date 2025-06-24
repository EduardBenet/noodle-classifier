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
          <div class="spice">${'🌶️'.repeat(noodle.spicy)}${'<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy)}</div>
        </div>
        <small>${noodle.description}</small>
      </div>
    `;

    list.appendChild(card);
  });
}
