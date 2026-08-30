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
    remove: document.getElementById('rating-remove')
  };
}

function resetRatingWidget() {
  const { form, submit, remove } = ratingInputs();
  form.hidden = true;
  form.querySelectorAll('input[type="radio"]').forEach(i => { i.checked = false; });
  submit.disabled = true;
  remove.hidden = true;
  remove.disabled = false;
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
  const { form } = ratingInputs();
  form.hidden = false;
  try {
    const res = await fetch(`/api/ratings?noodleId=${encodeURIComponent(noodle.id)}`);
    if (!res.ok) return;
    const own = await res.json();
    if (token !== overlayToken || !own) return;
    // The checked stars are the message: a line of text saying they are your
    // current rating only repeats what they already show.
    selectRadio('my-rating', own.rating);
    selectRadio('my-spice', own.spicy);
    ratingInputs().remove.hidden = false;
    syncSubmitState();
  } catch {
    // leave the widget empty — the user can still submit a fresh rating
  }
}

async function submitRating(e) {
  e.preventDefault();
  if (!overlayNoodle) return;

  const { rating, spicy, submit } = ratingInputs();
  if (!rating || !spicy) return;

  submit.disabled = true;

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
    // Outcomes go to the toast the rest of the app uses, rather than a line of
    // text wedged between the two buttons.
    showToast('Rating saved', 'success');
    ratingInputs().remove.hidden = false;
    // Pass the noodle along: search results are not the same objects the list
    // page caches, so the receiver may need to patch its own copy.
    window.refreshNoodleCards?.(overlayNoodle);
  } catch {
    showToast('Could not save your rating — try again', 'error');
  } finally {
    syncSubmitState();
  }
}

async function removeRating() {
  if (!overlayNoodle) return;

  const { form, remove } = ratingInputs();
  remove.disabled = true;

  try {
    const res = await fetch(`/api/ratings?noodleId=${encodeURIComponent(overlayNoodle.id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { aggregate } = await res.json();
    // Null, not delete: the cached copy on a search results page is a different
    // object patched with Object.assign, which copies a null over but cannot
    // carry the absence of a key. `communityRating` reads `avgRating ?? rating`,
    // so a null falls back to the noodle's own score either way.
    overlayNoodle.avgRating = aggregate?.avgRating ?? null;
    overlayNoodle.avgSpicy = aggregate?.avgSpicy ?? null;
    overlayNoodle.ratingCount = aggregate?.ratingCount ?? null;
    overlayNoodle.myRating = null;
    overlayNoodle.mySpicy = null;
    overlayNoodle.ratedAt = null;

    form.querySelectorAll('input[type="radio"]').forEach(i => { i.checked = false; });
    remove.hidden = true;
    showToast('Rating removed', 'success');
    renderCommunityScores(overlayNoodle);
    window.refreshNoodleCards?.(overlayNoodle);
  } catch {
    showToast('Could not remove your rating — try again', 'error');
  } finally {
    remove.disabled = false;
    syncSubmitState();
  }
}

// The canonical link to one noodle: the list page, with the overlay opened on
// arrival (list.js reads this back). The list is public and un-gated, so a
// shared link opens for a signed-out stranger; a dedicated page would need its
// own route in staticwebapp.config.json to say the same thing.
function noodleLink(noodle) {
  return `${location.origin}/list.html?id=${encodeURIComponent(noodle.id)}`;
}

// execCommand('copy') is deprecated but still the only fallback that works
// without a secure context or clipboard permission, so it stays as the last
// resort — a share button that silently does nothing is worse.
function copyTextFallback(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

async function shareNoodle() {
  closeMenu();
  if (!overlayNoodle) return;
  const url = noodleLink(overlayNoodle);

  // The real share sheet where there is one (every mobile browser worth the
  // name); a copied link everywhere else, which is what desktop gets.
  if (navigator.share) {
    try {
      await navigator.share({ title: overlayNoodle.name, text: `${overlayNoodle.name} 🍜`, url });
      return;
    } catch (err) {
      // Dismissing the sheet rejects with AbortError — not a failure, and
      // falling through to "Link copied" after a deliberate cancel would be
      // its own small lie.
      if (err?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied', 'success');
  } catch {
    if (copyTextFallback(url)) showToast('Link copied', 'success');
    else showToast(`Could not copy the link: ${url}`, 'error');
  }
}

function menuParts() {
  return {
    menu: document.getElementById('overlay-menu'),
    button: document.getElementById('overlay-menu-button')
  };
}

function isMenuOpen() {
  return !menuParts().menu.hidden;
}

function openMenu() {
  const { menu, button } = menuParts();
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  // Straight into the list, so a keyboard user is not left on the trigger with
  // the menu open behind them.
  menu.querySelector('button:not([hidden])')?.focus();
}

function closeMenu({ refocus = false } = {}) {
  const { menu, button } = menuParts();
  if (menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (refocus) button.focus();
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
  closeMenu();
  window.authReady?.then(user => {
    if (user && token === overlayToken) loadOwnRating(noodle, token);
  });

  document.getElementById("overlay").classList.add("visible");
}

function hideOverlay() {
  overlayToken++;
  closeMenu();
  document.getElementById("overlay").classList.remove("visible");
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("overlay-close").addEventListener("click", hideOverlay);

  // A third way out, alongside the close button and the backdrop. The card is
  // as tall as the screen on a phone, which leaves little backdrop to tap.
  // Escape unwinds one layer at a time: the menu first, the overlay behind it.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (isMenuOpen()) closeMenu({ refocus: true });
    else hideOverlay();
  });
  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("overlay")) hideOverlay();
  });

  document.getElementById("overlay-menu-button").addEventListener("click", (e) => {
    // Without this the document listener below sees the same click and shuts
    // the menu again in the same tick, so it would never appear to open.
    e.stopPropagation();
    if (isMenuOpen()) closeMenu();
    else openMenu();
  });
  // A tap anywhere else dismisses it — including on the card behind, which is
  // what a phone user expects from a popover.
  document.addEventListener("click", (e) => {
    if (isMenuOpen() && !menuParts().menu.contains(e.target)) closeMenu();
  });

  document.getElementById("overlay-share").addEventListener("click", shareNoodle);
  document.getElementById("overlay-edit").addEventListener("click", () => {
    closeMenu();
    if (!overlayNoodle) return;
    // The owner edits the catalogue directly; everyone else files an edit
    // suggestion for the review queue. auth.js reveals the button for both.
    const page = window.currentUser?.isOwner ? 'add.html' : 'suggest-edit.html';
    window.location.href = `${page}?id=${encodeURIComponent(overlayNoodle.id)}`;
  });

  document.getElementById("rating-remove").addEventListener("click", removeRating);

  const form = document.getElementById("rating-widget");
  form.addEventListener("change", syncSubmitState);
  form.addEventListener("submit", submitRating);
});
