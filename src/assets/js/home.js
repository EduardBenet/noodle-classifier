window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/noodles");
    const noodles = await res.json();
    if (!noodles.length) return;

    const today = new Date();
    const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const noodle = noodles[daySeed % noodles.length];

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

    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    cardContent.append(cardTitle, price, ratingSpiceRow, desc);

    const card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', () => showNoodleOverlay(noodle));
    card.append(img, cardContent);

    document.getElementById("noodle-of-the-day").replaceChildren(card);
  } catch (_) {
    // noodle of the day is optional — fail silently
  }
});
