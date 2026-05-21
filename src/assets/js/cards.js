function ratingSpiceHTML(rating, spicy) {
  return `
    <div class="stars">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
    <div class="spice">${'🌶️'.repeat(spicy)}${'<span class="inactive">🌶️</span>'.repeat(5 - spicy)}</div>
  `;
}

function buildNoodleCard(noodle, { showDescription = false } = {}) {
  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.loading = 'lazy';

  const strong = document.createElement('strong');
  strong.textContent = noodle.name;
  const brandSpan = document.createElement('span');
  brandSpan.className = 'brand';
  brandSpan.textContent = `(${noodle.brand})`;
  const cardTitle = document.createElement('div');
  cardTitle.className = 'card-title';
  cardTitle.append(strong, ' ', brandSpan);

  const stars = document.createElement('div');
  stars.className = 'stars';
  stars.textContent = '★'.repeat(noodle.rating) + '☆'.repeat(5 - noodle.rating);

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = `£${noodle.price.toFixed(2)}`;

  const spice = document.createElement('div');
  spice.className = 'spice';
  spice.innerHTML = '🌶️'.repeat(noodle.spicy) + '<span class="inactive">🌶️</span>'.repeat(5 - noodle.spicy);

  const statsRow = document.createElement('div');
  statsRow.className = 'card-stats';
  statsRow.append(stars, price, spice);

  const content = document.createElement('div');
  content.className = 'card-content';

  if (showDescription) {
    const desc = document.createElement('small');
    desc.textContent = noodle.description;
    content.append(cardTitle, statsRow, desc);
  } else {
    content.append(cardTitle, statsRow);
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.append(img, content);
  return card;
}
