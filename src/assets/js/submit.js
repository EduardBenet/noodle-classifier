// Suggestion form for signed-in non-owners. Posts to /api/submissions, which
// queues the noodle for owner review. The submitter rates it here: on approval
// that score is written as their own rating, so an approved suggestion lands in
// the submitter's My List without them having to go and rate it again.

// null, not 0, when nothing is selected — 0 is a real spice level, so using it
// as the "unset" marker would make a not-spicy noodle indistinguishable from an
// unanswered question. Matches add.js.
function selectedScore(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? Number(checked.value) : null;
}

function collectSubmission() {
  return {
    id: document.getElementById('product-id').value.trim(),
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()).filter(Boolean),
    description: document.getElementById('description').value,
    hasSoup: document.getElementById('hasSoup').checked,
    price: parseFloat(document.getElementById('price').value),
    spicy: selectedScore('spice'),
    rating: selectedScore('rating'),
    image: document.getElementById('image').value
  };
}

// The API rejects barcodes already in the catalogue. Point the user at the
// noodle they were trying to add rather than just refusing.
function showDuplicate(id) {
  const el = document.getElementById('toast');
  el.className = 'toast-error';
  el.hidden = false;
  el.innerHTML = `This noodle is already in the index. <a href="list.html?id=${encodeURIComponent(id)}">View it</a> `
    + `<button onclick="this.parentElement.hidden=true" aria-label="Dismiss">&times;</button>`;
}

async function sendSubmission() {
  const btn = document.getElementById('submit-btn');
  const payload = collectSubmission();

  // The radios are `display: none` (the label is the visible control), so a
  // native `required` would fail with "not focusable". Check them here instead.
  if (payload.rating === null || payload.spicy === null) {
    showToast('Pick a rating and a spice level — your score goes in with the suggestion.', 'error');
    return;
  }

  btn.disabled = true;
  let res;
  try {
    res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    showToast('Network error — suggestion not sent.', 'error');
    btn.disabled = false;
    return;
  }

  btn.disabled = false;

  if (res.status === 409) {
    showDuplicate(payload.id);
    return;
  }

  if (res.status === 401) {
    showToast('Please sign in to suggest a noodle.', 'error');
    return;
  }

  if (!res.ok) {
    showToast(`Error ${res.status} — suggestion not sent.`, 'error');
    return;
  }

  showToast('Thanks! Sent for review.', 'success');
  document.getElementById('submit-form').reset();
  setOfffStatus('');
}

// Only autofill from Open Food Facts — an existing barcode is a duplicate here,
// so there is nothing to prefill from the catalogue.
// Never rejects: both callers are event handlers, where an unhandled rejection
// would leave the user with no feedback at all.
async function lookupBarcode(id) {
  if (!id) return;
  let items;
  try {
    const res = await fetch(`/api/noodles?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.status);
    items = await res.json();
  } catch {
    showToast('Could not check the catalogue — you can still fill this in.', 'error');
    return;
  }

  if (items.length) {
    showDuplicate(id);
    return;
  }

  try {
    await fillFromOpenFoodFacts(id);
  } catch {
    setOfffStatus('Could not reach Open Food Facts.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initScanner(lookupBarcode);

  document.getElementById('product-id').addEventListener('blur', () => {
    lookupBarcode(document.getElementById('product-id').value.trim());
  });

  document.getElementById('submit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendSubmission();
  });
});
