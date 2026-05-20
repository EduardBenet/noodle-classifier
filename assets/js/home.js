window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/noodles");
    const noodles = await res.json();
    if (!noodles.length) return;

    const today = new Date();
    const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const noodle = noodles[daySeed % noodles.length];

    document.getElementById("noodle-of-the-day").innerHTML = `
      <div class="card">
        <img src="${noodle.image}" alt="${noodle.name}" loading="lazy">
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
      </div>
    `;
  } catch (_) {
    // noodle of the day is optional — fail silently
  }
});
