// Owner-only add/edit form. Toasts, scanner and Open Food Facts autofill come
// from noodle-form.js, which submit.js shares.

let isExistingNoodle = false;

// null, not 0, when nothing is selected — 0 is a real spice level, so using it
// as the "unset" marker would make a not-spicy noodle indistinguishable from an
// unanswered question.
function selectedScore(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? Number(checked.value) : null;
}

function collectFormData() {
  return {
    // Trimmed, like every other collector: " 123 " and "123" would otherwise
    // be two separate noodles. The API trims too — this just keeps what the
    // form sends honest.
    id: document.getElementById('product-id').value.trim(),
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    // filter(Boolean) to match submit.js, queue.js and suggest-edit.js — this
    // was the only collector without it, so an empty keywords box stored [""]
    // rather than []. That stray empty string is how the orphan record created
    // on 2026-08-24 was traced back to this form.
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()).filter(Boolean),
    description: document.getElementById('description').value,
    spicy: selectedScore('spice'),
    hasSoup: document.getElementById('hasSoup').checked,
    price: parseFloat(document.getElementById('price').value),
    rating: selectedScore('rating'),
    image: document.getElementById('image').value
  };
}

function showQueueConflict() {
  const el = document.getElementById('toast');
  el.className = 'toast-error';
  el.hidden = false;
  el.innerHTML = 'Someone already suggested this barcode. '
    + '<a href="queue.html">Review it in the queue</a> '
    + '<button onclick="this.parentElement.hidden=true" aria-label="Dismiss">&times;</button>';
}

async function save(method) {
  let res;
  try {
    res = await fetch("/api/noodles", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectFormData())
    });
  } catch {
    showToast('Network error — changes not saved.', 'error');
    return;
  }

  // 409 means someone has already suggested this barcode. The suggestion has
  // to be approved rather than sidestepped: adding the noodle here would leave
  // a queue entry whose later approval overwrites it.
  if (res.status === 409) {
    showQueueConflict();
    return;
  }

  if (!res.ok) {
    // A 400 carries a reason worth reading (a missing barcode, say), so show
    // the API's own message rather than a bare status code.
    let msg = res.status === 401 ? 'Not authorised.' : `Error ${res.status} — changes not saved.`;
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      if (body?.error) msg = `${body.error} — changes not saved.`;
    }
    showToast(msg, 'error');
    return;
  }

  showToast(method === 'PUT' ? 'Noodle updated.' : 'Noodle added.', 'success');
  document.getElementById('add-form').reset();
  isExistingNoodle = false;
}

// Selects a radio by value without building a selector out of it: a stray quote
// in an API value would throw a SyntaxError and abort the whole form fill.
function checkScore(name, value) {
  if (value == null) return;
  document.getElementsByName(name).forEach(input => {
    if (input.value === String(value)) input.checked = true;
  });
}

async function fillOwnRating(id) {
  try {
    const res = await fetch(`/api/ratings?noodleId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const own = await res.json();
    if (!own) return;
    checkScore('rating', own.rating);
    checkScore('spice', own.spicy);
  } catch {
    // Not fatal: the owner can pick a score, or leave it as it was.
  }
}

// Never rejects: called from event handlers, where an unhandled rejection
// would silently do nothing.
async function fillFormById(id) {
  let items;
  try {
    const response = await fetch(`/api/noodles?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(response.status);
    items = await response.json();
  } catch {
    showToast('Could not look that up — you can still fill it in.', 'error');
    return;
  }

  if (items.length) {
    isExistingNoodle = true;
    const n = items[0];
    document.getElementById('name').value = n.name ?? '';
    document.getElementById('brand').value = n.brand ?? '';
    document.getElementById('price').value = n.price ?? '';
    document.getElementById('description').value = n.description ?? '';
    document.getElementById('keywords').value = Array.isArray(n.keywords) ? n.keywords.join(', ') : (n.keywords ?? '');
    document.getElementById('image').value = n.image ?? '';
    document.getElementById('hasSoup').checked = !!n.hasSoup;

    // The pickers show the owner's own rating, fetched from where ratings live.
    // They used to read n.spicy and n.rating off the noodle document — fields
    // that no longer exist, because a score is an opinion and belongs with the
    // other opinions. Left blank when the owner has not rated this one, and
    // saving with them blank leaves it that way.
    await fillOwnRating(id);
  } else {
    try {
      await fillFromOpenFoodFacts(id);
    } catch {
      setOfffStatus('Could not reach Open Food Facts.');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    document.getElementById('product-id').value = id;
    fillFormById(id);
  }

  initScanner(fillFormById);

  document.getElementById('product-id').addEventListener('input', () => {
    isExistingNoodle = false;
  });

  document.getElementById('product-id').addEventListener('blur', () => {
    const id = document.getElementById('product-id').value.trim();
    if (id) fillFormById(id);
  });

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isExistingNoodle) {
      save('POST');
      return;
    }
    const name = document.getElementById('name').value;
    const overwrite = await confirmAction({
      message: `"${name}" already exists. Overwrite it?`,
      label: 'Update'
    });
    if (overwrite) save('PUT');
  });
});
