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
    id: document.getElementById('product-id').value,
    name: document.getElementById('name').value,
    brand: document.getElementById('brand').value,
    keywords: document.getElementById('keywords').value.split(',').map(k => k.trim()),
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
    const msg = res.status === 401 ? 'Not authorised.' : `Error ${res.status} — changes not saved.`;
    showToast(msg, 'error');
    return;
  }

  showToast(method === 'PUT' ? 'Noodle updated.' : 'Noodle added.', 'success');
  document.getElementById('add-form').reset();
  isExistingNoodle = false;
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

    const spiceInput = document.querySelector(`input[name="spice"][value="${n.spicy}"]`);
    if (spiceInput) spiceInput.checked = true;

    const ratingInput = document.querySelector(`input[name="rating"][value="${n.rating}"]`);
    if (ratingInput) ratingInput.checked = true;
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

  document.getElementById('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isExistingNoodle) {
      const name = document.getElementById('name').value;
      document.getElementById('confirm-message').textContent = `"${name}" already exists. Overwrite it?`;
      document.getElementById('confirm-dialog').classList.add('visible');
    } else {
      save('POST');
    }
  });

  document.getElementById('confirm-ok').addEventListener('click', () => {
    document.getElementById('confirm-dialog').classList.remove('visible');
    save('PUT');
  });

  document.getElementById('confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-dialog').classList.remove('visible');
  });
});
