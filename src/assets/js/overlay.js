let overlayNoodle = null;
// Bumped on every open so a slow in-flight rating fetch can't populate the
// widget for a noodle the user has already navigated away from.
let overlayToken = 0;

function communityScoresHTML(noodle) {
  return ratingSpiceHTML(communityRating(noodle), communitySpicy(noodle), noodle.ratingCount);
}

function communitySummaryText(noodle) {
  const count = noodle.ratingCount != null ? ` · ${countLabel(noodle.ratingCount)}` : '';
  return `${formatScore(communityRating(noodle))} ★ · ${formatScore(communitySpicy(noodle))} 🌶️${count}`;
}

function renderCommunityScores(noodle) {
  const row = document.getElementById('overlay-scores');
  row.innerHTML = communityScoresHTML(noodle);
  wireScoreTips(row);
  document.getElementById('overlay-community').textContent = communitySummaryText(noodle);
}

function ratingInputs() {
  return {
    form: document.getElementById('rating-widget'),
    rating: document.querySelector('input[name="my-rating"]:checked'),
    spicy: document.querySelector('input[name="my-spice"]:checked'),
    submit: document.getElementById('rating-submit'),
    status: document.getElementById('rating-status')
  };
}

function resetRatingWidget() {
  const { form, submit, status } = ratingInputs();
  form.hidden = true;
  form.querySelectorAll('input[type="radio"]').forEach(i => { i.checked = false; });
  submit.disabled = true;
  status.textContent = '';
}

function syncSubmitState() {
  const { rating, spicy, submit } = ratingInputs();
  submit.disabled = !(rating && spicy);
}

function selectRadio(name, value) {
  if (value == null) return;
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

async function loadOwnRating(noodle, token) {
  const { form, status } = ratingInputs();
  form.hidden = false;
  try {
    const res = await fetch(`/api/ratings?noodleId=${encodeURIComponent(noodle.id)}`);
    if (!res.ok) return;
    const own = await res.json();
    if (token !== overlayToken || !own) return;
    selectRadio('my-rating', own.rating);
    selectRadio('my-spice', own.spicy);
    status.textContent = 'Your current rating';
    syncSubmitState();
  } catch {
    // leave the widget empty — the user can still submit a fresh rating
  }
}

async function submitRating(e) {
  e.preventDefault();
  if (!overlayNoodle) return;

  const { rating, spicy, submit, status } = ratingInputs();
  if (!rating || !spicy) return;

  submit.disabled = true;
  status.textContent = 'Saving…';

  try {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noodleId: overlayNoodle.id,
        rating: Number(rating.value),
        spicy: Number(spicy.value)
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const updated = await res.json();
    overlayNoodle.avgRating = updated.avgRating;
    overlayNoodle.avgSpicy = updated.avgSpicy;
    overlayNoodle.ratingCount = updated.ratingCount;
    // Keep the caller's own score current too — My List renders from these.
    overlayNoodle.myRating = Number(rating.value);
    overlayNoodle.mySpicy = Number(spicy.value);
    overlayNoodle.ratedAt = new Date().toISOString();

    renderCommunityScores(overlayNoodle);
    status.textContent = 'Saved';
    // Pass the noodle along: search results are not the same objects the list
    // page caches, so the receiver may need to patch its own copy.
    window.refreshNoodleCards?.(overlayNoodle);
  } catch {
    status.textContent = 'Could not save — try again';
  } finally {
    syncSubmitState();
  }
}

function showNoodleOverlay(noodle) {
  overlayNoodle = noodle;
  const token = ++overlayToken;
  document.getElementById("overlay-title").textContent = noodle.name;

  const img = document.createElement('img');
  img.src = noodle.image;
  img.alt = noodle.name;
  img.style.cssText = 'max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto 1rem;';

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = `£${noodle.price.toFixed(2)}`;

  const scores = document.createElement('div');
  scores.id = 'overlay-scores';
  scores.className = 'rating-spice-row';

  const community = document.createElement('div');
  community.id = 'overlay-community';
  community.className = 'community-summary';

  const desc = document.createElement('small');
  desc.textContent = noodle.description;

  document.getElementById("overlay-body").replaceChildren(img, price, scores, community, desc);
  renderCommunityScores(noodle);

  resetRatingWidget();
  window.authReady?.then(user => {
    if (user && token === overlayToken) loadOwnRating(noodle, token);
  });

  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  overlayToken++;
  document.getElementById("overlay").classList.remove("visible");
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("overlay-close").addEventListener("click", hideOverlay);

  // A third way out, alongside the close button and the backdrop. The card is
  // as tall as the screen on a phone, which leaves little backdrop to tap.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideOverlay();
  });
  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("overlay")) hideOverlay();
  });
  document.getElementById("overlay-edit").addEventListener("click", () => {
    if (!overlayNoodle) return;
    // The owner edits the catalogue directly; everyone else files an edit
    // suggestion for the review queue. auth.js reveals the button for both.
    const page = window.currentUser?.isOwner ? 'add.html' : 'suggest-edit.html';
    window.location.href = `${page}?id=${encodeURIComponent(overlayNoodle.id)}`;
  });

  const form = document.getElementById("rating-widget");
  form.addEventListener("change", syncSubmitState);
  form.addEventListener("submit", submitRating);
});
