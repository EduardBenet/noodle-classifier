let overlayNoodle = null;

function showNoodleOverlay(noodle) {
  overlayNoodle = noodle;
  document.getElementById("overlay-title").textContent = noodle.name;

  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.style.cssText = 'max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto 1rem;';

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

  document.getElementById("overlay-body").replaceChildren(img, price, ratingSpiceRow, desc);
  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  document.getElementById("overlay").classList.remove("visible");
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("overlay-close").addEventListener("click", hideOverlay);
  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("overlay")) hideOverlay();
  });
  document.getElementById("overlay-edit").addEventListener("click", () => {
    if (!overlayNoodle) return;
    window.location.href = `add.html?id=${encodeURIComponent(overlayNoodle.id)}`;
  });
});
